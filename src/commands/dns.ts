import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { config } from '../services/config.js';
import * as cf from '../services/cloudflare.js';
import * as resendSvc from '../services/resend.js';
import * as ui from '../utils/ui.js';

export const dnsCommand = new Command('dns')
  .description('DNS 및 도메인 관리');

dnsCommand
  .command('setup')
  .description('Cloudflare DNS 존 설정 + 이메일 라우팅 활성화')
  .action(async () => {
    const domain = config.get('domain');
    if (!domain) { ui.error('도메인이 설정되지 않았습니다. freestack init 먼저 실행하세요.'); return; }

    const spinner = ora('Cloudflare 존 확인 중...').start();

    try {
      let zone = await cf.getZoneByDomain(domain);

      if (zone) {
        spinner.succeed(`존 발견: ${zone.name} (${zone.id})`);
      } else {
        spinner.text = `존 생성 중: ${domain}`;
        zone = await cf.createZone(domain);
        spinner.succeed(`존 생성됨: ${zone.name} (${zone.id})`);
        ui.info('네임서버를 도메인 등록기관에서 변경하세요:');
        zone.name_servers?.forEach((ns: string) => ui.info(`  ${ns}`));
      }

      config.set('cloudflare.zoneId' as any, zone.id);

      // Enable email routing
      const { enableEmail } = await inquirer.prompt([{
        type: 'confirm',
        name: 'enableEmail',
        message: 'Email Routing을 활성화하시겠습니까?',
        default: true,
      }]);

      if (enableEmail) {
        const emailSpinner = ora('Email Routing 활성화 중...').start();
        try {
          await cf.enableEmailRouting(zone.id);
          emailSpinner.succeed('Email Routing 활성화 완료');
        } catch (e: any) {
          emailSpinner.warn(`Email Routing: ${e.message}`);
        }

        const { forwardTo } = await inquirer.prompt([{
          type: 'input',
          name: 'forwardTo',
          message: '메일 전달할 개인 이메일 주소:',
          validate: (v: string) => v.includes('@') || '유효한 이메일을 입력하세요',
        }]);

        // Add destination address
        const destSpinner = ora('전달 주소 등록 중...').start();
        try {
          const accountId = config.get('cloudflare')!.accountId;
          await cf.createEmailDestination(accountId, forwardTo);
          destSpinner.succeed(`전달 주소 등록: ${forwardTo} (인증 메일 확인 필요)`);
        } catch (e: any) {
          destSpinner.warn(`전달 주소: ${e.message}`);
        }

        // Create catch-all rule
        const ruleSpinner = ora('Catch-all 라우팅 규칙 생성 중...').start();
        try {
          await cf.createEmailRoutingRule(zone.id, {
            name: 'Catch-all forward',
            matchers: [{ type: 'all' }],
            actions: [{ type: 'forward', value: [forwardTo] }],
          });
          ruleSpinner.succeed('Catch-all 규칙 생성 완료');
        } catch (e: any) {
          ruleSpinner.warn(`라우팅 규칙: ${e.message}`);
        }

        ui.info(`이제 *@${domain}으로 오는 메일이 ${forwardTo}로 전달됩니다`);
      }
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

dnsCommand
  .command('records')
  .description('DNS 레코드 목록')
  .action(async () => {
    const zoneId = config.get('cloudflare')?.zoneId;
    if (!zoneId) { ui.error('DNS 존이 설정되지 않았습니다. freestack dns setup 먼저.'); return; }

    const spinner = ora('DNS 레코드 조회 중...').start();
    try {
      const records = await cf.listDnsRecords(zoneId);
      spinner.stop();

      ui.heading(`DNS 레코드 (${records.length}개)`);
      ui.table(
        ['Type', 'Name', 'Content', 'Proxied', 'TTL'],
        records.map((r: any) => [
          r.type,
          r.name,
          r.content.length > 40 ? r.content.substring(0, 37) + '...' : r.content,
          r.proxied ? 'Yes' : 'No',
          r.ttl === 1 ? 'Auto' : String(r.ttl),
        ]),
      );
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

dnsCommand
  .command('add')
  .description('DNS 레코드 추가')
  .option('-t, --type <type>', '레코드 타입 (A, CNAME, MX, TXT)', 'A')
  .option('-n, --name <name>', '레코드 이름')
  .option('-c, --content <content>', '레코드 값')
  .option('-p, --priority <priority>', 'MX 우선순위', '10')
  .option('--proxied', 'Cloudflare 프록시 사용', false)
  .action(async (opts) => {
    const zoneId = config.get('cloudflare')?.zoneId;
    if (!zoneId) { ui.error('DNS 존이 설정되지 않았습니다.'); return; }

    const answers = await inquirer.prompt([
      ...(!opts.name ? [{
        type: 'input', name: 'name', message: '레코드 이름 (예: @, www, mail):',
      }] : []),
      ...(!opts.content ? [{
        type: 'input', name: 'content', message: '레코드 값:',
      }] : []),
    ]);

    const spinner = ora('레코드 추가 중...').start();
    try {
      const record = await cf.createDnsRecord(zoneId, {
        type: opts.type,
        name: opts.name || answers.name,
        content: opts.content || answers.content,
        priority: opts.type === 'MX' ? parseInt(opts.priority) : undefined,
        proxied: opts.proxied,
      });
      spinner.succeed(`레코드 추가됨: ${record.type} ${record.name} → ${record.content}`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

dnsCommand
  .command('resend-verify')
  .description('Resend 도메인 등록 및 DNS 레코드 자동 추가')
  .action(async () => {
    const domain = config.get('domain');
    const zoneId = config.get('cloudflare')?.zoneId;
    if (!domain || !zoneId) {
      ui.error('도메인과 Cloudflare가 설정되어야 합니다.');
      return;
    }

    const spinner = ora('Resend에 도메인 등록 중...').start();
    try {
      const domainData = await resendSvc.addDomain(domain);
      spinner.succeed(`Resend 도메인 등록: ${domain}`);

      if (domainData?.records) {
        ui.heading('필요한 DNS 레코드 자동 추가 중...');
        for (const rec of domainData.records) {
          const recSpinner = ora(`${rec.type} ${rec.name}...`).start();
          try {
            await cf.createDnsRecord(zoneId, {
              type: rec.type,
              name: rec.name,
              content: rec.value,
              priority: rec.priority,
            });
            recSpinner.succeed(`${rec.type} ${rec.name} 추가됨`);
          } catch (e: any) {
            recSpinner.warn(`${rec.name}: ${e.message}`);
          }
        }

        ui.info('DNS 전파까지 최대 48시간 소요될 수 있습니다.');
        ui.info('확인: freestack dns records');
      }
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });
