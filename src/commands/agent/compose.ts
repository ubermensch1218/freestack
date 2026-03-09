import { type RuntimeConfig, RUNTIMES, execOnServer } from './runtime.js';
import { getEnvVarsForDeploy } from '../keys.js';

export function buildEnvVars(provider: string, apiKey: string, ollamaModel?: string, rt?: RuntimeConfig): string[] {
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

export function buildDockerCompose(envVars: string[], memLimit?: string, rt?: RuntimeConfig): string {
  const r = rt || RUNTIMES.nanobot;
  const mem = memLimit || r.memDefault;
  const swapLimit = mem === '512m' ? '1g' : mem === '256m' ? '512m' : mem.replace(/(\d+)g/, (_, n: string) => `${Number(n) * 2}g`);

  if (r.id === 'nanobot') {
    // Nanobot: gateway 모드, ~/.nanobot 볼륨, 포트 18790
    return `services:
  nanobot:
    image: ${r.image}
    container_name: nanobot
    entrypoint: ["/usr/local/bin/nanobot"]
    command: ["gateway"]
    restart: unless-stopped
    ports:
      - "${r.port}:${r.port}"
    mem_limit: ${mem}
    memswap_limit: ${swapLimit}
    environment:
${envVars.map(e => `      - ${e}`).join('\n')}
    volumes:
      - nanobot-config:/root/.nanobot
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  nanobot-config:
`;
  }

  const dataDir = r.id === 'zeroclaw' ? '/data' : '/app/data';
  return `services:
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

/**
 * Nanobot config.json을 SSH로 직접 패치 (env vars 대신)
 * docker volume에 있는 config.json을 python3으로 수정
 */
export function patchNanobotConfig(ocConfig: any, opts: {
  model?: string;
  provider?: string;
  providers?: Record<string, string>;
  telegram?: { token: string };
  slack?: { botToken: string; appToken: string };
  discord?: { token: string };
}): void {
  const configPath = `/var/lib/docker/volumes/nanobot_nanobot-config/_data/config.json`;

  const patches: string[] = [];

  if (opts.model) patches.push(`c["agents"]["defaults"]["model"] = "${opts.model}"`);
  if (opts.provider) patches.push(`c["agents"]["defaults"]["provider"] = "${opts.provider}"`);

  if (opts.providers) {
    for (const [prov, key] of Object.entries(opts.providers)) {
      patches.push(`c["providers"]["${prov}"]["apiKey"] = "${key}"`);
    }
  }

  if (opts.telegram) {
    patches.push(`c["channels"]["telegram"]["enabled"] = True`);
    patches.push(`c["channels"]["telegram"]["token"] = "${opts.telegram.token}"`);
    patches.push(`c["channels"]["telegram"]["allowFrom"] = ["*"]`);
  }

  if (opts.slack) {
    patches.push(`c["channels"]["slack"]["enabled"] = True`);
    patches.push(`c["channels"]["slack"]["botToken"] = "${opts.slack.botToken}"`);
    patches.push(`c["channels"]["slack"]["appToken"] = "${opts.slack.appToken}"`);
    patches.push(`c["channels"]["slack"]["allowFrom"] = ["*"]`);
  }

  if (opts.discord) {
    patches.push(`c["channels"]["discord"]["enabled"] = True`);
    patches.push(`c["channels"]["discord"]["token"] = "${opts.discord.token}"`);
    patches.push(`c["channels"]["discord"]["allowFrom"] = ["*"]`);
  }

  if (patches.length === 0) return;

  const scriptLines = [
    'import json',
    `with open("${configPath}") as f:`,
    '    c = json.load(f)',
    ...patches,
    `with open("${configPath}", "w") as f:`,
    '    json.dump(c, f, indent=2)',
    'print("OK")',
  ];

  const heredocScript = scriptLines.join('\n');
  execOnServer(ocConfig, `sudo python3 << 'PYEOF'\n${heredocScript}\nPYEOF`);
}
