import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { config } from '../services/config.js';
import * as resendSvc from '../services/resend.js';
import * as ui from '../utils/ui.js';

export const mailCommand = new Command('mail')
  .description('이메일 관리 (발송/수신함/읽기)');

mailCommand
  .command('send')
  .description('이메일 발송')
  .option('-t, --to <email>', '수신자')
  .option('-s, --subject <subject>', '제목')
  .option('-b, --body <body>', '본문')
  .action(async (opts) => {
    const answers = await inquirer.prompt([
      ...(!opts.to ? [{
        type: 'input',
        name: 'to',
        message: '수신자 이메일:',
        validate: (v: string) => v.includes('@') || '유효한 이메일을 입력하세요',
      }] : []),
      ...(!opts.subject ? [{
        type: 'input',
        name: 'subject',
        message: '제목:',
        validate: (v: string) => v.length > 0 || '제목을 입력하세요',
      }] : []),
      ...(!opts.body ? [{
        type: 'editor',
        name: 'body',
        message: '본문 작성 (에디터가 열립니다):',
      }] : []),
    ]);

    const to = opts.to || answers.to;
    const subject = opts.subject || answers.subject;
    const body = opts.body || answers.body;

    const spinner = ora('메일 발송 중...').start();
    try {
      const result = await resendSvc.sendEmail({
        to,
        subject,
        text: body,
      });
      spinner.succeed(`메일 발송 완료! ID: ${result?.id}`);
      ui.keyValue({
        '수신자': to,
        '제목': subject,
        '발신자': config.get('mail')?.fromEmail || `noreply@${config.get('domain')}`,
      });
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

mailCommand
  .command('inbox')
  .description('발송된 이메일 목록 조회')
  .option('-n, --limit <n>', '표시할 이메일 수', '20')
  .action(async (opts) => {
    const spinner = ora('메일 목록 조회 중...').start();
    try {
      const emails = await resendSvc.listEmails();
      spinner.stop();

      if (!emails?.data?.length) {
        ui.info('메일이 없습니다.');
        return;
      }

      const items = emails.data.slice(0, parseInt(opts.limit));

      ui.heading(`메일함 (${items.length}/${emails.data.length}건)`);
      ui.table(
        ['ID', '날짜', '수신자', '제목', '상태'],
        items.map((e: any) => [
          chalk.dim(e.id?.substring(0, 8) || '-'),
          new Date(e.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
          Array.isArray(e.to) ? e.to.join(', ') : (e.to || '-'),
          e.subject || chalk.dim('(제목 없음)'),
          statusBadge(e.last_event),
        ]),
      );

      ui.info('상세 보기: freestack mail read <ID>');
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

mailCommand
  .command('read <emailId>')
  .description('이메일 상세 보기')
  .action(async (emailId: string) => {
    const spinner = ora('메일 조회 중...').start();
    try {
      // If short ID given, try to find full ID from list
      let fullId = emailId;
      if (emailId.length < 36) {
        const emails = await resendSvc.listEmails();
        const match = emails?.data?.find((e: any) => e.id?.startsWith(emailId));
        if (match) fullId = match.id;
      }

      const email = await resendSvc.getEmail(fullId);
      spinner.stop();

      if (!email) {
        ui.error('메일을 찾을 수 없습니다.');
        return;
      }

      console.log();
      console.log(chalk.bold('━'.repeat(60)));
      ui.keyValue({
        'ID': (email as any).id || '-',
        '발신': (email as any).from || '-',
        '수신': Array.isArray((email as any).to) ? (email as any).to.join(', ') : ((email as any).to || '-'),
        '제목': (email as any).subject || '-',
        '날짜': (email as any).created_at
          ? new Date((email as any).created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
          : '-',
        '상태': statusBadge((email as any).last_event),
      });
      console.log(chalk.bold('━'.repeat(60)));

      if ((email as any).text) {
        console.log();
        console.log((email as any).text);
      } else if ((email as any).html) {
        console.log();
        ui.info('HTML 메일 (텍스트 변환):');
        // Simple HTML to text
        const text = (email as any).html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        console.log(text.trim());
      }
      console.log();
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

mailCommand
  .command('domains')
  .description('Resend 도메인 목록')
  .action(async () => {
    const spinner = ora('도메인 목록 조회 중...').start();
    try {
      const domains = await resendSvc.listDomains();
      spinner.stop();

      if (!domains?.data?.length) {
        ui.info('등록된 도메인이 없습니다.');
        ui.info('등록: freestack dns resend-verify');
        return;
      }

      ui.heading('Resend 도메인');
      ui.table(
        ['ID', '도메인', '상태', '리전'],
        domains.data.map((d: any) => [
          d.id?.substring(0, 8) || '-',
          d.name,
          statusBadge(d.status),
          d.region || '-',
        ]),
      );
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

function statusBadge(status?: string): string {
  if (!status) return chalk.dim('unknown');
  switch (status) {
    case 'delivered': return chalk.green('delivered');
    case 'sent': return chalk.cyan('sent');
    case 'opened': return chalk.green.bold('opened');
    case 'clicked': return chalk.green.bold('clicked');
    case 'bounced': return chalk.red('bounced');
    case 'complained': return chalk.red('complained');
    case 'verified': return chalk.green('verified');
    case 'pending': return chalk.yellow('pending');
    case 'not_started': return chalk.dim('not_started');
    default: return chalk.dim(status);
  }
}
