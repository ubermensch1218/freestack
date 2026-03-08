import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { config } from '../services/config.js';
import * as db from '../services/db.js';
import * as ui from '../utils/ui.js';

export const teamCommand = new Command('team')
  .description('팀 멤버 및 역할 관리');

teamCommand
  .command('setup')
  .description('Oracle Autonomous DB 연결 + 스키마 생성')
  .action(async () => {
    ui.heading('데이터베이스 설정');
    console.log();

    const existing = config.get('db') as any;

    const { dbType } = await inquirer.prompt([{
      type: 'list',
      name: 'dbType',
      message: 'DB 엔진 선택:',
      choices: [
        { name: `Cloudflare D1 - 서버리스 SQLite (무료 5GB, 서버 불필요) ${chalk.green('추천')}`, value: 'd1' },
        { name: `MySQL         - Oracle VM에 직접 설치 (빠름)`, value: 'mysql' },
        { name: `PostgreSQL    - Oracle VM에 직접 설치`, value: 'postgres' },
        { name: `Neon          - 서버리스 Postgres (neon.tech, 무료 0.5GB)`, value: 'neon' },
      ],
      default: existing?.type || 'd1',
    }]);

    let dbConfig: any = { type: dbType };

    if (dbType === 'd1') {
      ui.info('Cloudflare D1 무료 티어: 5GB 스토리지, 5M reads/day, 100K writes/day');
      ui.info('서버 없이 Cloudflare API로 직접 쿼리합니다.');
      console.log();

      // Try to reuse Cloudflare keys from config
      const cfConfig = config.get('cloudflare') as any;
      const existingKeys = config.get('keys') as any;

      const d1Answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'accountId',
          message: 'Cloudflare Account ID:',
          default: existing?.d1AccountId || cfConfig?.accountId || existingKeys?.cloudflareAccountId,
          validate: (v: string) => !!v || 'Account ID 필수',
        },
        {
          type: 'input',
          name: 'apiToken',
          message: 'Cloudflare API Token (D1 권한 포함):',
          default: existing?.d1ApiToken || cfConfig?.apiToken || existingKeys?.cloudflare,
          validate: (v: string) => !!v || 'API Token 필수',
        },
      ]);

      // List existing D1 databases or create new one
      const listSpinner = ora('D1 데이터베이스 조회 중...').start();
      try {
        const listRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${d1Answers.accountId}/d1/database`,
          { headers: { 'Authorization': `Bearer ${d1Answers.apiToken}` } },
        );
        const listJson = await listRes.json() as any;
        listSpinner.stop();

        if (!listJson.success) throw new Error(listJson.errors?.[0]?.message || 'API 오류');

        const databases = listJson.result || [];
        const fsDb = databases.find((d: any) => d.name === 'freestack');

        let databaseId: string;

        if (fsDb) {
          ui.success(`기존 D1 DB 발견: freestack (${fsDb.uuid})`);
          databaseId = fsDb.uuid;
        } else {
          const { createNew } = await inquirer.prompt([{
            type: 'confirm',
            name: 'createNew',
            message: 'freestack D1 데이터베이스를 새로 생성할까요?',
            default: true,
          }]);

          if (createNew) {
            const createSpinner = ora('D1 데이터베이스 생성 중...').start();
            const createRes = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${d1Answers.accountId}/d1/database`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${d1Answers.apiToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: 'freestack' }),
              },
            );
            const createJson = await createRes.json() as any;
            if (!createJson.success) throw new Error(createJson.errors?.[0]?.message || '생성 실패');
            databaseId = createJson.result.uuid;
            createSpinner.succeed(`D1 DB 생성 완료: freestack (${databaseId})`);
          } else {
            // Choose from existing
            if (!databases.length) {
              ui.error('기존 D1 DB가 없습니다. 생성을 선택해주세요.');
              return;
            }
            const { selectedDb } = await inquirer.prompt([{
              type: 'list',
              name: 'selectedDb',
              message: '사용할 D1 DB 선택:',
              choices: databases.map((d: any) => ({ name: `${d.name} (${d.uuid.substring(0, 8)}...)`, value: d.uuid })),
            }]);
            databaseId = selectedDb;
          }
        }

        dbConfig = {
          type: 'd1',
          d1AccountId: d1Answers.accountId,
          d1ApiToken: d1Answers.apiToken,
          d1DatabaseId: databaseId,
        };
      } catch (e: any) {
        listSpinner.stop();
        ui.error(`D1 API 오류: ${e.message}`);
        ui.info('Cloudflare Dashboard > D1에서 직접 생성 후 UUID를 입력하세요.');
        const { manualId } = await inquirer.prompt([{
          type: 'input',
          name: 'manualId',
          message: 'D1 Database UUID:',
        }]);
        if (!manualId) return;
        dbConfig = {
          type: 'd1',
          d1AccountId: d1Answers.accountId,
          d1ApiToken: d1Answers.apiToken,
          d1DatabaseId: manualId,
        };
      }
    } else if (dbType === 'neon') {
      ui.info('Neon 무료 티어: 0.5GB 스토리지, 190시간/월 컴퓨트');
      ui.info('가입: https://neon.tech');
      console.log();

      const neonAnswers = await inquirer.prompt([{
        type: 'input',
        name: 'connectionString',
        message: 'Neon Connection String (postgresql://...):',
        default: existing?.connectionString,
        validate: (v: string) => v.startsWith('postgresql://') || v.startsWith('postgres://') || 'postgresql://로 시작해야 합니다',
      }]);
      dbConfig = { ...dbConfig, ...neonAnswers, ssl: true };
    } else {
      const tsConfig = config.get('tailscale') as any;
      const defaultHost = tsConfig?.serverTailscaleIp || (config.get('openclaw') as any)?.serverIp || 'localhost';

      const connAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'host',
          message: `DB Host (Tailscale IP 권장):`,
          default: existing?.host || defaultHost,
        },
        {
          type: 'number',
          name: 'port',
          message: 'Port:',
          default: existing?.port || (dbType === 'mysql' ? 3306 : 5432),
        },
        {
          type: 'input',
          name: 'user',
          message: 'Username:',
          default: existing?.user || (dbType === 'mysql' ? 'freestack' : 'postgres'),
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
        },
        {
          type: 'input',
          name: 'database',
          message: 'Database:',
          default: existing?.database || 'freestack',
        },
      ]);
      dbConfig = { ...dbConfig, ...connAnswers };

      // Offer to install DB on Oracle VM
      const ocConfig = config.get('openclaw') as any;
      if (ocConfig?.serverIp) {
        const { installOnServer } = await inquirer.prompt([{
          type: 'confirm',
          name: 'installOnServer',
          message: `Oracle VM (${ocConfig.serverIp})에 ${dbType === 'mysql' ? 'MySQL' : 'PostgreSQL'} 설치할까요?`,
          default: false,
        }]);
        if (installOnServer) {
          const { execSync } = await import('child_process');
          const keyFlag = ocConfig.sshKeyPath ? `-i ${ocConfig.sshKeyPath}` : '';
          const sshCmd = (cmd: string) => execSync(`ssh -o StrictHostKeyChecking=no ${keyFlag} ubuntu@${ocConfig.serverIp} '${cmd}'`, { encoding: 'utf-8', timeout: 120000 });

          const installSpinner = ora(`${dbType} 설치 중...`).start();
          try {
            if (dbType === 'mysql') {
              sshCmd('sudo apt-get update -qq && sudo apt-get install -y -qq mysql-server');
              sshCmd(`sudo mysql -e "CREATE DATABASE IF NOT EXISTS ${connAnswers.database}; CREATE USER IF NOT EXISTS '${connAnswers.user}'@'%' IDENTIFIED BY '${connAnswers.password}'; GRANT ALL ON ${connAnswers.database}.* TO '${connAnswers.user}'@'%'; FLUSH PRIVILEGES;"`);
              sshCmd("sudo sed -i 's/bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf && sudo systemctl restart mysql");
            } else {
              sshCmd('sudo apt-get update -qq && sudo apt-get install -y -qq postgresql');
              sshCmd(`sudo -u postgres psql -c "CREATE DATABASE ${connAnswers.database};" 2>/dev/null; sudo -u postgres psql -c "CREATE USER ${connAnswers.user} WITH PASSWORD '${connAnswers.password}';" 2>/dev/null; sudo -u postgres psql -c "GRANT ALL ON DATABASE ${connAnswers.database} TO ${connAnswers.user};"`);
              sshCmd("echo \"listen_addresses = '*'\" | sudo tee -a /etc/postgresql/*/main/postgresql.conf && echo 'host all all 0.0.0.0/0 md5' | sudo tee -a /etc/postgresql/*/main/pg_hba.conf && sudo systemctl restart postgresql");
            }
            installSpinner.succeed(`${dbType} 서버 설치 + 유저/DB 생성 완료`);
          } catch (e: any) {
            installSpinner.fail(`설치 실패: ${e.message}`);
          }
        }
      }
    }

    config.set('db' as any, dbConfig);

    const spinner = ora('DB 연결 + 스키마 생성 중...').start();
    try {
      await db.testConnection();
      await db.initSchema();
      spinner.succeed('스키마 생성 완료 (fs_members, fs_calendar, fs_chat_logs, fs_files)');
    } catch (e: any) {
      spinner.fail(`DB 연결 실패: ${e.message}`);
      if (dbType === 'd1') ui.info('Cloudflare Account ID, API Token, D1 Database UUID를 확인하세요.');
      else if (dbType === 'neon') ui.info('Connection String을 확인하세요.');
      else ui.info('호스트/포트/인증 정보를 확인하세요. Tailscale VPN 연결 상태도 확인.');
    }
  });

teamCommand
  .command('add')
  .description('팀 멤버 추가')
  .option('-e, --email <email>', '이메일')
  .option('-n, --name <name>', '이름')
  .option('-r, --role <role>', '역할 (ANON/TEAM/GROUP/ADMIN)', 'TEAM')
  .option('-g, --group <group>', '그룹')
  .action(async (opts) => {
    const answers = await inquirer.prompt([
      ...(!opts.email ? [{ type: 'input', name: 'email', message: '이메일:', validate: (v: string) => v.includes('@') || '이메일 형식' }] : []),
      ...(!opts.name ? [{ type: 'input', name: 'name', message: '이름:' }] : []),
      ...(!opts.role || opts.role === 'TEAM' ? [{
        type: 'list', name: 'role', message: '역할:',
        choices: [
          { name: 'TEAM - 일반 팀원', value: 'TEAM' },
          { name: 'GROUP - 그룹 관리자', value: 'GROUP' },
          { name: 'ADMIN - 전체 관리자', value: 'ADMIN' },
        ],
        default: 'TEAM',
      }] : []),
    ]);

    const spinner = ora('멤버 추가 중...').start();
    try {
      await db.addMember({
        email: opts.email || answers.email,
        name: opts.name || answers.name,
        role: opts.role !== 'TEAM' ? opts.role : (answers.role || 'TEAM'),
        grp: opts.group || answers.group,
      });
      spinner.succeed(`멤버 추가됨: ${opts.name || answers.name} (${opts.role !== 'TEAM' ? opts.role : (answers.role || 'TEAM')})`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

teamCommand
  .command('list')
  .description('팀 멤버 목록')
  .option('-r, --role <role>', '역할 필터')
  .action(async (opts) => {
    const spinner = ora('멤버 조회 중...').start();
    try {
      const result = await db.listMembers(opts.role);
      spinner.stop();

      const members = result || [];

      if (members.length === 0) {
        ui.info('팀 멤버가 없습니다. freestack team add 로 추가하세요.');
        return;
      }

      ui.heading(`팀 멤버 (${members.length}명)`);
      ui.table(
        ['이름', '이메일', '역할', '그룹'],
        members.map((m: any) => [
          m.name,
          m.email,
          roleBadge(m.role),
          m.grp || chalk.dim('-'),
        ]),
      );
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

teamCommand
  .command('role <email> <role>')
  .description('멤버 역할 변경')
  .action(async (email: string, role: string) => {
    const validRoles = ['ANON', 'TEAM', 'GROUP', 'ADMIN'];
    if (!validRoles.includes(role.toUpperCase())) {
      ui.error(`유효한 역할: ${validRoles.join(', ')}`);
      return;
    }
    const spinner = ora(`역할 변경: ${email} → ${role.toUpperCase()}`).start();
    try {
      await db.updateMemberRole(email, role.toUpperCase() as db.Role);
      spinner.succeed(`역할 변경 완료: ${email} → ${role.toUpperCase()}`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

teamCommand
  .command('remove <email>')
  .description('멤버 제거')
  .action(async (email: string) => {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `정말 ${email} 멤버를 제거할까요?`,
      default: false,
    }]);
    if (!confirm) return;

    const spinner = ora('멤버 제거 중...').start();
    try {
      await db.removeMember(email);
      spinner.succeed(`멤버 제거됨: ${email}`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

function roleBadge(role: string): string {
  switch (role) {
    case 'ADMIN': return chalk.red.bold('ADMIN');
    case 'GROUP': return chalk.yellow('GROUP');
    case 'TEAM': return chalk.cyan('TEAM');
    case 'ANON': return chalk.dim('ANON');
    default: return role;
  }
}
