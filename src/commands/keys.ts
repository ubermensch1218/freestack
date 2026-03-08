import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { config } from '../services/config.js';
import * as ui from '../utils/ui.js';

// All API keys managed in one place
const KEY_DEFS = [
  { id: 'anthropic', name: 'Anthropic (Claude)', envVar: 'ANTHROPIC_API_KEY', prefix: 'sk-ant-', configPath: 'keys.anthropic' },
  { id: 'openai', name: 'OpenAI', envVar: 'OPENAI_API_KEY', prefix: 'sk-', configPath: 'keys.openai' },
  { id: 'google', name: 'Google Gemini', envVar: 'GOOGLE_API_KEY', prefix: '', configPath: 'keys.google' },
  { id: 'resend', name: 'Resend (Email)', envVar: 'RESEND_API_KEY', prefix: 're_', configPath: 'keys.resend' },
  { id: 'slack', name: 'Slack Bot', envVar: 'SLACK_BOT_TOKEN', prefix: 'xoxb-', configPath: 'keys.slack' },
  { id: 'slackApp', name: 'Slack App Token', envVar: 'SLACK_APP_TOKEN', prefix: 'xapp-', configPath: 'keys.slackApp' },
  { id: 'telegram', name: 'Telegram Bot', envVar: 'TELEGRAM_BOT_TOKEN', prefix: '', configPath: 'keys.telegram' },
  { id: 'cloudflare', name: 'Cloudflare', envVar: 'CLOUDFLARE_API_TOKEN', prefix: '', configPath: 'keys.cloudflare' },
  { id: 'kimi', name: 'Kimi (Moonshot)', envVar: 'MOONSHOT_API_KEY', prefix: 'sk-', configPath: 'keys.kimi' },
  { id: 'glm', name: 'GLM (Zhipu)', envVar: 'ZHIPU_API_KEY', prefix: '', configPath: 'keys.glm' },
  { id: 'xBearerToken', name: 'X/Twitter Bearer', envVar: 'X_BEARER_TOKEN', prefix: '', configPath: 'keys.xBearerToken' },
  { id: 'braveSearch', name: 'Brave Search', envVar: 'BRAVE_API_KEY', prefix: '', configPath: 'keys.braveSearch' },
  { id: 'githubToken', name: 'GitHub Token', envVar: 'GITHUB_TOKEN', prefix: 'ghp_', configPath: 'keys.githubToken' },
  { id: 'todoistToken', name: 'Todoist', envVar: 'TODOIST_API_TOKEN', prefix: '', configPath: 'keys.todoistToken' },
  { id: 'discordBot', name: 'Discord Bot', envVar: 'DISCORD_BOT_TOKEN', prefix: '', configPath: 'keys.discordBot' },
] as const;

export type KeyId = typeof KEY_DEFS[number]['id'];

export function getKey(id: string): string | undefined {
  return (config.get('keys') as any)?.[id];
}

export function getAllKeys(): Record<string, string> {
  return (config.get('keys') as any) || {};
}

export function getEnvVarsForDeploy(): Record<string, string> {
  const keys = getAllKeys();
  const env: Record<string, string> = {};
  for (const def of KEY_DEFS) {
    if (keys[def.id]) {
      env[def.envVar] = keys[def.id];
    }
  }
  return env;
}

export const keysCommand = new Command('keys')
  .description('API 키 통합 관리');

keysCommand
  .command('set')
  .description('API 키 추가/수정')
  .argument('[keyId]', 'Key ID (anthropic, openai, slack, telegram, ...)')
  .action(async (keyId?: string) => {
    if (keyId) {
      const def = KEY_DEFS.find(k => k.id === keyId);
      if (!def) {
        ui.error(`알 수 없는 키: ${keyId}`);
        ui.info(`사용 가능: ${KEY_DEFS.map(k => k.id).join(', ')}`);
        return;
      }

      const { value } = await inquirer.prompt([{
        type: 'input',
        name: 'value',
        message: `${def.name} API Key:`,
        default: getKey(def.id),
        validate: (v: string) => {
          if (!v) return '키를 입력하세요';
          if (def.prefix && !v.startsWith(def.prefix)) return `${def.prefix}로 시작해야 합니다`;
          return true;
        },
      }]);

      const keys = getAllKeys();
      keys[def.id] = value;
      config.set('keys' as any, keys);
      ui.success(`${def.name} 키 저장됨`);
      return;
    }

    // Interactive: select which keys to set
    const { selectedKeys } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedKeys',
      message: '설정할 API 키를 선택하세요:',
      choices: KEY_DEFS.map(k => ({
        name: `${k.name} ${getKey(k.id) ? chalk.green('(설정됨)') : chalk.dim('(미설정)')}`,
        value: k.id,
        checked: false,
      })),
    }]);

    const keys = getAllKeys();

    for (const keyId of selectedKeys) {
      const def = KEY_DEFS.find(k => k.id === keyId)!;
      const { value } = await inquirer.prompt([{
        type: 'input',
        name: 'value',
        message: `${def.name} API Key:`,
        default: getKey(def.id),
      }]);
      if (value) keys[def.id] = value;
    }

    config.set('keys' as any, keys);
    ui.success(`${selectedKeys.length}개 키 저장됨`);
  });

keysCommand
  .command('list')
  .description('저장된 API 키 목록')
  .option('--show', '키 값 표시 (마스킹 해제)', false)
  .action((opts) => {
    ui.heading('API Keys');
    const keys = getAllKeys();

    ui.table(
      ['서비스', '환경변수', '상태', '값'],
      KEY_DEFS.map(def => {
        const val = keys[def.id];
        const masked = val
          ? (opts.show ? val : val.substring(0, 8) + '...' + val.substring(val.length - 4))
          : '';
        return [
          def.name,
          chalk.dim(def.envVar),
          val ? chalk.green('설정됨') : chalk.dim('-'),
          masked,
        ];
      }),
    );

    console.log();
    ui.info('키 추가: freestack keys set [keyId]');
    ui.info('전체 보기: freestack keys list --show');
  });

keysCommand
  .command('remove <keyId>')
  .description('API 키 삭제')
  .action((keyId: string) => {
    const keys = getAllKeys();
    if (!keys[keyId]) {
      ui.warn(`${keyId} 키가 없습니다.`);
      return;
    }
    delete keys[keyId];
    config.set('keys' as any, keys);
    ui.success(`${keyId} 키 삭제됨`);
  });

keysCommand
  .command('export')
  .description('환경변수 형식으로 출력 (.env 파일용)')
  .action(() => {
    const env = getEnvVarsForDeploy();
    if (Object.keys(env).length === 0) {
      ui.info('저장된 키가 없습니다.');
      return;
    }
    for (const [k, v] of Object.entries(env)) {
      console.log(`${k}=${v}`);
    }
    console.log();
    ui.info('파일로 저장: freestack keys export > .env');
  });
