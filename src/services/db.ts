import { config } from './config.js';

// Multi-DB support: MySQL, PostgreSQL, Neon (serverless Postgres)
// User picks during `freestack team setup`

export type Role = 'ANON' | 'TEAM' | 'GROUP' | 'ADMIN';
export type DbType = 'mysql' | 'postgres' | 'neon' | 'd1';

export interface DbConfig {
  type: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;       // true for Neon
  connectionString?: string; // for Neon
  // D1 fields
  d1AccountId?: string;    // Cloudflare Account ID
  d1ApiToken?: string;     // Cloudflare API Token
  d1DatabaseId?: string;   // D1 Database UUID
}

// ─── Unified query interface ───

let _query: ((sql: string, params?: any[]) => Promise<any[]>) | null = null;
let _cleanup: (() => Promise<void>) | null = null;

async function getQuery() {
  if (_query) return _query;

  const db = config.get('db') as any as DbConfig;
  if (!db?.type) throw new Error('DB not configured. Run: freestack team setup');

  if (db.type === 'd1') {
    // Cloudflare D1 via REST API
    const accountId = db.d1AccountId;
    const apiToken = db.d1ApiToken;
    const databaseId = db.d1DatabaseId;
    if (!accountId || !apiToken || !databaseId) {
      throw new Error('D1 설정 불완전. Run: freestack team setup');
    }
    const d1Url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

    _query = async (sql, params) => {
      const body: any = { sql };
      if (params?.length) body.params = params;
      const res = await fetch(d1Url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json() as any;
      if (!json.success) {
        const errMsg = json.errors?.[0]?.message || JSON.stringify(json.errors);
        throw new Error(`D1 error: ${errMsg}`);
      }
      return json.result?.[0]?.results || [];
    };
    _cleanup = async () => {}; // stateless
  } else if (db.type === 'mysql') {
    const mysql = await import('mysql2/promise');
    const pool = mysql.createPool({
      host: db.host,
      port: db.port || 3306,
      user: db.user,
      password: db.password,
      database: db.database || 'freestack',
      connectionLimit: 5,
    });
    _query = async (sql, params) => { const [rows] = await pool.execute(sql, params); return rows as any[]; };
    _cleanup = async () => { await pool.end(); };
  } else {
    // postgres or neon
    const pg = await import('pg');
    const pool = new pg.default.Pool({
      connectionString: db.connectionString || undefined,
      host: db.connectionString ? undefined : db.host,
      port: db.connectionString ? undefined : (db.port || 5432),
      user: db.connectionString ? undefined : db.user,
      password: db.connectionString ? undefined : db.password,
      database: db.connectionString ? undefined : (db.database || 'freestack'),
      ssl: db.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    _query = async (sql, params) => {
      // Convert MySQL ? placeholders to $1,$2,... for pg
      let idx = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
      const result = await pool.query(pgSql, params);
      return result.rows;
    };
    _cleanup = async () => { await pool.end(); };
  }

  return _query;
}

async function query(sql: string, params?: any[]) {
  const q = await getQuery();
  return q(sql, params);
}

export async function testConnection(): Promise<boolean> {
  await query('SELECT 1');
  return true;
}

export async function closePool() {
  if (_cleanup) { await _cleanup(); _query = null; _cleanup = null; }
}

// ─── Schema (MySQL & Postgres compatible) ───

export async function initSchema() {
  const db = config.get('db') as any as DbConfig;
  const isMySQL = db.type === 'mysql';
  const isD1 = db.type === 'd1';

  const autoInc = isD1 ? 'INTEGER PRIMARY KEY AUTOINCREMENT'
    : isMySQL ? 'INT AUTO_INCREMENT' : 'SERIAL';
  const pkSuffix = isD1 ? '' : ' PRIMARY KEY';
  const timestamp = isD1 ? "TEXT DEFAULT (datetime('now'))"
    : isMySQL ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'TIMESTAMPTZ DEFAULT NOW()';
  const onUpdate = isMySQL ? 'ON UPDATE CURRENT_TIMESTAMP' : '';
  const enumRole = isD1 ? "TEXT CHECK (role IN ('ANON','TEAM','GROUP','ADMIN'))"
    : isMySQL ? "ENUM('ANON','TEAM','GROUP','ADMIN')"
    : "VARCHAR(20) CHECK (role IN ('ANON','TEAM','GROUP','ADMIN'))";
  const enumAccess = isD1 ? "TEXT CHECK (access_role IN ('ANON','TEAM','GROUP','ADMIN'))"
    : isMySQL ? "ENUM('ANON','TEAM','GROUP','ADMIN')"
    : "VARCHAR(20) CHECK (access_role IN ('ANON','TEAM','GROUP','ADMIN'))";

  const varchar = (n: number) => isD1 ? 'TEXT' : `VARCHAR(${n})`;

  await query(`
    CREATE TABLE IF NOT EXISTS fs_members (
      id          ${autoInc}${pkSuffix},
      email       ${varchar(255)} NOT NULL UNIQUE,
      name        ${varchar(255)} NOT NULL,
      role        ${enumRole} DEFAULT 'TEAM',
      grp         ${varchar(100)},
      created_at  ${timestamp},
      updated_at  ${timestamp} ${onUpdate}
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS fs_calendar (
      id            ${autoInc}${pkSuffix},
      title         ${varchar(500)} NOT NULL,
      description   TEXT,
      event_date    ${isD1 ? 'TEXT' : 'DATE'} NOT NULL,
      event_time    ${varchar(5)} NOT NULL,
      duration_min  INTEGER DEFAULT 60,
      attendees     TEXT,
      created_by    ${varchar(255)},
      created_at    ${timestamp}
    )
  `);

  // Index on event_date
  if (isMySQL) {
    await query('CREATE INDEX IF NOT EXISTS idx_cal_date ON fs_calendar (event_date)').catch(() => {});
  } else {
    await query('CREATE INDEX IF NOT EXISTS idx_cal_date ON fs_calendar (event_date)').catch(() => {});
  }

  await query(`
    CREATE TABLE IF NOT EXISTS fs_chat_logs (
      id          ${autoInc}${pkSuffix},
      session_id  ${varchar(64)} NOT NULL,
      provider    ${varchar(50)} NOT NULL,
      model       ${varchar(100)} NOT NULL,
      role        ${varchar(20)} NOT NULL,
      content     TEXT NOT NULL,
      tokens      INTEGER DEFAULT 0,
      created_at  ${timestamp}
    )
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_chat_session ON fs_chat_logs (session_id)').catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS fs_files (
      id          ${autoInc}${pkSuffix},
      name        ${varchar(500)} NOT NULL,
      path        ${varchar(1000)} NOT NULL,
      file_size   ${isD1 ? 'INTEGER' : 'BIGINT'},
      mime_type   ${varchar(255)},
      uploaded_by ${varchar(255)},
      access_role ${enumAccess} DEFAULT 'TEAM',
      grp         ${varchar(100)},
      r2_url      ${varchar(2000)},
      created_at  ${timestamp}
    )
  `);
}

// ─── Team CRUD ───

export async function addMember(m: { email: string; name: string; role?: Role; grp?: string | null }) {
  return query(
    'INSERT INTO fs_members (email, name, role, grp) VALUES (?, ?, ?, ?)',
    [m.email, m.name, m.role || 'TEAM', m.grp || null],
  );
}

export async function listMembers(role?: Role) {
  return role
    ? query('SELECT * FROM fs_members WHERE role = ? ORDER BY name', [role])
    : query('SELECT * FROM fs_members ORDER BY name');
}

export async function getMember(email: string) {
  const rows = await query('SELECT * FROM fs_members WHERE email = ?', [email]);
  return rows[0] || null;
}

export async function updateMemberRole(email: string, role: Role) {
  return query('UPDATE fs_members SET role = ? WHERE email = ?', [role, email]);
}

export async function removeMember(email: string) {
  return query('DELETE FROM fs_members WHERE email = ?', [email]);
}

// ─── Calendar CRUD ───

export async function addEvent(e: { title: string; description?: string; date: string; time: string; duration_min: number; attendees: string[]; created_by: string }) {
  return query(
    'INSERT INTO fs_calendar (title, description, event_date, event_time, duration_min, attendees, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [e.title, e.description || null, e.date, e.time, e.duration_min, JSON.stringify(e.attendees), e.created_by],
  );
}

export async function listEvents(opts?: { date?: string; week?: boolean }) {
  const db = config.get('db') as any as DbConfig;
  const isMySQL = db.type === 'mysql';
  const isD1 = db.type === 'd1';

  if (opts?.date) {
    return query('SELECT * FROM fs_calendar WHERE event_date = ? ORDER BY event_time', [opts.date]);
  }
  if (opts?.week) {
    const weekEnd = isD1 ? "date('now', '+7 days')"
      : isMySQL ? 'DATE_ADD(CURDATE(), INTERVAL 7 DAY)'
      : "CURRENT_DATE + INTERVAL '7 days'";
    const curDate = isD1 ? "date('now')" : isMySQL ? 'CURDATE()' : 'CURRENT_DATE';
    return query(`SELECT * FROM fs_calendar WHERE event_date BETWEEN ${curDate} AND ${weekEnd} ORDER BY event_date, event_time`);
  }
  return query('SELECT * FROM fs_calendar ORDER BY event_date DESC, event_time LIMIT 50');
}

export async function removeEvent(id: number) {
  return query('DELETE FROM fs_calendar WHERE id = ?', [id]);
}

// ─── File records ───

export async function addFileRecord(f: { name: string; path: string; size: number; mime_type: string; uploaded_by: string; access_role: Role; group?: string; r2_url: string }) {
  return query(
    'INSERT INTO fs_files (name, path, file_size, mime_type, uploaded_by, access_role, grp, r2_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [f.name, f.path, f.size, f.mime_type, f.uploaded_by, f.access_role, f.group || null, f.r2_url],
  );
}

export async function listFiles(opts?: { role?: Role; group?: string }) {
  if (opts?.group) return query('SELECT * FROM fs_files WHERE grp = ? ORDER BY created_at DESC', [opts.group]);
  if (opts?.role) return query('SELECT * FROM fs_files WHERE access_role = ? ORDER BY created_at DESC', [opts.role]);
  return query('SELECT * FROM fs_files ORDER BY created_at DESC LIMIT 50');
}

export async function removeFileRecord(id: number) {
  return query('DELETE FROM fs_files WHERE id = ?', [id]);
}

// ─── AI Chat Logs ───

export async function addChatLog(log: {
  session_id: string;
  provider: string;
  model: string;
  role: string;
  content: string;
  tokens?: number;
}) {
  return query(
    'INSERT INTO fs_chat_logs (session_id, provider, model, role, content, tokens) VALUES (?, ?, ?, ?, ?, ?)',
    [log.session_id, log.provider, log.model, log.role, log.content, log.tokens || 0],
  );
}

export async function listChatSessions(limit = 20) {
  const db = config.get('db') as any as DbConfig;
  const isMySQL = db.type === 'mysql';
  const isD1 = db.type === 'd1';

  const substr = isMySQL ? 'SUBSTRING' : isD1 ? 'substr' : 'LEFT';
  const substrExpr = isMySQL
    ? "SUBSTRING(MIN(CASE WHEN role='user' THEN content END), 1, 100)"
    : isD1
    ? "substr(MIN(CASE WHEN role='user' THEN content END), 1, 100)"
    : "LEFT(MIN(CASE WHEN role='user' THEN content END), 100)";

  return query(
    `SELECT session_id, provider, model, MIN(created_at) as started_at,
            COUNT(*) as msg_count,
            ${substrExpr} as first_msg
     FROM fs_chat_logs GROUP BY session_id, provider, model
     ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
}

export async function getChatSession(sessionId: string) {
  return query(
    'SELECT * FROM fs_chat_logs WHERE session_id = ? ORDER BY created_at',
    [sessionId],
  );
}

export async function searchChatLogs(keyword: string, limit = 20) {
  return query(
    'SELECT * FROM fs_chat_logs WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?',
    [`%${keyword}%`, limit],
  );
}

export async function deleteChatSession(sessionId: string) {
  return query('DELETE FROM fs_chat_logs WHERE session_id = ?', [sessionId]);
}

// ─── Role check ───

const ROLE_LEVEL: Record<Role, number> = { ANON: 0, TEAM: 1, GROUP: 2, ADMIN: 3 };

export function hasAccess(userRole: Role, requiredRole: Role): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}
