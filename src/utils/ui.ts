import chalk from 'chalk';
import Table from 'cli-table3';

export const logo = `
  ╔═══════════════════════════════════╗
  ║   ${chalk.bold.cyan('freestack')}  ${chalk.dim('v0.1.0')}              ║
  ║   ${chalk.dim('Free-tier workspace bootstrap')}   ║
  ╚═══════════════════════════════════╝
`;

export function success(msg: string) {
  console.log(chalk.green('✓'), msg);
}

export function error(msg: string) {
  console.log(chalk.red('✗'), msg);
}

export function info(msg: string) {
  console.log(chalk.blue('ℹ'), msg);
}

export function warn(msg: string) {
  console.log(chalk.yellow('⚠'), msg);
}

export function heading(msg: string) {
  console.log('\n' + chalk.bold.underline(msg));
}

export function table(headers: string[], rows: string[][]) {
  const t = new Table({
    head: headers.map(h => chalk.cyan(h)),
    style: { head: [], border: ['dim'] },
  });
  rows.forEach(r => t.push(r));
  console.log(t.toString());
}

export function keyValue(pairs: Record<string, string>) {
  const maxKey = Math.max(...Object.keys(pairs).map(k => k.length));
  for (const [k, v] of Object.entries(pairs)) {
    console.log(`  ${chalk.dim(k.padEnd(maxKey))}  ${v}`);
  }
}

export function emailPreview(email: {
  id: string;
  from: string;
  to: string;
  subject: string;
  created_at: string;
}) {
  const date = new Date(email.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  return [
    chalk.dim(email.id.substring(0, 8)),
    date,
    chalk.bold(email.from || '-'),
    email.to || '-',
    email.subject || chalk.dim('(제목 없음)'),
  ];
}

export function freeTierSummary() {
  heading('Free Tier 현황');
  table(
    ['서비스', '무료 혜택', '용도'],
    [
      ['Cloudflare', 'DNS, CDN, Email Routing, Pages, R2(10GB)', 'DNS + 메일 수신 + 웹호스팅'],
      ['Resend', '100통/일, 3,000통/월', '메일 발송 (SMTP)'],
      ['Oracle Cloud', 'ARM 4C/24GB + AMD 2대 + 200GB + DB 2개', '서버/DB/VPN/LB'],
      ['  - OCI Email', '3,000건/월', '메일 발송 (대안)'],
      ['  - OCI NoSQL', '1.33억 R/W, 75GB', '데이터 저장'],
      ['  - OCI Network', 'LB 10Mbps + 10TB 아웃바운드', '트래픽 처리'],
      ['Netlify', '100GB 대역폭, 300분 빌드', '정적 사이트'],
    ],
  );
}
