import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { config } from '../../services/config.js';
import * as ui from '../../utils/ui.js';
import { getAllKeys } from '../keys.js';

export const ALL_LLM_PROVIDERS = [
  { id: 'anthropic', name: 'Claude (Anthropic)', envVar: 'ANTHROPIC_API_KEY', prefix: 'sk-ant-', hint: '기본 LLM' },
  { id: 'openai',  name: 'OpenAI',        envVar: 'OPENAI_API_KEY',   prefix: 'sk-',  hint: 'GPT-4o 등' },
  { id: 'google',  name: 'Google Gemini',  envVar: 'GOOGLE_API_KEY',   prefix: '',     hint: 'Gemini, 무료 티어 있음' },
  { id: 'kimi',    name: 'Kimi (Moonshot)', envVar: 'MOONSHOT_API_KEY', prefix: 'sk-',  hint: '중국 LLM, 저렴' },
  { id: 'glm',     name: 'GLM (Zhipu)',    envVar: 'ZHIPU_API_KEY',    prefix: '',     hint: '중국 LLM, 저렴' },
];

export const EXTRA_LLM_PROVIDERS = ALL_LLM_PROVIDERS.filter(p => p.id !== 'anthropic');

export const CHANNEL_TOKENS = [
  { id: 'telegram',   name: 'Telegram Bot Token',  envVar: 'TELEGRAM_BOT_TOKEN',  prefix: '',     hint: '@BotFather에서 발급' },
  { id: 'slack',      name: 'Slack Bot Token',      envVar: 'SLACK_BOT_TOKEN',     prefix: 'xoxb-', hint: 'api.slack.com/apps' },
  { id: 'slackApp',   name: 'Slack App Token',      envVar: 'SLACK_APP_TOKEN',     prefix: 'xapp-', hint: 'Socket Mode용' },
  { id: 'discordBot', name: 'Discord Bot Token',    envVar: 'DISCORD_BOT_TOKEN',   prefix: '',     hint: 'discord.com/developers' },
];

export async function collectAllLLMKeys() {
  const keys = getAllKeys();

  console.log();
  ui.heading('LLM API 키 등록');
  console.log(chalk.dim('  조작: ↑↓ 이동 / Space 선택·해제 / a 전체선택 / Enter 확인'));
  console.log();

  // 전체 프로바이더를 보여주되, 이미 등록된 건 체크 + 표시
  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: '사용할 LLM 선택:',
    choices: ALL_LLM_PROVIDERS.map(p => {
      const registered = !!keys[p.id];
      return {
        name: registered
          ? `${p.name} — ${chalk.green('✓ 등록됨')}`
          : `${p.name} — ${chalk.dim(p.hint)}`,
        value: p.id,
        checked: registered || p.id === 'anthropic',
      };
    }),
  }]);

  if (selected.length === 0) {
    ui.warn('LLM이 선택되지 않았습니다. 나중에 freestack keys set 으로 등록하세요.');
    return;
  }

  // 선택됐는데 키가 없는 것만 입력 요청
  for (const id of selected) {
    if (keys[id]) continue; // 이미 등록됨 → 건너뜀
    const p = ALL_LLM_PROVIDERS.find(x => x.id === id)!;
    const { value } = await inquirer.prompt([{
      type: 'input',
      name: 'value',
      message: `${p.name} API Key${p.prefix ? ` (${p.prefix}...)` : ''}:`,
      validate: (v: string) => {
        if (!v) return '키를 입력하세요 (건너뛰려면 Ctrl+C 후 재실행)';
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

export async function collectExtraLLMKeys() {
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

export async function collectChannelKeys() {
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
  ui.info('Telegram/Slack/Discord로 에이전트에 명령을 보내려면 봇 토큰이 필요합니다.');
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

interface VerifyResult {
  name: string;
  ok: boolean;
  message: string;
}

export async function verifyAllKeys(): Promise<boolean> {
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
