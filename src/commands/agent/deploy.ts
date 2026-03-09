import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { config } from '../../services/config.js';
import { getAllKeys } from '../keys.js';
import * as ui from '../../utils/ui.js';
import {
  type AgentRuntime,
  type RuntimeConfig,
  RUNTIMES,
  sshExec,
  selectRuntime,
  execOnServer,
} from './runtime.js';
import { buildEnvVars, buildDockerCompose, patchNanobotConfig } from './compose.js';
import {
  EXTRA_LLM_PROVIDERS,
  CHANNEL_TOKENS,
  collectAllLLMKeys,
  collectExtraLLMKeys,
  collectChannelKeys,
  verifyAllKeys,
} from './keys-collect.js';
import { collectSkillsDuringDeploy, deploySkillsToWorkspace } from './skills-deploy.js';

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

export const CLOUD_OPTIONS = [
  { name: '서비스', plans: [
    { label: 'Hetzner CX22', spec: '2C/4GB/40GB', price: '€3.79 (~₩5,500/월)', url: 'https://www.hetzner.com/cloud/' },
    { label: 'Oracle ARM 유료', spec: '1C/4GB/50GB', price: '$11.68 (~₩16,000/월)', url: 'https://cloud.oracle.com' },
    { label: 'AWS Lightsail', spec: '2C/4GB/80GB', price: '$24 (~₩33,000/월)', url: 'https://lightsail.aws.amazon.com' },
    { label: 'GCP e2-medium', spec: '2C/4GB', price: '$24.46 (~₩34,000/월)', url: 'https://console.cloud.google.com' },
    { label: '카페24 OpenClaw VPS', spec: '2C/4GB/80GB', price: '₩66,000/월 (프리인스톨)', url: 'https://hosting.cafe24.com/?controller=new_product_page&page=openclaw-vps' },
  ]},
];

// ─── Cloud pricing info ───

export function showCloudPricing() {
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

// ─── Home server deploy (Tailscale + Docker Desktop) ───

interface TailscalePeer {
  name: string;
  ip: string;
  os: string;
  online: boolean;
  self: boolean;
}

function getTailscalePeers(): TailscalePeer[] {
  try {
    const raw = execSync('tailscale status --json', { encoding: 'utf-8', timeout: 10000 });
    const data = JSON.parse(raw);
    const peers: TailscalePeer[] = [];

    // Self
    if (data.Self) {
      peers.push({
        name: data.Self.HostName || 'this-machine',
        ip: data.Self.TailscaleIPs?.[0] || '',
        os: data.Self.OS || '',
        online: true,
        self: true,
      });
    }

    // Peers
    if (data.Peer) {
      for (const peer of Object.values(data.Peer) as any[]) {
        peers.push({
          name: peer.HostName || peer.DNSName?.split('.')[0] || 'unknown',
          ip: peer.TailscaleIPs?.[0] || '',
          os: peer.OS || '',
          online: peer.Online ?? false,
          self: false,
        });
      }
    }

    return peers;
  } catch {
    return [];
  }
}

function isTailscaleInstalled(): boolean {
  try {
    execSync('which tailscale', { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function printHomeServerManual(answers: any, apiKey: string, rt: RuntimeConfig) {
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

export async function deployHomeServer(rt: RuntimeConfig, resumeConfig?: any) {
  ui.heading(`${rt.name} — 홈서버 배포`);
  console.log();

  const ocConfig = resumeConfig || (config.get('openclaw') as any) || {};

  // 이어하기면 기존 값으로 직행
  if (resumeConfig) {
    ui.success(`이전 설정으로 이어하기: ${ocConfig.serverIp} (${ocConfig.sshUser})`);
    console.log();
    await collectAllLLMKeys();
    await collectChannelKeys();
    const keys = getAllKeys();
    const apiKey = keys.anthropic || ocConfig.anthropicKey || '';
    const answers = {
      tailscaleIp: ocConfig.tailscaleIp || ocConfig.serverIp,
      sshUser: ocConfig.sshUser,
      os: ocConfig.os || 'windows',
      provider: ocConfig.provider || 'anthropic',
      ollamaModel: ocConfig.ollamaModel,
    };
    // SSH → Docker → 배포 (아래 공통 로직으로 fall-through)
    const sshSpinner = ora('Tailscale SSH 연결 확인 중...').start();
    try {
      const result = execSync(
        `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${answers.sshUser}@${answers.tailscaleIp} "echo ok"`,
        { encoding: 'utf-8', timeout: 15000 },
      );
      if (!result.includes('ok')) throw new Error('응답 없음');
      sshSpinner.succeed('SSH 연결 성공');
    } catch {
      sshSpinner.fail('SSH 연결 실패');
      printHomeServerManual(answers, apiKey, rt);
      return;
    }
    // Docker 확인 & 배포
    const dockerSpinner2 = ora('Docker 확인 중...').start();
    try {
      sshExec(answers.tailscaleIp, 'docker --version', undefined, answers.sshUser);
      dockerSpinner2.succeed('Docker 확인됨');
    } catch {
      dockerSpinner2.fail('Docker 없음');
      printHomeServerManual(answers, apiKey, rt);
      return;
    }
    const clawSpinner2 = ora(`${rt.name} 배포 중...`).start();
    try {
      const envVars = buildEnvVars(answers.provider, apiKey, answers.ollamaModel, rt);
      const compose = buildDockerCompose(envVars, '4g', rt);
      sshExec(answers.tailscaleIp,
        `mkdir -p ~/${rt.dirName} && cat > ~/${rt.dirName}/docker-compose.yml << 'COMPOSEEOF'\n${compose}\nCOMPOSEEOF`,
        undefined, answers.sshUser);
      sshExec(answers.tailscaleIp, `cd ~/${rt.dirName} && docker compose pull && docker compose up -d`,
        undefined, answers.sshUser);
      clawSpinner2.succeed(`${rt.name} 배포 완료!`);
    } catch (e: any) {
      clawSpinner2.fail(`배포 실패: ${e.message}`);
      printHomeServerManual(answers, apiKey, rt);
    }
    return;
  }

  // ─── 1) Tailscale 자동 감지 ───
  const tsSpinner = ora('Tailscale 상태 확인 중...').start();

  if (!isTailscaleInstalled()) {
    tsSpinner.text = 'Tailscale 설치 중...';
    try {
      if (process.platform === 'darwin') {
        execSync('brew install tailscale', { encoding: 'utf-8', timeout: 120000 });
      } else {
        execSync('curl -fsSL https://tailscale.com/install.sh | sh', { encoding: 'utf-8', timeout: 120000 });
      }
      tsSpinner.succeed('Tailscale 설치 완료');

      // 로그인 안내
      ui.info('Tailscale 로그인이 필요합니다:');
      console.log(chalk.cyan('  sudo tailscale up'));
      console.log();
      const { loggedIn } = await inquirer.prompt([{
        type: 'confirm',
        name: 'loggedIn',
        message: 'tailscale up 실행 후 로그인 완료했나요?',
        default: false,
      }]);
      if (!loggedIn) {
        ui.info('tailscale up 실행 후 다시 freestack agent deploy 하세요.');
        return;
      }
    } catch (e: any) {
      tsSpinner.fail(`Tailscale 설치 실패: ${e.message}`);
      ui.info('수동 설치: https://tailscale.com/download');
      return;
    }
  }

  const peers = getTailscalePeers();
  if (peers.length === 0) {
    tsSpinner.fail('Tailscale에 연결된 기기가 없습니다.');
    ui.info('tailscale up 으로 로그인하세요.');
    return;
  }

  const self = peers.find(p => p.self);
  const remotePeers = peers.filter(p => !p.self && p.online);
  tsSpinner.succeed(`Tailscale 연결됨 (내 기기: ${self?.name || '?'}, 피어 ${remotePeers.length}대 온라인)`);
  console.log();

  // ─── 2) 타겟 기기 선택 ───
  const peerChoices = remotePeers.map(p => ({
    name: `${p.name} — ${p.ip} (${p.os})`,
    value: p.ip,
  }));
  peerChoices.push({ name: chalk.dim('직접 IP 입력'), value: '__manual__' });

  const { targetIp } = await inquirer.prompt([{
    type: 'list',
    name: 'targetIp',
    message: '배포할 홈서버 선택:',
    choices: peerChoices,
  }]);

  let tailscaleIp = targetIp;
  if (targetIp === '__manual__') {
    const { manualIp } = await inquirer.prompt([{
      type: 'input',
      name: 'manualIp',
      message: 'Tailscale IP:',
      default: ocConfig?.tailscaleIp,
      validate: (v: string) => /^\d+\.\d+\.\d+\.\d+$/.test(v) || 'IP 주소 형식',
    }]);
    tailscaleIp = manualIp;
  }

  // 선택한 피어의 OS 자동 감지
  const selectedPeer = peers.find(p => p.ip === tailscaleIp);
  const detectedOs = selectedPeer?.os?.toLowerCase().includes('windows') ? 'windows'
    : selectedPeer?.os?.toLowerCase().includes('macos') ? 'macos' : 'linux';

  // ─── 3) SSH 유저명 + OS 확인 ───
  const { sshUser, os } = await inquirer.prompt([
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
        { name: 'Windows (WSL2)', value: 'windows' },
        { name: 'Linux', value: 'linux' },
        { name: 'macOS', value: 'macos' },
      ],
      default: detectedOs,
    },
  ]);

  // ─── 4) Prerequisites: SSH 연결 → Docker 설치 확인 ───
  console.log();
  ui.heading('서버 환경 확인');

  const sshSpinner = ora('SSH 연결 확인 중...').start();
  try {
    const result = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${sshUser}@${tailscaleIp} "echo ok"`,
      { encoding: 'utf-8', timeout: 15000 },
    );
    if (!result.includes('ok')) throw new Error('응답 없음');
    sshSpinner.succeed('SSH 연결 성공');
  } catch {
    sshSpinner.fail('SSH 연결 실패');
    ui.info('홈서버에서 Tailscale SSH 활성화:');
    console.log(chalk.cyan('  tailscale up --ssh'));
    ui.info('또는 SSH 서버 설치:');
    console.log(chalk.cyan('  sudo apt install openssh-server && sudo systemctl enable ssh'));
    return;
  }

  // Docker 확인 & 자동 설치
  const dockerSpinner = ora('Docker 확인 중...').start();
  try {
    sshExec(tailscaleIp, 'docker --version', undefined, sshUser);
    dockerSpinner.succeed('Docker 설치 확인');
  } catch {
    dockerSpinner.text = 'Docker 설치 중...';
    if (os === 'windows') {
      // WSL2 안에서 docker.io 설치
      try {
        sshExec(tailscaleIp, 'sudo apt-get update -qq && sudo apt-get install -y -qq docker.io docker-compose-v2 && sudo usermod -aG docker $(whoami)', undefined, sshUser);
        dockerSpinner.succeed('Docker 설치 완료 (WSL2)');
      } catch (e: any) {
        dockerSpinner.fail(`Docker 설치 실패: ${e.message}`);
        ui.info('수동 설치: sudo apt install docker.io docker-compose-v2');
        return;
      }
    } else if (os === 'macos') {
      dockerSpinner.fail('Docker Desktop을 수동으로 설치해주세요.');
      ui.info('https://www.docker.com/products/docker-desktop/');
      return;
    } else {
      try {
        sshExec(tailscaleIp, 'sudo apt-get update -qq && sudo apt-get install -y -qq docker.io docker-compose-v2 && sudo usermod -aG docker $(whoami)', undefined, sshUser);
        dockerSpinner.succeed('Docker 설치 완료');
      } catch (e: any) {
        dockerSpinner.fail(`Docker 설치 실패: ${e.message}`);
        return;
      }
    }
  }

  // docker compose 동작 확인
  try {
    sshExec(tailscaleIp, 'docker compose version', undefined, sshUser);
  } catch {
    ui.warn('docker compose를 사용할 수 없습니다. newgrp docker 또는 재로그인이 필요할 수 있습니다.');
  }

  ui.success('서버 환경 준비 완료!');
  console.log();

  // 중간 저장 (여기까지 성공)
  config.set('openclaw' as any, {
    ...ocConfig,
    type: 'homeserver',
    runtime: rt.id,
    tailscaleIp,
    sshUser,
    serverIp: tailscaleIp,
    os,
  });

  // ─── 5) AI 프로바이더 + LLM 키 수집 ───
  ui.heading('AI 설정');

  const { provider, ollamaModel } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'AI 프로바이더:',
      choices: [
        { name: `API 키 (Claude, OpenAI, Gemini, Kimi, GLM 등) — ${chalk.green('추천')}`, value: 'anthropic' },
        { name: 'API + Ollama 병행 (로컬 GPU + API 폴백)', value: 'both' },
        { name: 'Ollama만 (로컬 GPU, API 비용 $0)', value: 'ollama' },
      ],
      default: ocConfig?.provider || 'anthropic',
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
  if (provider !== 'ollama') {
    await collectAllLLMKeys();
    const keys = getAllKeys();
    apiKey = keys.anthropic || apiKey;
  }

  // 채널 봇 토큰 수집
  await collectChannelKeys();

  // 스킬 선택 (Nanobot only)
  if (rt.id === 'nanobot') {
    await collectSkillsDuringDeploy();
  }

  // 최종 config 저장
  const answers = { tailscaleIp, sshUser, os, provider, ollamaModel };
  config.set('openclaw' as any, {
    ...ocConfig,
    type: 'homeserver',
    runtime: rt.id,
    tailscaleIp,
    sshUser,
    serverIp: tailscaleIp,
    os,
    provider,
    anthropicKey: apiKey || undefined,
    ollamaModel: ollamaModel || 'llama3.2',
  });

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

  // Nanobot: config.json 직접 패치 (env vars는 무시됨)
  const currentOcConfig = config.get('openclaw') as any;
  if (rt.id === 'nanobot') {
    const patchSpinner = ora('Nanobot 설정 적용 중...').start();
    try {
      const allKeys = getAllKeys();
      execOnServer(currentOcConfig, 'sleep 3');

      const providerMap: Record<string, string> = {};
      if (allKeys.anthropic) providerMap.anthropic = allKeys.anthropic;
      if (allKeys.openai) providerMap.openai = allKeys.openai;
      if (allKeys.glm) providerMap.zhipu = allKeys.glm;
      if (allKeys.google) providerMap.gemini = allKeys.google;
      if (allKeys.kimi) providerMap.moonshot = allKeys.kimi;

      let defaultModel = 'glm-4.5-flash';
      let defaultProvider = 'zhipu';
      if (allKeys.anthropic) { defaultModel = 'claude-sonnet-4-20250514'; defaultProvider = 'anthropic'; }
      else if (allKeys.openai) { defaultModel = 'gpt-4o'; defaultProvider = 'openai'; }
      else if (allKeys.glm) { defaultModel = 'glm-4.5-flash'; defaultProvider = 'zhipu'; }
      else if (allKeys.google) { defaultModel = 'gemini-2.0-flash'; defaultProvider = 'gemini'; }
      else if (allKeys.kimi) { defaultModel = 'moonshot-v1-8k'; defaultProvider = 'moonshot'; }

      const telegramOpts = allKeys.telegram ? { token: allKeys.telegram } : undefined;
      const slackOpts = allKeys.slack && allKeys.slackApp ? { botToken: allKeys.slack, appToken: allKeys.slackApp } : undefined;
      const discordOpts = allKeys.discordBot ? { token: allKeys.discordBot } : undefined;

      patchNanobotConfig(currentOcConfig, {
        model: defaultModel,
        provider: defaultProvider,
        providers: providerMap,
        telegram: telegramOpts,
        slack: slackOpts,
        discord: discordOpts,
      });

      execOnServer(currentOcConfig, `cd ~/${rt.dirName} && docker compose restart`);
      patchSpinner.succeed('Nanobot 설정 적용 완료');

      // 스킬 배포
      await deploySkillsToWorkspace(currentOcConfig, rt);
    } catch (e: any) {
      patchSpinner.warn(`설정 패치 실패: ${e.message} — 수동 설정 필요`);
    }
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

      // Nanobot: config.json 재패치
      if (rt.id === 'nanobot') {
        const rePatchSpinner = ora('Nanobot 설정 재적용 중...').start();
        try {
          const latestKeys = getAllKeys();
          const providerMap2: Record<string, string> = {};
          if (latestKeys.anthropic) providerMap2.anthropic = latestKeys.anthropic;
          if (latestKeys.openai) providerMap2.openai = latestKeys.openai;
          if (latestKeys.glm) providerMap2.zhipu = latestKeys.glm;
          if (latestKeys.google) providerMap2.gemini = latestKeys.google;
          if (latestKeys.kimi) providerMap2.moonshot = latestKeys.kimi;

          let dm2 = 'glm-4.5-flash'; let dp2 = 'zhipu';
          if (latestKeys.anthropic) { dm2 = 'claude-sonnet-4-20250514'; dp2 = 'anthropic'; }
          else if (latestKeys.openai) { dm2 = 'gpt-4o'; dp2 = 'openai'; }
          else if (latestKeys.glm) { dm2 = 'glm-4.5-flash'; dp2 = 'zhipu'; }
          else if (latestKeys.google) { dm2 = 'gemini-2.0-flash'; dp2 = 'gemini'; }
          else if (latestKeys.kimi) { dm2 = 'moonshot-v1-8k'; dp2 = 'moonshot'; }

          const reOcConfig = config.get('openclaw') as any;
          patchNanobotConfig(reOcConfig, {
            model: dm2,
            provider: dp2,
            providers: providerMap2,
            telegram: latestKeys.telegram ? { token: latestKeys.telegram } : undefined,
            slack: latestKeys.slack && latestKeys.slackApp ? { botToken: latestKeys.slack, appToken: latestKeys.slackApp } : undefined,
            discord: latestKeys.discordBot ? { token: latestKeys.discordBot } : undefined,
          });
          execOnServer(reOcConfig, `cd ~/${rt.dirName} && docker compose restart`);
          rePatchSpinner.succeed('Nanobot 설정 재적용 완료');
        } catch (e: any) {
          rePatchSpinner.warn(`재패치 실패: ${e.message}`);
        }
      }
    } catch (e: any) {
      redeploySpinner.warn(`재배포 실패: ${e.message} — freestack agent update 로 재시도`);
    }
  }
}

// ─── Remote Linux VM deploy (existing logic) ───

export async function deployRemoteLinux(rt: RuntimeConfig, resumeConfig?: any) {
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
        { name: `API 키 (Claude, OpenAI, Gemini, Kimi, GLM 등) — ${chalk.green('추천')}`, value: 'anthropic' },
        { name: 'API + Ollama 병행 (로컬 GPU + API 폴백)', value: 'both' },
        { name: 'Ollama만 (로컬 GPU, API 비용 $0)', value: 'ollama' },
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

export function registerDeployCommand(agentCommand: Command) {
  agentCommand
    .command('deploy')
    .description('AI 에이전트 배포 (Nanobot/OpenClaw/ZeroClaw)')
    .action(async () => {
      console.log();
      ui.heading('AI 에이전트 배포');

      // 이전 설정이 있으면 이어하기 옵션
      const saved = config.get('openclaw') as any;
      let rt: RuntimeConfig | undefined;

      if (saved?.serverIp && saved?.runtime) {
        const savedRt = RUNTIMES[saved.runtime as AgentRuntime] || RUNTIMES.nanobot;
        const { resume } = await inquirer.prompt([{
          type: 'list',
          name: 'resume',
          message: `이전 설정 발견 (${savedRt.name} → ${saved.serverIp}):`,
          choices: [
            { name: `이어하기 — ${savedRt.name}, ${saved.type === 'homeserver' ? '홈서버' : '원격VM'} ${saved.serverIp}`, value: 'continue' },
            { name: '처음부터 새로 설정', value: 'fresh' },
            { name: '📋 클라우드 가격 비교 보기', value: 'info' },
          ],
        }]);

        if (resume === 'info') {
          showCloudPricing();
          return;
        }

        if (resume === 'continue') {
          rt = savedRt;
          if (saved.type === 'homeserver') {
            await deployHomeServer(rt, saved);
          } else {
            await deployRemoteLinux(rt, saved);
          }
          return;
        }
      }

      // 1) 런타임 선택
      rt = await selectRuntime();
      console.log();
      ui.success(`런타임: ${rt.name} (${rt.lang}, ${rt.description})`);
      console.log();

      // 2) 배포 대상 선택
      const { target } = await inquirer.prompt([{
        type: 'list',
        name: 'target',
        message: '배포 대상 선택:',
        choices: [
          { name: `🏠 홈서버 (Tailscale/로컬) — ${chalk.green('$0/월')}`, value: 'homeserver' },
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
}
