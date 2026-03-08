import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { config } from '../services/config.js';
import { getEnvVarsForDeploy } from './keys.js';
import * as ui from '../utils/ui.js';

export const agentCommand = new Command('agent')
  .description('AI 에이전트 배포 및 관리 (Nanobot / OpenClaw / ZeroClaw)');

// 하위호환: openclaw → agent alias
export const openclawCommand = agentCommand;

function sshExec(ip: string, cmd: string, keyPath?: string, user = 'ubuntu'): string {
  const keyFlag = keyPath ? `-i ${keyPath}` : '';
  return execSync(
    `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${keyFlag} ${user}@${ip} '${cmd}'`,
    { encoding: 'utf-8', timeout: 120000 },
  );
}

// ─── Runtime definitions ───

type AgentRuntime = 'nanobot' | 'openclaw' | 'zeroclaw';

interface RuntimeConfig {
  id: AgentRuntime;
  name: string;
  image: string;
  port: number;
  dirName: string;
  lang: string;
  installCmd?: string;       // pip install 등 non-docker 설치
  envPrefix: string;         // 환경변수 프리픽스 (LLM_PROVIDERS 등)
  memDefault: string;
  description: string;
}

const RUNTIMES: Record<AgentRuntime, RuntimeConfig> = {
  nanobot: {
    id: 'nanobot',
    name: 'Nanobot (HKUDS)',
    image: 'ghcr.io/hkuds/nanobot:latest',
    port: 3210,
    dirName: 'nanobot',
    lang: 'Python',
    installCmd: 'pip install nanobot-ai',
    envPrefix: 'NANOBOT',
    memDefault: '512m',
    description: '4천줄 Python, 45MB 메모리, MCP 지원, 감사 가능한 코드',
  },
  openclaw: {
    id: 'openclaw',
    name: 'OpenClaw',
    image: 'ghcr.io/openclaw/openclaw:latest',
    port: 3777,
    dirName: 'openclaw',
    lang: 'TypeScript',
    envPrefix: 'OPENCLAW',
    memDefault: '2g',
    description: '280K stars, 최대 기능, 5400+ 스킬, 무겁고 CVE 주의',
  },
  zeroclaw: {
    id: 'zeroclaw',
    name: 'ZeroClaw',
    image: 'ghcr.io/zeroclaw/zeroclaw:latest',
    port: 3800,
    dirName: 'zeroclaw',
    lang: 'Rust',
    envPrefix: 'ZEROCLAW',
    memDefault: '256m',
    description: '3.4MB 바이너리, <5MB 메모리, ARM/IoT/엣지 특화',
  },
};

const DEFAULT_RUNTIME: AgentRuntime = 'nanobot';

async function selectRuntime(): Promise<RuntimeConfig> {
  const saved = (config.get('openclaw') as any)?.runtime as AgentRuntime | undefined;
  const defaultVal = saved || DEFAULT_RUNTIME;

  const { runtime } = await inquirer.prompt([{
    type: 'list',
    name: 'runtime',
    message: 'AI 에이전트 런타임 선택:',
    choices: [
      { name: `🐱 Nanobot (HKUDS) — ${chalk.green('추천')} Python 4천줄, 45MB, MCP`, value: 'nanobot' },
      { name: `🦞 OpenClaw — 280K stars, 최대 기능, 무거움 (CVE 주의)`, value: 'openclaw' },
      { name: `⚡ ZeroClaw — Rust, 5MB, ARM/엣지 특화`, value: 'zeroclaw' },
    ],
    default: defaultVal,
  }]);

  return RUNTIMES[runtime as AgentRuntime];
}

// ─── Deploy target configs ───

interface DeployTarget {
  type: 'homeserver' | 'remote-linux' | 'info';
  runtime: AgentRuntime;
  ip?: string;
  sshKeyPath?: string;
  sshUser?: string;
  tailscaleIp?: string;
  provider: string;          // anthropic | ollama | both
  anthropicKey?: string;
  ollamaModel?: string;
  memLimit?: string;         // docker memory limit
}

const CLOUD_OPTIONS = [
  { name: '서비스', plans: [
    { label: 'Hetzner CX22', spec: '2C/4GB/40GB', price: '€3.79 (~₩5,500/월)', url: 'https://www.hetzner.com/cloud/' },
    { label: 'Oracle ARM 유료', spec: '1C/4GB/50GB', price: '$11.68 (~₩16,000/월)', url: 'https://cloud.oracle.com' },
    { label: 'AWS Lightsail', spec: '2C/4GB/80GB', price: '$24 (~₩33,000/월)', url: 'https://lightsail.aws.amazon.com' },
    { label: 'GCP e2-medium', spec: '2C/4GB', price: '$24.46 (~₩34,000/월)', url: 'https://console.cloud.google.com' },
    { label: '카페24 OpenClaw VPS', spec: '2C/4GB/80GB', price: '₩66,000/월 (프리인스톨)', url: 'https://hosting.cafe24.com/?controller=new_product_page&page=openclaw-vps' },
  ]},
];

// ─── Deploy command ───

agentCommand
  .command('deploy')
  .description('AI 에이전트 배포 (Nanobot/OpenClaw/ZeroClaw)')
  .action(async () => {
    console.log();
    ui.heading('AI 에이전트 배포');

    // 1) 런타임 선택
    const rt = await selectRuntime();
    console.log();
    ui.success(`런타임: ${rt.name} (${rt.lang}, ${rt.description})`);
    console.log();

    // 2) 배포 대상 선택
    const { target } = await inquirer.prompt([{
      type: 'list',
      name: 'target',
      message: '배포 대상 선택:',
      choices: [
        { name: `🏠 홈서버 (Tailscale) — ${chalk.green('$0/월')}, Docker Desktop + Ollama (GPU)`, value: 'homeserver' },
        { name: `🖥️  원격 Linux VM (SSH) — Oracle/AWS/GCP/Hetzner 등`, value: 'remote-linux' },
        { name: `📋 클라우드 가격 비교 보기`, value: 'info' },
      ],
    }]);

    if (target === 'info') {
      showCloudPricing();
      return;
    }

    if (target === 'homeserver') {
      await deployHomeServer(rt);
    } else {
      await deployRemoteLinux(rt);
    }
  });

// ─── Home server deploy (Tailscale + Docker Desktop) ───

async function deployHomeServer(rt: RuntimeConfig) {
  ui.heading(`${rt.name} — 홈서버 배포 (Tailscale 경유)`);
  console.log();
  ui.info('홈서버 요구사항:');
  ui.info('  • Tailscale 설치 + 로그인');
  ui.info('  • Docker Desktop (Windows) 또는 Docker Engine (Linux)');
  ui.info('  • Ollama 네이티브 설치 (GPU 사용 시)');
  console.log();

  const ocConfig = config.get('openclaw') as any;

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tailscaleIp',
      message: '홈서버 Tailscale IP (100.x.x.x):',
      default: ocConfig?.tailscaleIp,
      validate: (v: string) => /^\d+\.\d+\.\d+\.\d+$/.test(v) || 'IP 주소 형식',
    },
    {
      type: 'input',
      name: 'sshUser',
      message: 'SSH 유저명:',
      default: ocConfig?.sshUser || process.env.USER || 'user',
    },
    {
      type: 'list',
      name: 'os',
      message: '홈서버 OS:',
      choices: [
        { name: 'Windows (Docker Desktop + WSL2)', value: 'windows' },
        { name: 'Linux', value: 'linux' },
        { name: 'macOS', value: 'macos' },
      ],
      default: 'windows',
    },
    {
      type: 'list',
      name: 'provider',
      message: 'AI 프로바이더:',
      choices: [
        { name: `Ollama (로컬 GPU) + Claude API 폴백 — ${chalk.green('추천 (GPU 24GB)')}`, value: 'both' },
        { name: 'Ollama만 (로컬 GPU, API 비용 $0)', value: 'ollama' },
        { name: 'Claude API만 (Anthropic)', value: 'anthropic' },
      ],
      default: 'both',
    },
    {
      type: 'input',
      name: 'ollamaModel',
      message: 'Ollama 기본 모델:',
      default: ocConfig?.ollamaModel || 'llama3.2',
      when: (a: any) => a.provider !== 'anthropic',
    },
  ]);

  let apiKey = ocConfig?.anthropicKey || '';
  if (answers.provider !== 'ollama') {
    const keyAnswer = await inquirer.prompt([{
      type: 'input',
      name: 'apiKey',
      message: 'Anthropic API Key:',
      default: apiKey || undefined,
      validate: (v: string) => !v || v.startsWith('sk-ant-') || 'sk-ant-로 시작 (건너뛰려면 빈칸)',
    }]);
    apiKey = keyAnswer.apiKey;
  }

  // 추가 LLM 프로바이더 키 수집
  await collectExtraLLMKeys();

  // 채널 봇 토큰 수집
  await collectChannelKeys();

  // Save config
  config.set('openclaw' as any, {
    ...ocConfig,
    type: 'homeserver',
    runtime: rt.id,
    tailscaleIp: answers.tailscaleIp,
    sshUser: answers.sshUser,
    serverIp: answers.tailscaleIp,
    os: answers.os,
    provider: answers.provider,
    anthropicKey: apiKey || undefined,
    ollamaModel: answers.ollamaModel || 'llama3.2',
  });

  // Test Tailscale SSH
  const sshSpinner = ora('Tailscale SSH 연결 확인 중...').start();
  try {
    const result = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${answers.sshUser}@${answers.tailscaleIp} "echo ok"`,
      { encoding: 'utf-8', timeout: 15000 },
    );
    if (!result.includes('ok')) throw new Error('응답 없음');
    sshSpinner.succeed('Tailscale SSH 연결 성공');
  } catch {
    sshSpinner.warn('SSH 직접 연결 실패 — Tailscale SSH가 활성화되어 있는지 확인하세요.');
    ui.info('  tailscale up --ssh    (홈서버에서 실행)');
    ui.info('  또는 홈서버에서 직접 아래 명령어를 실행하세요:');
    console.log();
    printHomeServerManual(answers, apiKey, rt);
    return;
  }

  // Check Docker
  const dockerSpinner = ora('Docker 확인 중...').start();
  try {
    sshExec(answers.tailscaleIp, 'docker --version', undefined, answers.sshUser);
    dockerSpinner.succeed('Docker 설치 확인');
  } catch {
    dockerSpinner.warn('Docker가 설치되어 있지 않거나 접근 불가');
    if (answers.os === 'windows') {
      ui.info('Docker Desktop 설치: https://www.docker.com/products/docker-desktop/');
      ui.info('설치 후 WSL2 백엔드 활성화 필요');
    }
    console.log();
    printHomeServerManual(answers, apiKey, rt);
    return;
  }

  // Deploy via docker-compose
  const clawSpinner = ora(`${rt.name} 배포 중...`).start();
  try {
    const envVars = buildEnvVars(answers.provider, apiKey, answers.ollamaModel, rt);
    const compose = buildDockerCompose(envVars, '4g', rt);

    sshExec(answers.tailscaleIp,
      `mkdir -p ~/${rt.dirName} && cat > ~/${rt.dirName}/docker-compose.yml << 'COMPOSEEOF'\n${compose}\nCOMPOSEEOF`,
      undefined, answers.sshUser);
    sshExec(answers.tailscaleIp, `cd ~/${rt.dirName} && docker compose pull && docker compose up -d`,
      undefined, answers.sshUser);
    clawSpinner.succeed(`${rt.name} 배포 완료!`);
  } catch (e: any) {
    clawSpinner.fail(`배포 실패: ${e.message}`);
    console.log();
    printHomeServerManual(answers, apiKey, rt);
    return;
  }

  // Result
  console.log();
  ui.heading(`✅ ${rt.name} 홈서버 배포 완료!`);

  const deployedKeys = getAllKeys();
  const activeLLMs = EXTRA_LLM_PROVIDERS.filter(p => deployedKeys[p.id]).map(p => p.name);
  if (apiKey) activeLLMs.unshift('Claude');
  if (answers.provider !== 'anthropic') activeLLMs.push('Ollama');
  const activeChannels = CHANNEL_TOKENS.filter(c => deployedKeys[c.id]).map(c => c.name.split(' ')[0]);

  ui.keyValue({
    '런타임': rt.name,
    'URL': `http://${answers.tailscaleIp}:${rt.port}`,
    'LLM': activeLLMs.join(', ') || answers.provider,
    'Ollama Model': answers.provider !== 'anthropic' ? (answers.ollamaModel || 'llama3.2') : '-',
    '채널': activeChannels.length ? activeChannels.join(', ') : chalk.dim('미설정 (freestack agent deploy 재실행)'),
    '서버': `${answers.tailscaleIp} (Tailscale)`,
    '메모리': rt.id === 'nanobot' ? '~45MB (가벼움)' : rt.id === 'zeroclaw' ? '<5MB (초경량)' : '2-4GB',
  });

  if (answers.provider !== 'anthropic') {
    console.log();
    ui.heading('Ollama 설정 (홈서버에서 직접)');
    ui.info(`1. Ollama 설치: ${chalk.cyan('https://ollama.com/download')}`);
    ui.info(`2. 모델 다운로드: ${chalk.cyan(`ollama pull ${answers.ollamaModel || 'llama3.2'}`)}`);
    ui.info(`3. Ollama가 실행되면 에이전트가 자동으로 연결합니다.`);
    ui.info(`   GPU 24GB → ${chalk.green('70B 양자화 모델까지 가능')}`);
  }

  // 키 검증 + 추가 등록 루프
  const keysChanged = await verifyAllKeys();
  if (keysChanged) {
    // 키가 추가됐으면 docker-compose 재생성 & 재배포
    const redeploySpinner = ora('새 키로 재배포 중...').start();
    try {
      const newEnvVars = buildEnvVars(answers.provider, apiKey, answers.ollamaModel, rt);
      const newCompose = buildDockerCompose(newEnvVars, '4g', rt);
      sshExec(answers.tailscaleIp,
        `cat > ~/${rt.dirName}/docker-compose.yml << 'COMPOSEEOF'\n${newCompose}\nCOMPOSEEOF`,
        undefined, answers.sshUser);
      sshExec(answers.tailscaleIp, `cd ~/${rt.dirName} && docker compose up -d`,
        undefined, answers.sshUser);
      redeploySpinner.succeed('새 키 반영 완료!');
    } catch (e: any) {
      redeploySpinner.warn(`재배포 실패: ${e.message} — freestack agent update 로 재시도`);
    }
  }
}

function printHomeServerManual(answers: any, apiKey: string, rt: RuntimeConfig) {
  const envVars = buildEnvVars(answers.provider, apiKey, answers.ollamaModel, rt);
  const compose = buildDockerCompose(envVars, '4g', rt);

  ui.heading(`${rt.name} 수동 설치 가이드`);
  console.log(chalk.dim('홈서버에서 아래 명령어를 실행하세요:\n'));
  console.log(chalk.cyan('# 1. 디렉토리 생성'));
  console.log(`mkdir -p ~/${rt.dirName} && cd ~/${rt.dirName}\n`);
  console.log(chalk.cyan('# 2. docker-compose.yml 생성'));
  console.log(`cat > docker-compose.yml << 'EOF'`);
  console.log(compose);
  console.log(`EOF\n`);
  console.log(chalk.cyan('# 3. 실행'));
  console.log('docker compose pull && docker compose up -d\n');

  if (answers.provider !== 'anthropic') {
    console.log(chalk.cyan('# 4. Ollama 설치 (GPU 사용)'));
    if (answers.os === 'windows') {
      console.log('# https://ollama.com/download/windows 에서 다운로드');
    } else {
      console.log('curl -fsSL https://ollama.ai/install.sh | sh');
    }
    console.log(`ollama pull ${answers.ollamaModel || 'llama3.2'}\n`);
  }
}

// ─── Remote Linux VM deploy (existing logic) ───

async function deployRemoteLinux(rt: RuntimeConfig) {
  ui.heading(`${rt.name} — 원격 Linux VM 배포 (SSH)`);
  console.log();

  const ocConfig = config.get('openclaw') as any;

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'ip',
      message: '서버 IP (Public 또는 Tailscale):',
      default: ocConfig?.serverIp,
      validate: (v: string) => /^\d+\.\d+\.\d+\.\d+$/.test(v) || 'IP 주소 형식',
    },
    {
      type: 'input',
      name: 'key',
      message: 'SSH Private Key 경로:',
      default: ocConfig?.sshKeyPath || '~/.ssh/id_rsa',
    },
    {
      type: 'input',
      name: 'sshUser',
      message: 'SSH 유저명:',
      default: ocConfig?.sshUser || 'ubuntu',
    },
    {
      type: 'list',
      name: 'provider',
      message: 'AI 프로바이더:',
      choices: [
        { name: 'Claude API (Anthropic)', value: 'anthropic' },
        { name: 'Ollama (로컬) — ARM VM 24GB+ 권장', value: 'ollama' },
        { name: '둘 다 (Claude 기본 + Ollama 폴백)', value: 'both' },
      ],
      default: 'anthropic',
    },
    {
      type: 'input',
      name: 'ollamaModel',
      message: 'Ollama 모델:',
      default: ocConfig?.ollamaModel || 'llama3.2',
      when: (a: any) => a.provider !== 'anthropic',
    },
    {
      type: 'input',
      name: 'memLimit',
      message: 'Docker 메모리 제한 (예: 512m, 2g, 4g):',
      default: '2g',
    },
  ]);

  let apiKey = ocConfig?.anthropicKey || '';
  if (answers.provider !== 'ollama') {
    const keyAnswer = await inquirer.prompt([{
      type: 'input',
      name: 'apiKey',
      message: 'Anthropic API Key:',
      default: apiKey || undefined,
      validate: (v: string) => !v || v.startsWith('sk-ant-') || 'sk-ant-로 시작',
    }]);
    apiKey = keyAnswer.apiKey;
  }

  // 추가 LLM 프로바이더 키 수집
  await collectExtraLLMKeys();

  // 채널 봇 토큰 수집
  await collectChannelKeys();

  config.set('openclaw' as any, {
    ...ocConfig,
    type: 'remote-linux',
    runtime: rt.id,
    serverIp: answers.ip,
    sshKeyPath: answers.key,
    sshUser: answers.sshUser,
    provider: answers.provider,
    anthropicKey: apiKey || undefined,
    ollamaModel: answers.ollamaModel || 'llama3.2',
  });

  // SSH check
  const sshSpinner = ora('SSH 연결 확인 중...').start();
  try {
    sshExec(answers.ip, 'echo ok', answers.key, answers.sshUser);
    sshSpinner.succeed('SSH 연결 성공');
  } catch (e: any) {
    sshSpinner.fail(`SSH 연결 실패: ${e.message}`);
    return;
  }

  // Docker install
  const dockerSpinner = ora('Docker 확인 중...').start();
  try {
    sshExec(answers.ip, 'docker --version', answers.key, answers.sshUser);
    dockerSpinner.succeed('Docker 이미 설치됨');
  } catch {
    dockerSpinner.text = 'Docker 설치 중... (2-3분)';
    try {
      sshExec(answers.ip, [
        'sudo apt-get update -qq',
        'sudo apt-get install -y -qq docker.io docker-compose-v2',
        'sudo usermod -aG docker $(whoami)',
      ].join(' && '), answers.key, answers.sshUser);
      dockerSpinner.succeed('Docker 설치 완료');
    } catch (e: any) {
      dockerSpinner.fail(`Docker 설치 실패: ${e.message}`);
      return;
    }
  }

  // Ollama
  if (answers.provider !== 'anthropic') {
    const ollamaSpinner = ora(`Ollama + ${answers.ollamaModel} 설치 중...`).start();
    try {
      sshExec(answers.ip, 'which ollama || curl -fsSL https://ollama.ai/install.sh | sh', answers.key, answers.sshUser);
      sshExec(answers.ip, `ollama pull ${answers.ollamaModel}`, answers.key, answers.sshUser);
      ollamaSpinner.succeed(`Ollama + ${answers.ollamaModel} 설치 완료`);
    } catch (e: any) {
      ollamaSpinner.warn(`Ollama: ${e.message}`);
    }
  }

  // Deploy
  const clawSpinner = ora(`${rt.name} 배포 중...`).start();
  try {
    const envVars = buildEnvVars(answers.provider, apiKey, answers.ollamaModel, rt);
    const compose = buildDockerCompose(envVars, answers.memLimit, rt);

    sshExec(answers.ip,
      `mkdir -p ~/${rt.dirName} && cat > ~/${rt.dirName}/docker-compose.yml << 'COMPOSEEOF'\n${compose}\nCOMPOSEEOF`,
      answers.key, answers.sshUser);
    sshExec(answers.ip, `cd ~/${rt.dirName} && docker compose pull && docker compose up -d`,
      answers.key, answers.sshUser);
    clawSpinner.succeed(`${rt.name} 배포 완료!`);
  } catch (e: any) {
    clawSpinner.fail(`배포 실패: ${e.message}`);
    return;
  }

  // Firewall
  try {
    sshExec(answers.ip, `sudo iptables -I INPUT -p tcp --dport ${rt.port} -j ACCEPT`, answers.key, answers.sshUser);
  } catch {}

  console.log();
  ui.heading(`${rt.name} 배포 완료!`);

  const deployedKeys = getAllKeys();
  const activeLLMs = EXTRA_LLM_PROVIDERS.filter(p => deployedKeys[p.id]).map(p => p.name);
  if (apiKey) activeLLMs.unshift('Claude');
  if (answers.provider !== 'anthropic') activeLLMs.push('Ollama');
  const activeChannels = CHANNEL_TOKENS.filter(c => deployedKeys[c.id]).map(c => c.name.split(' ')[0]);

  ui.keyValue({
    '런타임': rt.name,
    'URL': `http://${answers.ip}:${rt.port}`,
    'LLM': activeLLMs.join(', ') || answers.provider,
    'Memory': answers.memLimit,
    '채널': activeChannels.length ? activeChannels.join(', ') : chalk.dim('미설정'),
    '서버': answers.ip,
  });
  ui.warn('보안: Tailscale VPN 경유 접근 권장 (freestack vpn setup)');

  // 키 검증 + 추가 등록 루프
  const keysChanged = await verifyAllKeys();
  if (keysChanged) {
    const redeploySpinner = ora('새 키로 재배포 중...').start();
    try {
      const newEnvVars = buildEnvVars(answers.provider, apiKey, answers.ollamaModel, rt);
      const newCompose = buildDockerCompose(newEnvVars, answers.memLimit, rt);
      sshExec(answers.ip,
        `cat > ~/${rt.dirName}/docker-compose.yml << 'COMPOSEEOF'\n${newCompose}\nCOMPOSEEOF`,
        answers.key, answers.sshUser);
      sshExec(answers.ip, `cd ~/${rt.dirName} && docker compose up -d`,
        answers.key, answers.sshUser);
      redeploySpinner.succeed('새 키 반영 완료!');
    } catch (e: any) {
      redeploySpinner.warn(`재배포 실패: ${e.message}`);
    }
  }
}

// ─── Cloud pricing info ───

function showCloudPricing() {
  ui.heading('AI 에이전트 서버 가격 비교');
  console.log();
  ui.table(
    ['서비스', '사양', '월 비용', '비고'],
    [
      ['🏠 홈서버 (Tailscale)', '무제한', chalk.green('$0 (전기세만)'), 'GPU 사용 가능, Ollama 로컬 LLM'],
      ['Oracle ARM 유료', '1C/4GB/50GB', '$11.68 (~₩16,000)', '춘천 리전, 가성비'],
      ['Hetzner CX22', '2C/4GB/40GB', '€3.79 (~₩5,500)', '유럽, 최저가'],
      ['AWS Lightsail', '2C/4GB/80GB', '$24 (~₩33,000)', '서울 리전'],
      ['GCP e2-medium', '2C/4GB', '$24.46 (~₩34,000)', '서울 리전'],
      ['카페24 OpenClaw VPS', '2C/4GB/80GB', '₩66,000', '프리인스톨, 한국어 CS'],
      ['Oracle AMD Micro', '0.125C/1GB', chalk.green('$0 (무료)'), '⚠️ OOM 위험, 비추'],
    ],
  );
  console.log();
  ui.info(`${chalk.green('추천')}: 홈서버(GPU) > Hetzner > Oracle ARM 유료 > AWS/GCP > 카페24`);
}

// ─── Shared helpers ───

function buildEnvVars(provider: string, apiKey: string, ollamaModel?: string, rt?: RuntimeConfig): string[] {
  const storedEnv = getEnvVarsForDeploy();
  const prefix = rt?.envPrefix || 'OPENCLAW';
  const envVars: string[] = [
    `${prefix}_AI_PROVIDER=${provider === 'both' ? 'anthropic' : provider}`,
  ];

  // 메인 프로바이더 키
  if (apiKey) envVars.push(`ANTHROPIC_API_KEY=${apiKey}`);
  if (provider === 'ollama' || provider === 'both') {
    envVars.push(`OLLAMA_HOST=http://host.docker.internal:11434`);
    envVars.push(`OLLAMA_MODEL=${ollamaModel || 'llama3.2'}`);
  }

  // 저장된 모든 키 주입 (LLM, 채널, 서비스 전부)
  for (const [k, v] of Object.entries(storedEnv)) {
    if (!envVars.some(e => e.startsWith(`${k}=`))) {
      envVars.push(`${k}=${v}`);
    }
  }

  // 사용 가능한 LLM 프로바이더 목록 (런타임이 폴백 체인으로 활용)
  const llmProviders: string[] = [];
  if (storedEnv['ANTHROPIC_API_KEY'] || apiKey) llmProviders.push('anthropic');
  if (storedEnv['OPENAI_API_KEY']) llmProviders.push('openai');
  if (storedEnv['GOOGLE_API_KEY']) llmProviders.push('google');
  if (storedEnv['MOONSHOT_API_KEY']) llmProviders.push('kimi');
  if (storedEnv['ZHIPU_API_KEY']) llmProviders.push('glm');
  if (provider === 'ollama' || provider === 'both') llmProviders.push('ollama');

  if (llmProviders.length > 0) {
    envVars.push(`${prefix}_LLM_PROVIDERS=${llmProviders.join(',')}`);
  }

  return envVars;
}

// ─── LLM & 채널 키 수집 ───

const EXTRA_LLM_PROVIDERS = [
  { id: 'openai',  name: 'OpenAI',        envVar: 'OPENAI_API_KEY',   prefix: 'sk-',  hint: 'GPT-4o 등, 폴백용' },
  { id: 'google',  name: 'Google Gemini',  envVar: 'GOOGLE_API_KEY',   prefix: '',     hint: 'Gemini Pro, 무료 티어 있음' },
  { id: 'kimi',    name: 'Kimi (Moonshot)', envVar: 'MOONSHOT_API_KEY', prefix: 'sk-',  hint: '중국 LLM, 저렴' },
  { id: 'glm',     name: 'GLM (Zhipu)',    envVar: 'ZHIPU_API_KEY',    prefix: '',     hint: '중국 LLM, 저렴' },
];

const CHANNEL_TOKENS = [
  { id: 'telegram',   name: 'Telegram Bot Token',  envVar: 'TELEGRAM_BOT_TOKEN',  prefix: '',     hint: '@BotFather에서 발급' },
  { id: 'slack',      name: 'Slack Bot Token',      envVar: 'SLACK_BOT_TOKEN',     prefix: 'xoxb-', hint: 'api.slack.com/apps' },
  { id: 'slackApp',   name: 'Slack App Token',      envVar: 'SLACK_APP_TOKEN',     prefix: 'xapp-', hint: 'Socket Mode용' },
  { id: 'discordBot', name: 'Discord Bot Token',    envVar: 'DISCORD_BOT_TOKEN',   prefix: '',     hint: 'discord.com/developers' },
];

async function collectExtraLLMKeys() {
  const keys = getAllKeys();
  const missing = EXTRA_LLM_PROVIDERS.filter(p => !keys[p.id]);

  if (missing.length === 0) {
    const set = EXTRA_LLM_PROVIDERS.filter(p => keys[p.id]);
    if (set.length > 0) {
      ui.success(`추가 LLM 키 ${set.length}개 설정됨: ${set.map(p => p.name).join(', ')}`);
    }
    return;
  }

  console.log();
  ui.heading('추가 LLM 프로바이더 (선택)');
  ui.info('여러 LLM을 등록하면 폴백/라우팅에 활용됩니다.');
  console.log();

  const { addMore } = await inquirer.prompt([{
    type: 'confirm',
    name: 'addMore',
    message: `추가 LLM API 키를 등록할까요? (${missing.map(p => p.name).join(', ')})`,
    default: false,
  }]);

  if (!addMore) return;

  const { selectedProviders } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedProviders',
    message: '등록할 프로바이더 선택:',
    choices: missing.map(p => ({
      name: `${p.name} — ${chalk.dim(p.hint)}`,
      value: p.id,
    })),
  }]);

  for (const providerId of selectedProviders) {
    const p = EXTRA_LLM_PROVIDERS.find(x => x.id === providerId)!;
    const { value } = await inquirer.prompt([{
      type: 'input',
      name: 'value',
      message: `${p.name} API Key:`,
      validate: (v: string) => {
        if (!v) return true;
        if (p.prefix && !v.startsWith(p.prefix)) return `${p.prefix}로 시작해야 합니다`;
        return true;
      },
    }]);
    if (value?.trim()) {
      keys[p.id] = value.trim();
      config.set('keys' as any, keys);
      ui.success(`${p.name} 저장됨`);
    }
  }
}

async function collectChannelKeys() {
  const keys = getAllKeys();
  const missing = CHANNEL_TOKENS.filter(c => !keys[c.id]);

  if (missing.length === 0) {
    const set = CHANNEL_TOKENS.filter(c => keys[c.id]);
    if (set.length > 0) {
      ui.success(`채널 토큰 ${set.length}개 설정됨: ${set.map(c => c.name).join(', ')}`);
    }
    return;
  }

  console.log();
  ui.heading('채널 봇 토큰 (메시징 연동)');
  ui.info('Telegram/Slack/Discord로 OpenClaw에 명령을 보내려면 봇 토큰이 필요합니다.');
  console.log();

  const { addChannels } = await inquirer.prompt([{
    type: 'confirm',
    name: 'addChannels',
    message: `채널 봇 토큰을 등록할까요? (${missing.map(c => c.name.split(' ')[0]).join(', ')})`,
    default: true,
  }]);

  if (!addChannels) return;

  const { selectedChannels } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedChannels',
    message: '등록할 채널 선택:',
    choices: missing.map(c => ({
      name: `${c.name} — ${chalk.dim(c.hint)}`,
      value: c.id,
    })),
  }]);

  for (const chId of selectedChannels) {
    const c = CHANNEL_TOKENS.find(x => x.id === chId)!;
    const { value } = await inquirer.prompt([{
      type: 'input',
      name: 'value',
      message: `${c.name}:`,
      validate: (v: string) => {
        if (!v) return true;
        if (c.prefix && !v.startsWith(c.prefix)) return `${c.prefix}로 시작해야 합니다`;
        return true;
      },
    }]);
    if (value?.trim()) {
      keys[c.id] = value.trim();
      config.set('keys' as any, keys);
      ui.success(`${c.name} 저장됨`);
    }
  }
}

// ─── 키 검증 (테스트 run) ───

interface VerifyResult {
  name: string;
  ok: boolean;
  message: string;
}

async function verifyAllKeys(): Promise<boolean> {
  const keys = getAllKeys();
  const results: VerifyResult[] = [];

  console.log();
  console.log(chalk.bold('━'.repeat(60)));
  ui.heading('테스트 run — 등록된 키 검증');
  console.log();

  // LLM 프로바이더 검증
  const llmTests: { id: string; name: string; test: () => Promise<VerifyResult> }[] = [
    {
      id: 'anthropic',
      name: 'Claude (Anthropic)',
      test: async () => {
        const key = keys.anthropic;
        if (!key) return { name: 'Claude', ok: false, message: '키 미등록' };
        const spinner = ora('Claude API 확인 중...').start();
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'ping' }],
            }),
          });
          if (res.ok) {
            spinner.succeed('Claude — 작동 확인!');
            return { name: 'Claude', ok: true, message: '작동 확인' };
          }
          const err = await res.json() as any;
          spinner.fail(`Claude — ${err.error?.message || res.status}`);
          return { name: 'Claude', ok: false, message: err.error?.message || `HTTP ${res.status}` };
        } catch (e: any) {
          spinner.fail(`Claude — ${e.message}`);
          return { name: 'Claude', ok: false, message: e.message };
        }
      },
    },
    {
      id: 'openai',
      name: 'OpenAI',
      test: async () => {
        const key = keys.openai;
        if (!key) return { name: 'OpenAI', ok: false, message: '키 미등록' };
        const spinner = ora('OpenAI API 확인 중...').start();
        try {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` },
          });
          if (res.ok) {
            spinner.succeed('OpenAI — 작동 확인!');
            return { name: 'OpenAI', ok: true, message: '작동 확인' };
          }
          spinner.fail(`OpenAI — HTTP ${res.status}`);
          return { name: 'OpenAI', ok: false, message: `HTTP ${res.status}` };
        } catch (e: any) {
          spinner.fail(`OpenAI — ${e.message}`);
          return { name: 'OpenAI', ok: false, message: e.message };
        }
      },
    },
    {
      id: 'google',
      name: 'Gemini',
      test: async () => {
        const key = keys.google;
        if (!key) return { name: 'Gemini', ok: false, message: '키 미등록' };
        const spinner = ora('Gemini API 확인 중...').start();
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          if (res.ok) {
            spinner.succeed('Gemini — 작동 확인!');
            return { name: 'Gemini', ok: true, message: '작동 확인' };
          }
          spinner.fail(`Gemini — HTTP ${res.status}`);
          return { name: 'Gemini', ok: false, message: `HTTP ${res.status}` };
        } catch (e: any) {
          spinner.fail(`Gemini — ${e.message}`);
          return { name: 'Gemini', ok: false, message: e.message };
        }
      },
    },
    {
      id: 'kimi',
      name: 'Kimi (Moonshot)',
      test: async () => {
        const key = keys.kimi;
        if (!key) return { name: 'Kimi', ok: false, message: '키 미등록' };
        const spinner = ora('Kimi API 확인 중...').start();
        try {
          const res = await fetch('https://api.moonshot.cn/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` },
          });
          if (res.ok) {
            spinner.succeed('Kimi — 작동 확인!');
            return { name: 'Kimi', ok: true, message: '작동 확인' };
          }
          spinner.fail(`Kimi — HTTP ${res.status}`);
          return { name: 'Kimi', ok: false, message: `HTTP ${res.status}` };
        } catch (e: any) {
          spinner.fail(`Kimi — ${e.message}`);
          return { name: 'Kimi', ok: false, message: e.message };
        }
      },
    },
    {
      id: 'glm',
      name: 'GLM (Zhipu)',
      test: async () => {
        const key = keys.glm;
        if (!key) return { name: 'GLM', ok: false, message: '키 미등록' };
        const spinner = ora('GLM API 확인 중...').start();
        try {
          const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'glm-4-flash',
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 5,
            }),
          });
          if (res.ok) {
            spinner.succeed('GLM — 작동 확인!');
            return { name: 'GLM', ok: true, message: '작동 확인' };
          }
          spinner.fail(`GLM — HTTP ${res.status}`);
          return { name: 'GLM', ok: false, message: `HTTP ${res.status}` };
        } catch (e: any) {
          spinner.fail(`GLM — ${e.message}`);
          return { name: 'GLM', ok: false, message: e.message };
        }
      },
    },
  ];

  // 채널 봇 토큰 검증
  const channelTests: typeof llmTests = [
    {
      id: 'telegram',
      name: 'Telegram Bot',
      test: async () => {
        const key = keys.telegram;
        if (!key) return { name: 'Telegram', ok: false, message: '토큰 미등록' };
        const spinner = ora('Telegram Bot 확인 중...').start();
        try {
          const res = await fetch(`https://api.telegram.org/bot${key}/getMe`);
          const json = await res.json() as any;
          if (json.ok) {
            spinner.succeed(`Telegram — @${json.result.username} 작동 확인!`);
            return { name: 'Telegram', ok: true, message: `@${json.result.username}` };
          }
          spinner.fail(`Telegram — ${json.description}`);
          return { name: 'Telegram', ok: false, message: json.description };
        } catch (e: any) {
          spinner.fail(`Telegram — ${e.message}`);
          return { name: 'Telegram', ok: false, message: e.message };
        }
      },
    },
    {
      id: 'slack',
      name: 'Slack Bot',
      test: async () => {
        const key = keys.slack;
        if (!key) return { name: 'Slack', ok: false, message: '토큰 미등록' };
        const spinner = ora('Slack Bot 확인 중...').start();
        try {
          const res = await fetch('https://slack.com/api/auth.test', {
            headers: { 'Authorization': `Bearer ${key}` },
          });
          const json = await res.json() as any;
          if (json.ok) {
            spinner.succeed(`Slack — ${json.team} / ${json.user} 작동 확인!`);
            return { name: 'Slack', ok: true, message: `${json.team}/${json.user}` };
          }
          spinner.fail(`Slack — ${json.error}`);
          return { name: 'Slack', ok: false, message: json.error };
        } catch (e: any) {
          spinner.fail(`Slack — ${e.message}`);
          return { name: 'Slack', ok: false, message: e.message };
        }
      },
    },
    {
      id: 'discordBot',
      name: 'Discord Bot',
      test: async () => {
        const key = keys.discordBot;
        if (!key) return { name: 'Discord', ok: false, message: '토큰 미등록' };
        const spinner = ora('Discord Bot 확인 중...').start();
        try {
          const res = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { 'Authorization': `Bot ${key}` },
          });
          const json = await res.json() as any;
          if (res.ok) {
            spinner.succeed(`Discord — ${json.username}#${json.discriminator} 작동 확인!`);
            return { name: 'Discord', ok: true, message: json.username };
          }
          spinner.fail(`Discord — ${json.message || res.status}`);
          return { name: 'Discord', ok: false, message: json.message || `HTTP ${res.status}` };
        } catch (e: any) {
          spinner.fail(`Discord — ${e.message}`);
          return { name: 'Discord', ok: false, message: e.message };
        }
      },
    },
  ];

  // 등록된 키만 테스트
  const allTests = [...llmTests, ...channelTests].filter(t => keys[t.id]);

  if (allTests.length === 0) {
    ui.warn('등록된 키가 없어서 테스트할 항목이 없습니다.');
    return false;
  }

  // 순차 실행 (rate limit 방지)
  for (const test of allTests) {
    const result = await test.test();
    results.push(result);
  }

  // 결과 요약
  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  console.log();
  console.log(chalk.bold('━'.repeat(60)));
  ui.heading('검증 결과');
  console.log();
  ui.table(
    ['서비스', '상태', '상세'],
    results.map(r => [
      r.name,
      r.ok ? chalk.green('✓ 작동') : chalk.red('✗ 실패'),
      r.ok ? chalk.dim(r.message) : chalk.yellow(r.message),
    ]),
  );

  console.log();
  if (passed.length > 0) {
    ui.success(`${passed.length}/${results.length} 서비스 작동 확인!`);
  }
  if (failed.length > 0) {
    ui.warn(`${failed.length}개 실패 — 키를 확인하세요.`);
  }

  // 더 넣을 키 있는지 물어보기
  const unregisteredLLMs = EXTRA_LLM_PROVIDERS.filter(p => !keys[p.id]);
  const unregisteredChannels = CHANNEL_TOKENS.filter(c => !keys[c.id]);
  const hasMore = unregisteredLLMs.length > 0 || unregisteredChannels.length > 0;

  if (hasMore) {
    console.log();
    const missing: string[] = [];
    if (unregisteredLLMs.length) missing.push(`LLM: ${unregisteredLLMs.map(p => p.name).join(', ')}`);
    if (unregisteredChannels.length) missing.push(`채널: ${unregisteredChannels.map(c => c.name.split(' ')[0]).join(', ')}`);
    ui.info(`미등록: ${missing.join('  |  ')}`);

    const { addMore } = await inquirer.prompt([{
      type: 'confirm',
      name: 'addMore',
      message: '더 넣을 키가 있을까요?',
      default: false,
    }]);

    if (addMore) {
      if (unregisteredLLMs.length) await collectExtraLLMKeys();
      if (unregisteredChannels.length) await collectChannelKeys();

      // 새로 추가된 것만 재검증
      const newKeys = getAllKeys();
      const newTests = [...llmTests, ...channelTests].filter(t => newKeys[t.id] && !keys[t.id]);
      if (newTests.length > 0) {
        console.log();
        ui.heading('추가 키 검증');
        for (const test of newTests) {
          await test.test();
        }
      }

      return true; // 키가 추가됨 → docker-compose 재생성 필요
    }
  }

  return false; // 변경 없음
}

function buildDockerCompose(envVars: string[], memLimit?: string, rt?: RuntimeConfig): string {
  const r = rt || RUNTIMES.nanobot;
  const mem = memLimit || r.memDefault;
  const swapLimit = mem === '512m' ? '1g' : mem === '256m' ? '512m' : mem.replace(/(\d+)g/, (_, n: string) => `${Number(n) * 2}g`);
  const dataDir = r.id === 'nanobot' ? '/app/data' : r.id === 'zeroclaw' ? '/data' : '/app/data';

  return `version: "3.8"
services:
  ${r.dirName}:
    image: ${r.image}
    container_name: ${r.dirName}
    restart: unless-stopped
    ports:
      - "${r.port}:${r.port}"
    mem_limit: ${mem}
    memswap_limit: ${swapLimit}
    environment:
${envVars.map(e => `      - ${e}`).join('\n')}
    volumes:
      - ${r.dirName}-data:${dataDir}
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  ${r.dirName}-data:
`;
}

// ─── Status / Logs / Start / Stop / Update ───

function getServerConfig() {
  const ocConfig = config.get('openclaw') as any;
  if (!ocConfig?.serverIp) {
    ui.error('에이전트가 설정되지 않았습니다. freestack agent deploy 먼저.');
    return null;
  }
  return ocConfig;
}

function getSavedRuntime(): RuntimeConfig {
  const ocConfig = config.get('openclaw') as any;
  const rtId = (ocConfig?.runtime || DEFAULT_RUNTIME) as AgentRuntime;
  return RUNTIMES[rtId] || RUNTIMES.nanobot;
}

function execOnServer(ocConfig: any, cmd: string): string {
  const user = ocConfig.sshUser || 'ubuntu';
  if (ocConfig.type === 'homeserver') {
    return sshExec(ocConfig.tailscaleIp || ocConfig.serverIp, cmd, undefined, user);
  }
  return sshExec(ocConfig.serverIp, cmd, ocConfig.sshKeyPath, user);
}

agentCommand
  .command('status')
  .description('에이전트 실행 상태 확인')
  .action(async () => {
    const oc = getServerConfig();
    if (!oc) return;
    const rt = getSavedRuntime();

    const spinner = ora('상태 확인 중...').start();
    try {
      const status = execOnServer(oc, `docker ps --filter name=${rt.dirName} --format "{{.Status}}"`);
      const stats = execOnServer(oc, `docker stats ${rt.dirName} --no-stream --format "CPU: {{.CPUPerc}}, MEM: {{.MemUsage}}"`).trim();
      spinner.stop();

      if (status.trim()) {
        ui.success(`${rt.name}: ${chalk.green(status.trim())}`);
        console.log(`  ${stats}`);
        ui.keyValue({
          '런타임': rt.name,
          'URL': `http://${oc.tailscaleIp || oc.serverIp}:${rt.port}`,
          'Provider': oc.provider || '-',
          'Type': oc.type === 'homeserver' ? '🏠 홈서버' : '🖥️  원격 VM',
        });
      } else {
        ui.warn(`${rt.name}이 실행중이 아닙니다.`);
        ui.info('시작: freestack agent start');
      }
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

agentCommand
  .command('logs')
  .description('에이전트 로그 보기')
  .option('-n, --lines <n>', '줄 수', '50')
  .action(async (opts) => {
    const oc = getServerConfig();
    if (!oc) return;
    const rt = getSavedRuntime();
    try {
      console.log(execOnServer(oc, `docker logs ${rt.dirName} --tail ${opts.lines}`));
    } catch (e: any) {
      ui.error(e.message);
    }
  });

agentCommand
  .command('start')
  .description('에이전트 시작')
  .action(async () => {
    const oc = getServerConfig();
    if (!oc) return;
    const rt = getSavedRuntime();
    const spinner = ora(`${rt.name} 시작 중...`).start();
    try {
      execOnServer(oc, `cd ~/${rt.dirName} && docker compose up -d`);
      spinner.succeed(`${rt.name} 시작됨`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

agentCommand
  .command('stop')
  .description('에이전트 중지')
  .action(async () => {
    const oc = getServerConfig();
    if (!oc) return;
    const rt = getSavedRuntime();
    const spinner = ora(`${rt.name} 중지 중...`).start();
    try {
      execOnServer(oc, `cd ~/${rt.dirName} && docker compose down`);
      spinner.succeed(`${rt.name} 중지됨`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

agentCommand
  .command('update')
  .description('에이전트 최신 버전으로 업데이트')
  .action(async () => {
    const oc = getServerConfig();
    if (!oc) return;
    const rt = getSavedRuntime();
    const spinner = ora(`${rt.name} 업데이트 중...`).start();
    try {
      execOnServer(oc, `cd ~/${rt.dirName} && docker compose pull && docker compose up -d`);
      spinner.succeed(`${rt.name} 업데이트 완료`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

agentCommand
  .command('pricing')
  .description('클라우드 서버 가격 비교')
  .action(() => showCloudPricing());

// ─── Usecases ───

import { USECASES, USECASE_CATEGORIES, ENV_VAR_REGISTRY } from '../data/usecases.js';
import { getAllKeys } from './keys.js';
import * as fs from 'fs';
import * as path from 'path';

agentCommand
  .command('usecases')
  .description('유즈케이스 템플릿 설치 (멀티셀렉트)')
  .option('-l, --list', '목록만 보기')
  .action(async (opts) => {
    if (opts.list) {
      showUsecaseList();
      return;
    }

    console.log();
    ui.heading('OpenClaw 유즈케이스 설치');
    ui.info('체크하여 원하는 유즈케이스를 선택하세요. (스페이스바로 선택, Enter로 확인)');
    console.log();

    // Group by category for display
    const choices: any[] = [];
    for (const cat of USECASE_CATEGORIES) {
      choices.push(new inquirer.Separator(`\n── ${cat.name} ──`));
      for (const ucId of cat.usecases) {
        const uc = USECASES.find(u => u.id === ucId)!;
        choices.push({
          name: `${uc.emoji} ${uc.name} — ${chalk.dim(uc.description.substring(0, 60) + '...')}`,
          value: uc.id,
          checked: false,
        });
      }
    }

    const { selected } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selected',
      message: '설치할 유즈케이스 선택:',
      choices,
      pageSize: 20,
    }]);

    if (!selected.length) {
      ui.info('선택된 유즈케이스가 없습니다.');
      return;
    }

    const selectedUsecases = USECASES.filter(u => selected.includes(u.id));

    // Show summary
    console.log();
    ui.heading(`${selectedUsecases.length}개 유즈케이스 설치`);

    // Collect all required channels & envVars
    const allChannels = new Set<string>();
    const allEnvVars = new Set<string>();
    const allSkills = new Set<string>();

    for (const uc of selectedUsecases) {
      uc.channels.forEach(c => allChannels.add(c));
      uc.envVars?.forEach(e => allEnvVars.add(e));
      uc.skills.forEach(s => allSkills.add(s));
    }

    if (allChannels.size) {
      ui.heading('필요한 채널 연동');
      for (const ch of allChannels) {
        const icon = ch === 'telegram' ? '💬' : ch === 'slack' ? '💼' : ch === 'discord' ? '🎮' : '📧';
        console.log(`  ${icon} ${ch}`);
      }
    }

    if (allSkills.size) {
      console.log();
      ui.heading('필요한 스킬');
      for (const skill of allSkills) {
        console.log(`  • ${skill}`);
      }
    }

    if (allEnvVars.size) {
      console.log();
      ui.heading('필요한 환경변수');
      for (const env of allEnvVars) {
        console.log(`  • ${env}`);
      }
    }

    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: '설치를 진행할까요?',
      default: true,
    }]);

    if (!proceed) return;

    // ─── Interactive Q&A: 각 유즈케이스별 질문 → placeholder 치환 ───
    const filledPrompts = new Map<string, string>();

    for (const uc of selectedUsecases) {
      if (!uc.questions || uc.questions.length === 0) {
        filledPrompts.set(uc.id, uc.setupPrompt);
        continue;
      }

      console.log();
      console.log(chalk.bold('━'.repeat(60)));
      ui.heading(`${uc.emoji} ${uc.name} — 설정 질문`);
      console.log(chalk.dim(uc.description));
      console.log();

      let prompt = uc.setupPrompt;

      for (const q of uc.questions) {
        const promptConfig: any = {
          type: q.type === 'editor' ? 'editor' : q.type === 'list' ? 'list' : 'input',
          name: 'value',
          message: q.message,
        };
        if (q.default) promptConfig.default = q.default;
        if (q.choices) promptConfig.choices = q.choices;

        const { value } = await inquirer.prompt([promptConfig]);

        if (value && value.trim()) {
          prompt = prompt.split(q.placeholder).join(value.trim());
        }
        // 빈 입력이면 placeholder 그대로 유지 (나중에 수동 편집 가능)
      }

      filledPrompts.set(uc.id, prompt);
    }

    // ─── API 키 / OAuth 토큰 수집 ───
    if (allEnvVars.size > 0) {
      const keys = getAllKeys();
      const missingVars: typeof ENV_VAR_REGISTRY = [];

      for (const envName of allEnvVars) {
        const meta = ENV_VAR_REGISTRY.find(r => r.envVar === envName);
        if (!meta) continue;
        if (keys[meta.keyId]) continue; // 이미 저장됨
        missingVars.push(meta);
      }

      if (missingVars.length > 0) {
        console.log();
        console.log(chalk.bold('━'.repeat(60)));
        ui.heading('API 키 / OAuth 설정');
        ui.info(`선택한 유즈케이스에 ${chalk.yellow(String(missingVars.length))}개 API 키가 필요합니다.`);
        console.log();

        for (const meta of missingVars) {
          console.log(chalk.bold(`${meta.name}`));
          console.log(chalk.dim(meta.description));
          if (meta.oauthNote) {
            console.log(chalk.magenta(`  OAuth: ${meta.oauthNote}`));
          }
          console.log();

          // 가이드 표시
          console.log(chalk.cyan('설정 방법:'));
          meta.instructions.split('\n').forEach(line => console.log(`  ${line}`));
          console.log();

          // 브라우저 오픈 제안
          const { openBrowser } = await inquirer.prompt([{
            type: 'confirm',
            name: 'openBrowser',
            message: `브라우저에서 ${meta.name} 열기? (${meta.signupUrl})`,
            default: true,
          }]);

          if (openBrowser) {
            try {
              const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
              execSync(`${cmd} "${meta.signupUrl}"`, { stdio: 'ignore' });
            } catch {}
            await inquirer.prompt([{
              type: 'confirm',
              name: 'ready',
              message: '토큰/키를 복사했나요?',
              default: true,
            }]);
          }

          const { apiKey } = await inquirer.prompt([{
            type: 'input',
            name: 'apiKey',
            message: `${meta.name} 키 입력 (건너뛰려면 Enter):`,
            validate: (v: string) => {
              if (!v) return true; // 건너뛰기 허용
              if (meta.prefix && !v.startsWith(meta.prefix)) {
                return `${meta.prefix}로 시작해야 합니다`;
              }
              return true;
            },
          }]);

          if (apiKey && apiKey.trim()) {
            keys[meta.keyId] = apiKey.trim();
            config.set('keys' as any, keys);
            ui.success(`${meta.name} 저장됨`);
          } else {
            ui.info(`건너뜀 — 나중에: ${chalk.cyan(`freestack keys set ${meta.keyId}`)}`);
          }
          console.log();
        }
      } else {
        // 모든 키가 이미 있음
        const setVarNames = [...allEnvVars].filter(e => {
          const meta = ENV_VAR_REGISTRY.find(r => r.envVar === e);
          return meta && keys[meta.keyId];
        });
        if (setVarNames.length > 0) {
          console.log();
          ui.success(`필요한 API 키 ${setVarNames.length}개 모두 설정 완료`);
        }
      }
    }

    // ─── 채널 연동 확인 ───
    const channelEnvMap: Record<string, string> = {
      telegram: 'TELEGRAM_BOT_TOKEN',
      slack: 'SLACK_BOT_TOKEN',
      discord: 'DISCORD_BOT_TOKEN',
    };

    if (allChannels.size > 0) {
      const keys = getAllKeys();
      const missingChannels: string[] = [];

      for (const ch of allChannels) {
        const envName = channelEnvMap[ch];
        if (!envName) continue;
        const meta = ENV_VAR_REGISTRY.find(r => r.envVar === envName);
        if (!meta) continue;
        if (keys[meta.keyId]) continue;
        missingChannels.push(ch);
      }

      if (missingChannels.length > 0) {
        console.log();
        ui.heading('채널 봇 토큰 설정');
        ui.info(`선택한 유즈케이스에 ${chalk.yellow(missingChannels.join(', '))} 채널 연동이 필요합니다.`);

        for (const ch of missingChannels) {
          const envName = channelEnvMap[ch];
          const meta = ENV_VAR_REGISTRY.find(r => r.envVar === envName)!;

          console.log();
          console.log(chalk.bold(`${meta.name}`));
          if (meta.oauthNote) console.log(chalk.magenta(`  OAuth: ${meta.oauthNote}`));
          console.log(chalk.cyan('설정 방법:'));
          meta.instructions.split('\n').forEach(line => console.log(`  ${line}`));
          console.log();

          const { openBrowser } = await inquirer.prompt([{
            type: 'confirm',
            name: 'openBrowser',
            message: `브라우저에서 ${meta.name} 열기?`,
            default: true,
          }]);

          if (openBrowser) {
            try {
              const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
              execSync(`${cmd} "${meta.signupUrl}"`, { stdio: 'ignore' });
            } catch {}
            await inquirer.prompt([{
              type: 'confirm',
              name: 'ready',
              message: '토큰을 복사했나요?',
              default: true,
            }]);
          }

          const { apiKey } = await inquirer.prompt([{
            type: 'input',
            name: 'apiKey',
            message: `${meta.name} 토큰 입력 (건너뛰려면 Enter):`,
            validate: (v: string) => {
              if (!v) return true;
              if (meta.prefix && !v.startsWith(meta.prefix)) return `${meta.prefix}로 시작해야 합니다`;
              return true;
            },
          }]);

          if (apiKey && apiKey.trim()) {
            keys[meta.keyId] = apiKey.trim();
            config.set('keys' as any, keys);
            ui.success(`${meta.name} 저장됨`);
          } else {
            ui.info(`건너뜀 — 나중에: ${chalk.cyan(`freestack keys set ${meta.keyId}`)}`);
          }
        }
      }
    }

    // ─── 파일 생성 ───
    const ocConfig = config.get('openclaw') as any;
    const localDir = path.join(process.cwd(), 'openclaw-usecases');
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

    const spinner = ora('유즈케이스 템플릿 생성 중...').start();

    for (const uc of selectedUsecases) {
      const ucDir = path.join(localDir, uc.id);
      if (!fs.existsSync(ucDir)) fs.mkdirSync(ucDir, { recursive: true });

      const filledPrompt = filledPrompts.get(uc.id) || uc.setupPrompt;

      // Write README
      const readme = `# ${uc.emoji} ${uc.name}

${uc.description}

## 문제점
${uc.painPoint}

## 필요한 채널
${uc.channels.map(c => `- ${c}`).join('\n')}

## 필요한 스킬
${uc.skills.map(s => `- ${s}`).join('\n')}
${uc.envVars?.length ? `\n## 환경변수\n${uc.envVars.map(e => `- ${e}`).join('\n')}` : ''}

## 설정 프롬프트

아래 프롬프트를 OpenClaw/NanoClaw에 붙여넣으세요:

\`\`\`
${filledPrompt}
\`\`\`

## 원본
${uc.source}
`;
      fs.writeFileSync(path.join(ucDir, 'README.md'), readme);

      // Write prompt file (for easy copy-paste)
      fs.writeFileSync(path.join(ucDir, 'prompt.txt'), filledPrompt);
    }

    // Write master setup prompt that combines all selected usecases
    const masterPrompt = selectedUsecases.map(uc =>
      `## ${uc.emoji} ${uc.name}\n\n${filledPrompts.get(uc.id) || uc.setupPrompt}`
    ).join('\n\n---\n\n');

    fs.writeFileSync(path.join(localDir, 'MASTER_PROMPT.md'), `# OpenClaw 통합 설정 프롬프트

아래 프롬프트를 OpenClaw/NanoClaw에 붙여넣어서 모든 유즈케이스를 한번에 설정하세요.

---

${masterPrompt}
`);

    spinner.succeed(`${selectedUsecases.length}개 유즈케이스 설정 완료 (인터랙티브)`);

    console.log();
    ui.heading('생성된 파일');
    ui.keyValue({
      '디렉토리': localDir,
      '통합 프롬프트': path.join(localDir, 'MASTER_PROMPT.md'),
    });

    console.log();
    for (const uc of selectedUsecases) {
      console.log(`  ${uc.emoji} ${path.join(localDir, uc.id, 'prompt.txt')}`);
    }

    console.log();
    ui.heading('다음 단계');
    ui.info(`1. OpenClaw/NanoClaw 채팅에 ${chalk.cyan('MASTER_PROMPT.md')} 또는 개별 ${chalk.cyan('prompt.txt')} 붙여넣기`);
    ui.info(`2. 빈 값이 있으면 파일에서 직접 수정 가능`);

    // If server is configured, offer to deploy prompts
    if (ocConfig?.serverIp || ocConfig?.tailscaleIp) {
      console.log();
      const { deploy } = await inquirer.prompt([{
        type: 'confirm',
        name: 'deploy',
        message: '서버에도 유즈케이스 파일을 배포할까요?',
        default: false,
      }]);

      if (deploy) {
        const deploySpinner = ora('서버에 배포 중...').start();
        try {
          const serverDir = '~/openclaw/usecases';
          execOnServer(ocConfig, `mkdir -p ${serverDir}`);
          // Copy master prompt
          const masterContent = fs.readFileSync(path.join(localDir, 'MASTER_PROMPT.md'), 'utf-8');
          execOnServer(ocConfig, `cat > ${serverDir}/MASTER_PROMPT.md << 'PROMPTEOF'\n${masterContent}\nPROMPTEOF`);
          deploySpinner.succeed('서버 배포 완료');
        } catch (e: any) {
          deploySpinner.warn(`서버 배포 실패: ${e.message} (로컬 파일은 유지됨)`);
        }
      }
    }
  });

function showUsecaseList() {
  console.log();
  ui.heading('OpenClaw 유즈케이스 카탈로그');
  console.log();

  for (const cat of USECASE_CATEGORIES) {
    ui.heading(cat.name);
    for (const ucId of cat.usecases) {
      const uc = USECASES.find(u => u.id === ucId)!;
      console.log(`  ${uc.emoji} ${chalk.bold(uc.name)}`);
      console.log(`    ${chalk.dim(uc.description)}`);
      console.log(`    채널: ${uc.channels.map(c => chalk.cyan(c)).join(', ')}  스킬: ${uc.skills.map(s => chalk.yellow(s)).join(', ') || chalk.dim('없음')}`);
      console.log();
    }
  }

  ui.info(`설치: ${chalk.cyan('freestack agent usecases')}`);
}
