import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { config } from '../services/config.js';
import { getEnvVarsForDeploy } from './keys.js';
import * as ui from '../utils/ui.js';

export const openclawCommand = new Command('openclaw')
  .description('OpenClaw AI 비서 배포 및 관리');

function sshExec(ip: string, cmd: string, keyPath?: string): string {
  const keyFlag = keyPath ? `-i ${keyPath}` : '';
  return execSync(
    `ssh -o StrictHostKeyChecking=no ${keyFlag} ubuntu@${ip} '${cmd}'`,
    { encoding: 'utf-8', timeout: 120000 },
  );
}

openclawCommand
  .command('deploy')
  .description('Oracle VM에 OpenClaw + Ollama 배포')
  .option('--ip <ip>', '서버 IP 주소')
  .option('--key <path>', 'SSH private key 경로')
  .option('--model <model>', 'Ollama 모델', 'llama3.2')
  .option('--skip-ollama', 'Ollama 설치 건너뛰기 (Claude API만 사용)', false)
  .action(async (opts) => {
    const ocConfig = config.get('openclaw') as any;

    const answers = await inquirer.prompt([
      ...(!opts.ip ? [{
        type: 'input',
        name: 'ip',
        message: 'Oracle VM Public IP:',
        default: ocConfig?.serverIp,
        validate: (v: string) => /^\d+\.\d+\.\d+\.\d+$/.test(v) || 'IP 주소 형식이 아닙니다',
      }] : []),
      ...(!opts.key ? [{
        type: 'input',
        name: 'key',
        message: 'SSH Private Key 경로:',
        default: ocConfig?.sshKeyPath || '~/.ssh/id_rsa',
      }] : []),
      {
        type: 'list',
        name: 'provider',
        message: 'AI 프로바이더 선택:',
        choices: [
          { name: 'Claude API (Anthropic) - 추천', value: 'anthropic' },
          { name: 'Ollama (로컬, 무료) - ARM VM에서 구동', value: 'ollama' },
          { name: '둘 다 (Claude 기본 + Ollama 폴백)', value: 'both' },
        ],
        default: 'anthropic',
      },
    ]);

    const ip = opts.ip || answers.ip;
    const keyPath = opts.key || answers.key;
    const provider = answers.provider;

    let apiKey = '';
    if (provider !== 'ollama') {
      const keyAnswer = await inquirer.prompt([{
        type: 'input',
        name: 'apiKey',
        message: 'Anthropic API Key:',
        default: ocConfig?.anthropicKey,
        validate: (v: string) => v.startsWith('sk-ant-') || 'sk-ant-로 시작해야 합니다',
      }]);
      apiKey = keyAnswer.apiKey;
    }

    // Save config
    config.set('openclaw' as any, {
      serverIp: ip,
      sshKeyPath: keyPath,
      provider,
      anthropicKey: apiKey || undefined,
      ollamaModel: opts.model,
    });

    console.log();
    ui.heading('OpenClaw 배포 시작');

    // Step 1: Check SSH connection
    const sshSpinner = ora('SSH 연결 확인 중...').start();
    try {
      sshExec(ip, 'echo ok', keyPath);
      sshSpinner.succeed('SSH 연결 성공');
    } catch (e: any) {
      sshSpinner.fail(`SSH 연결 실패: ${e.message}`);
      ui.info('Oracle VM 보안 목록에서 22번 포트가 열려있는지 확인하세요.');
      return;
    }

    // Step 2: Install Docker
    const dockerSpinner = ora('Docker 설치 확인 중...').start();
    try {
      sshExec(ip, 'docker --version', keyPath);
      dockerSpinner.succeed('Docker 이미 설치됨');
    } catch {
      dockerSpinner.text = 'Docker 설치 중... (2-3분 소요)';
      try {
        sshExec(ip, [
          'sudo apt-get update -qq',
          'sudo apt-get install -y -qq docker.io docker-compose-v2',
          'sudo usermod -aG docker ubuntu',
        ].join(' && '), keyPath);
        dockerSpinner.succeed('Docker 설치 완료');
      } catch (e: any) {
        dockerSpinner.fail(`Docker 설치 실패: ${e.message}`);
        return;
      }
    }

    // Step 3: Install Ollama (if needed)
    if (provider === 'ollama' || provider === 'both') {
      const ollamaSpinner = ora(`Ollama 설치 + ${opts.model} 모델 다운로드 중...`).start();
      try {
        sshExec(ip, 'which ollama || curl -fsSL https://ollama.ai/install.sh | sh', keyPath);
        ollamaSpinner.text = `모델 다운로드 중: ${opts.model} (수 분 소요)...`;
        sshExec(ip, `ollama pull ${opts.model}`, keyPath);
        ollamaSpinner.succeed(`Ollama + ${opts.model} 설치 완료`);
      } catch (e: any) {
        ollamaSpinner.warn(`Ollama 설치 문제: ${e.message}`);
      }
    }

    // Step 4: Deploy OpenClaw
    const clawSpinner = ora('OpenClaw 배포 중...').start();
    try {
      // Collect all stored API keys + deploy-specific vars
      const storedEnv = getEnvVarsForDeploy();
      const envVars: string[] = [
        `OPENCLAW_AI_PROVIDER=${provider === 'both' ? 'anthropic' : provider}`,
      ];
      if (apiKey) envVars.push(`ANTHROPIC_API_KEY=${apiKey}`);
      if (provider === 'ollama' || provider === 'both') {
        envVars.push(`OLLAMA_HOST=http://host.docker.internal:11434`);
        envVars.push(`OLLAMA_MODEL=${opts.model}`);
      }
      // Inject all stored keys (Slack, Telegram, etc.)
      for (const [k, v] of Object.entries(storedEnv)) {
        if (!envVars.some(e => e.startsWith(`${k}=`))) {
          envVars.push(`${k}=${v}`);
        }
      }

      const compose = `
version: "3.8"
services:
  openclaw:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: openclaw
    restart: unless-stopped
    ports:
      - "3777:3777"
    environment:
${envVars.map(e => `      - ${e}`).join('\n')}
    volumes:
      - openclaw-data:/app/data
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  openclaw-data:
`;

      sshExec(ip, `mkdir -p ~/openclaw && cat > ~/openclaw/docker-compose.yml << 'COMPOSEEOF'
${compose}
COMPOSEEOF`, keyPath);

      sshExec(ip, 'cd ~/openclaw && docker compose pull && docker compose up -d', keyPath);
      clawSpinner.succeed('OpenClaw 배포 완료!');
    } catch (e: any) {
      clawSpinner.fail(`OpenClaw 배포 실패: ${e.message}`);
      return;
    }

    // Step 5: Open firewall
    const fwSpinner = ora('방화벽 포트 열기 (3777)...').start();
    try {
      sshExec(ip, 'sudo iptables -I INPUT -p tcp --dport 3777 -j ACCEPT', keyPath);
      fwSpinner.succeed('포트 3777 열림');
    } catch (e: any) {
      fwSpinner.warn(`방화벽: ${e.message}`);
    }

    console.log();
    ui.heading('배포 완료!');
    ui.keyValue({
      'OpenClaw URL': `http://${ip}:3777`,
      'AI Provider': provider,
      'Ollama Model': provider !== 'anthropic' ? opts.model : '-',
      '서버': ip,
    });
    console.log();
    ui.info('Tailscale로 안전하게 접근: freestack vpn setup');
    ui.warn('보안: 외부 노출 대신 Tailscale VPN 경유를 권장합니다.');
  });

openclawCommand
  .command('status')
  .description('OpenClaw 실행 상태 확인')
  .action(async () => {
    const ocConfig = config.get('openclaw') as any;
    if (!ocConfig?.serverIp) {
      ui.error('OpenClaw이 설정되지 않았습니다. freestack openclaw deploy 먼저.');
      return;
    }

    const spinner = ora('상태 확인 중...').start();
    try {
      const result = sshExec(ocConfig.serverIp, 'docker ps --filter name=openclaw --format "{{.Status}}"', ocConfig.sshKeyPath);
      spinner.stop();

      if (result.trim()) {
        ui.success(`OpenClaw: ${chalk.green(result.trim())}`);
        ui.keyValue({
          'URL': `http://${ocConfig.serverIp}:3777`,
          'Provider': ocConfig.provider || '-',
        });
      } else {
        ui.warn('OpenClaw 컨테이너가 실행중이지 않습니다.');
        ui.info('시작: freestack openclaw start');
      }
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

openclawCommand
  .command('logs')
  .description('OpenClaw 로그 보기')
  .option('-n, --lines <n>', '줄 수', '50')
  .action(async (opts) => {
    const ocConfig = config.get('openclaw') as any;
    if (!ocConfig?.serverIp) { ui.error('freestack openclaw deploy 먼저.'); return; }

    try {
      const logs = sshExec(ocConfig.serverIp, `docker logs openclaw --tail ${opts.lines}`, ocConfig.sshKeyPath);
      console.log(logs);
    } catch (e: any) {
      ui.error(e.message);
    }
  });

openclawCommand
  .command('start')
  .description('OpenClaw 시작')
  .action(async () => {
    const ocConfig = config.get('openclaw') as any;
    if (!ocConfig?.serverIp) { ui.error('freestack openclaw deploy 먼저.'); return; }

    const spinner = ora('OpenClaw 시작 중...').start();
    try {
      sshExec(ocConfig.serverIp, 'cd ~/openclaw && docker compose up -d', ocConfig.sshKeyPath);
      spinner.succeed('OpenClaw 시작됨');
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

openclawCommand
  .command('stop')
  .description('OpenClaw 중지')
  .action(async () => {
    const ocConfig = config.get('openclaw') as any;
    if (!ocConfig?.serverIp) { ui.error('freestack openclaw deploy 먼저.'); return; }

    const spinner = ora('OpenClaw 중지 중...').start();
    try {
      sshExec(ocConfig.serverIp, 'cd ~/openclaw && docker compose down', ocConfig.sshKeyPath);
      spinner.succeed('OpenClaw 중지됨');
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

openclawCommand
  .command('update')
  .description('OpenClaw 최신 버전으로 업데이트')
  .action(async () => {
    const ocConfig = config.get('openclaw') as any;
    if (!ocConfig?.serverIp) { ui.error('freestack openclaw deploy 먼저.'); return; }

    const spinner = ora('OpenClaw 업데이트 중...').start();
    try {
      sshExec(ocConfig.serverIp, 'cd ~/openclaw && docker compose pull && docker compose up -d', ocConfig.sshKeyPath);
      spinner.succeed('OpenClaw 업데이트 완료');
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });
