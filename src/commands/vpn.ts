import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { config } from '../services/config.js';
import * as ui from '../utils/ui.js';

export const vpnCommand = new Command('vpn')
  .description('Tailscale VPN 설정 및 관리');

function sshExec(ip: string, cmd: string, keyPath?: string): string {
  const keyFlag = keyPath ? `-i ${keyPath}` : '';
  return execSync(
    `ssh -o StrictHostKeyChecking=no ${keyFlag} ubuntu@${ip} '${cmd}'`,
    { encoding: 'utf-8', timeout: 120000 },
  );
}

function localExec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
}

vpnCommand
  .command('setup')
  .description('Tailscale VPN 설정 (로컬 + Oracle VM)')
  .option('--server-only', '서버에만 설치', false)
  .option('--local-only', '로컬에만 설치', false)
  .action(async (opts) => {
    console.log();
    ui.heading('Tailscale VPN 설정');
    ui.info('무료 플랜: 3유저, 100디바이스');
    console.log();

    const { authKey } = await inquirer.prompt([{
      type: 'input',
      name: 'authKey',
      message: 'Tailscale Auth Key (https://login.tailscale.com/admin/settings/keys):',
      validate: (v: string) => v.startsWith('tskey-') || v === 'browser' || 'tskey-로 시작하는 키 또는 "browser" 입력 (브라우저 인증)',
    }]);

    const useAuthKey = authKey !== 'browser';

    // Local setup
    if (!opts.serverOnly) {
      ui.heading('로컬 Tailscale 설정');
      const localSpinner = ora('Tailscale 확인 중...').start();

      try {
        localExec('which tailscale');
        localSpinner.succeed('Tailscale 이미 설치됨');
      } catch {
        localSpinner.text = 'Tailscale 설치 중...';
        const platform = process.platform;
        try {
          if (platform === 'darwin') {
            localSpinner.info('macOS: Tailscale 앱을 설치해주세요');
            ui.info('  brew install --cask tailscale');
            ui.info('  또는 App Store에서 "Tailscale" 검색');
          } else if (platform === 'linux') {
            localExec('curl -fsSL https://tailscale.com/install.sh | sh');
            localSpinner.succeed('Tailscale 설치 완료');
          } else {
            localSpinner.info('https://tailscale.com/download 에서 설치해주세요');
          }
        } catch (e: any) {
          localSpinner.warn(`로컬 설치: ${e.message}`);
        }
      }

      // Check local status
      try {
        const status = localExec('tailscale status --json 2>/dev/null || echo "{}"');
        const parsed = JSON.parse(status);
        if (parsed.Self) {
          ui.success(`로컬 Tailscale 연결됨: ${chalk.cyan(parsed.Self.HostName)} (${parsed.Self.TailscaleIPs?.[0] || '-'})`);
        }
      } catch {}
    }

    // Server setup
    if (!opts.localOnly) {
      const ocConfig = config.get('openclaw') as any;
      const oracleConfig = config.get('oracle') as any;

      let serverIp = ocConfig?.serverIp;
      let keyPath = ocConfig?.sshKeyPath;

      if (!serverIp) {
        const serverAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'ip',
            message: 'Oracle VM Public IP:',
            validate: (v: string) => /^\d+\.\d+\.\d+\.\d+$/.test(v) || 'IP 주소 형식이 아닙니다',
          },
          {
            type: 'input',
            name: 'key',
            message: 'SSH Private Key 경로:',
            default: '~/.ssh/id_rsa',
          },
        ]);
        serverIp = serverAnswers.ip;
        keyPath = serverAnswers.key;
      }

      ui.heading('서버 Tailscale 설정');

      // Install Tailscale on server
      const serverSpinner = ora('서버에 Tailscale 설치 중...').start();
      try {
        sshExec(serverIp, 'which tailscale || (curl -fsSL https://tailscale.com/install.sh | sh)', keyPath);
        serverSpinner.succeed('서버 Tailscale 설치 완료');
      } catch (e: any) {
        serverSpinner.fail(`서버 설치 실패: ${e.message}`);
        return;
      }

      // Connect server to tailnet
      const connectSpinner = ora('서버를 Tailnet에 연결 중...').start();
      try {
        if (useAuthKey) {
          sshExec(serverIp, `sudo tailscale up --authkey=${authKey} --hostname=freestack-server`, keyPath);
          connectSpinner.succeed('서버 Tailnet 연결 완료');
        } else {
          connectSpinner.info('서버에서 브라우저 인증이 필요합니다:');
          const output = sshExec(serverIp, 'sudo tailscale up --hostname=freestack-server 2>&1 || true', keyPath);
          console.log(output);
          ui.info('위 URL을 브라우저에서 열어 인증하세요.');
        }
      } catch (e: any) {
        connectSpinner.warn(`연결: ${e.message}`);
      }

      // Get Tailscale IP
      try {
        const tsIp = sshExec(serverIp, 'tailscale ip -4', keyPath).trim();
        if (tsIp) {
          config.set('tailscale' as any, {
            serverTailscaleIp: tsIp,
            serverPublicIp: serverIp,
          });
          console.log();
          ui.success(`서버 Tailscale IP: ${chalk.cyan(tsIp)}`);
          ui.info(`이제 VPN 경유로 접근 가능:`);
          ui.info(`  OpenClaw: http://${tsIp}:3777`);
          ui.info(`  SSH:      ssh ubuntu@${tsIp}`);
        }
      } catch {}

      // Recommend closing public ports
      console.log();
      ui.heading('보안 권장사항');
      ui.warn('Tailscale 연결 완료 후 Oracle VM 보안 목록에서 불필요한 공개 포트를 닫으세요.');
      ui.info('  필수: 22 (SSH) - Tailscale 경유로 전환 후 닫기 가능');
      ui.info('  선택: 3777 (OpenClaw) - Tailscale로만 접근 시 닫기');
      ui.info('  유지: 41641/UDP (Tailscale WireGuard)');
    }

    config.set('tailscale.enabled' as any, true);
    console.log();
    ui.success('Tailscale VPN 설정 완료!');
    ui.info('상태 확인: freestack vpn status');
  });

vpnCommand
  .command('status')
  .description('Tailscale 네트워크 상태')
  .action(async () => {
    // Local status
    ui.heading('Tailscale 네트워크');

    try {
      const status = localExec('tailscale status 2>/dev/null');
      console.log(status);
    } catch {
      ui.warn('로컬 Tailscale이 실행중이지 않습니다.');
      ui.info('시작: tailscale up');
      return;
    }

    // Show saved config
    const tsConfig = config.get('tailscale') as any;
    if (tsConfig?.serverTailscaleIp) {
      console.log();
      ui.keyValue({
        '서버 Tailscale IP': tsConfig.serverTailscaleIp,
        '서버 Public IP': tsConfig.serverPublicIp || '-',
        'OpenClaw (VPN)': `http://${tsConfig.serverTailscaleIp}:3777`,
      });
    }
  });

vpnCommand
  .command('ssh')
  .description('Tailscale VPN 경유로 서버 SSH 접속')
  .action(async () => {
    const tsConfig = config.get('tailscale') as any;
    if (!tsConfig?.serverTailscaleIp) {
      ui.error('Tailscale이 설정되지 않았습니다. freestack vpn setup 먼저.');
      return;
    }

    const ocConfig = config.get('openclaw') as any;
    const keyFlag = ocConfig?.sshKeyPath ? `-i ${ocConfig.sshKeyPath}` : '';

    ui.info(`VPN SSH 접속: ubuntu@${tsConfig.serverTailscaleIp}`);
    try {
      execSync(`ssh ${keyFlag} ubuntu@${tsConfig.serverTailscaleIp}`, {
        stdio: 'inherit',
      });
    } catch {}
  });

vpnCommand
  .command('expose <port>')
  .description('Tailscale Funnel로 포트 외부 공개 (HTTPS)')
  .action(async (port: string) => {
    ui.info(`Tailscale Funnel로 포트 ${port} 공개 중...`);
    ui.info('이 기능은 HTTPS를 자동으로 제공합니다.');
    console.log();

    try {
      execSync(`tailscale funnel ${port}`, { stdio: 'inherit' });
    } catch (e: any) {
      ui.error(`Funnel 실패: ${e.message}`);
      ui.info('Tailscale Funnel은 Personal 플랜에서 사용 가능합니다.');
    }
  });
