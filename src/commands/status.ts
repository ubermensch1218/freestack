import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { config } from '../services/config.js';
import { checkOciCli } from '../services/oracle.js';
import * as ui from '../utils/ui.js';

export const statusCommand = new Command('status')
  .description('전체 워크스페이스 현황')
  .action(async () => {
    console.log(ui.logo);
    ui.heading('워크스페이스 현황');
    console.log();

    const domain = config.get('domain');
    const cfConfig = config.get('cloudflare');
    const resendConfig = config.get('resend');
    const oracleConfig = config.get('oracle') as any;
    const mailConfig = config.get('mail');

    // General
    ui.keyValue({
      '도메인': domain || chalk.dim('미설정'),
      '설정 파일': config.path,
    });
    console.log();

    // Services status
    ui.heading('서비스 상태');
    const services: string[][] = [];

    // Cloudflare
    if (cfConfig?.apiToken) {
      const hasZone = !!cfConfig.zoneId;
      services.push([
        'Cloudflare',
        chalk.green('연결됨'),
        hasZone ? `Zone: ${cfConfig.zoneId?.substring(0, 12)}...` : chalk.yellow('존 미설정 (freestack dns setup)'),
      ]);
    } else {
      services.push(['Cloudflare', chalk.dim('미설정'), 'freestack init']);
    }

    // Resend
    if (resendConfig?.apiKey) {
      services.push([
        'Resend',
        chalk.green('연결됨'),
        `발신: ${mailConfig?.fromEmail || 'noreply@' + domain}`,
      ]);
    } else {
      services.push(['Resend', chalk.dim('미설정'), 'freestack init']);
    }

    // Oracle Cloud
    if (oracleConfig?.tenancyOcid) {
      const hasCli = checkOciCli();
      services.push([
        'Oracle Cloud',
        hasCli ? chalk.green('연결됨') : chalk.yellow('CLI 없음'),
        hasCli ? `Region: ${oracleConfig.region}` : 'brew install oci-cli',
      ]);
    } else {
      services.push(['Oracle Cloud', chalk.dim('미설정'), 'freestack init']);
    }

    // OpenClaw
    const ocConfig = config.get('openclaw') as any;
    if (ocConfig?.serverIp) {
      const tsConfig = config.get('tailscale') as any;
      const url = tsConfig?.serverTailscaleIp
        ? `http://${tsConfig.serverTailscaleIp}:3777 (VPN)`
        : `http://${ocConfig.serverIp}:3777`;
      services.push([
        'OpenClaw',
        chalk.green('배포됨'),
        url,
      ]);
    } else {
      services.push(['OpenClaw', chalk.dim('미설정'), 'freestack openclaw deploy']);
    }

    // Tailscale
    const tsConfig = config.get('tailscale') as any;
    if (tsConfig?.enabled) {
      services.push([
        'Tailscale VPN',
        chalk.green('활성'),
        tsConfig.serverTailscaleIp ? `서버: ${tsConfig.serverTailscaleIp}` : '연결됨',
      ]);
    } else {
      services.push(['Tailscale VPN', chalk.dim('미설정'), 'freestack vpn setup']);
    }

    ui.table(['서비스', '상태', '상세'], services);

    // Free tier summary
    ui.freeTierSummary();

    console.log();
    ui.heading('사용 가능한 명령어');
    ui.table(
      ['명령어', '설명'],
      [
        ['freestack init', '초기 설정 / 재설정'],
        ['freestack dns setup', 'Cloudflare DNS + Email Routing'],
        ['freestack dns records', 'DNS 레코드 목록'],
        ['freestack dns resend-verify', 'Resend 도메인 DNS 자동 설정'],
        ['freestack mail send', '이메일 발송'],
        ['freestack mail inbox', '발송 메일 목록'],
        ['freestack mail read <id>', '메일 상세 보기'],
        ['freestack mail domains', 'Resend 도메인 목록'],
        ['freestack server list', 'Oracle Cloud 인스턴스 목록'],
        ['freestack server info', 'Oracle 무료 티어 상세 정보'],
        ['freestack openclaw deploy', 'OpenClaw AI 비서 배포'],
        ['freestack openclaw status', 'OpenClaw 실행 상태'],
        ['freestack openclaw logs', 'OpenClaw 로그 보기'],
        ['freestack vpn setup', 'Tailscale VPN 설정'],
        ['freestack vpn status', 'VPN 네트워크 상태'],
        ['freestack vpn ssh', 'VPN 경유 SSH 접속'],
        ['freestack status', '전체 현황 (이 화면)'],
      ],
    );
  });
