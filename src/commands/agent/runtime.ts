import { execSync } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { config } from '../../services/config.js';
import * as ui from '../../utils/ui.js';

export function sshExec(ip: string, cmd: string, keyPath?: string, user = 'ubuntu'): string {
  const keyFlag = keyPath ? `-i ${keyPath}` : '';
  // cmd에 single quote가 포함될 수 있으므로 stdin으로 전달
  if (cmd.includes("'") || cmd.includes('PYEOF') || cmd.includes('<<')) {
    return execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${keyFlag} ${user}@${ip} bash -s`,
      { encoding: 'utf-8', timeout: 120000, input: cmd },
    );
  }
  return execSync(
    `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${keyFlag} ${user}@${ip} '${cmd}'`,
    { encoding: 'utf-8', timeout: 120000 },
  );
}

// ─── Runtime definitions ───

export type AgentRuntime = 'nanobot' | 'openclaw' | 'zeroclaw';

export interface RuntimeConfig {
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

export const RUNTIMES: Record<AgentRuntime, RuntimeConfig> = {
  nanobot: {
    id: 'nanobot',
    name: 'Nanobot (HKUDS)',
    image: 'smanx/nanobot:latest',
    port: 18790,
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

export const DEFAULT_RUNTIME: AgentRuntime = 'nanobot';

export async function selectRuntime(): Promise<RuntimeConfig> {
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

export function getServerConfig() {
  const ocConfig = config.get('openclaw') as any;
  if (!ocConfig?.serverIp) {
    ui.error('에이전트가 설정되지 않았습니다. freestack agent deploy 먼저.');
    return null;
  }
  return ocConfig;
}

export function getSavedRuntime(): RuntimeConfig {
  const ocConfig = config.get('openclaw') as any;
  const rtId = (ocConfig?.runtime || DEFAULT_RUNTIME) as AgentRuntime;
  return RUNTIMES[rtId] || RUNTIMES.nanobot;
}

export function execOnServer(ocConfig: any, cmd: string): string {
  const user = ocConfig.sshUser || 'ubuntu';
  if (ocConfig.type === 'homeserver') {
    return sshExec(ocConfig.tailscaleIp || ocConfig.serverIp, cmd, undefined, user);
  }
  return sshExec(ocConfig.serverIp, cmd, ocConfig.sshKeyPath, user);
}
