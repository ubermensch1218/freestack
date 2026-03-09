import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import * as ui from '../../utils/ui.js';
import { getAllKeys } from '../keys.js';
import { getServerConfig, getSavedRuntime, execOnServer } from './runtime.js';
import { patchNanobotConfig } from './compose.js';
import { collectAllLLMKeys, collectChannelKeys } from './keys-collect.js';

export function registerConfigCommand(agentCommand: Command) {
  const configCommand = agentCommand
    .command('config')
    .description('에이전트 설정 관리 (모델, 프로바이더, 채널)');

  configCommand
    .command('model')
    .description('기본 모델 변경')
    .argument('[model]', '모델명 (예: glm-4.5-flash, claude-sonnet-4-20250514)')
    .action(async (modelArg?: string) => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();

      if (rt.id !== 'nanobot') {
        ui.error('config 명령은 Nanobot 전용입니다.');
        return;
      }

      let currentModel = '(알 수 없음)';
      try {
        const result = execOnServer(oc, `sudo python3 -c "import json; c=json.load(open('/var/lib/docker/volumes/nanobot_nanobot-config/_data/config.json')); print(c['agents']['defaults'].get('model',''))"`)
        currentModel = result.trim() || '(미설정)';
      } catch {}

      let model = modelArg;
      if (!model) {
        console.log();
        ui.info(`현재 모델: ${chalk.cyan(currentModel)}`);
        console.log();

        const allKeys = getAllKeys();
        const choices: any[] = [];
        if (allKeys.glm) {
          choices.push({ name: 'glm-4.5-flash — Zhipu 무료', value: 'glm-4.5-flash' });
          choices.push({ name: 'glm-4.5 — Zhipu 유료', value: 'glm-4.5' });
          choices.push({ name: 'glm-4.7 — Zhipu 유료', value: 'glm-4.7' });
          choices.push({ name: 'glm-5 — Zhipu 유료 (최신)', value: 'glm-5' });
        }
        if (allKeys.anthropic) {
          choices.push({ name: 'claude-sonnet-4-20250514 — Anthropic', value: 'claude-sonnet-4-20250514' });
          choices.push({ name: 'claude-haiku-4-5-20251001 — Anthropic 저렴', value: 'claude-haiku-4-5-20251001' });
        }
        if (allKeys.openai) {
          choices.push({ name: 'gpt-4o — OpenAI', value: 'gpt-4o' });
          choices.push({ name: 'gpt-4o-mini — OpenAI 저렴', value: 'gpt-4o-mini' });
        }
        if (allKeys.google) {
          choices.push({ name: 'gemini-2.0-flash — Google 무료', value: 'gemini-2.0-flash' });
        }
        if (allKeys.kimi) {
          choices.push({ name: 'moonshot-v1-8k — Kimi', value: 'moonshot-v1-8k' });
        }
        choices.push({ name: '직접 입력', value: '__custom__' });

        const { selected } = await inquirer.prompt([{
          type: 'list',
          name: 'selected',
          message: '모델 선택:',
          choices,
        }]);

        if (selected === '__custom__') {
          const { custom } = await inquirer.prompt([{
            type: 'input',
            name: 'custom',
            message: '모델명 입력:',
          }]);
          model = custom;
        } else {
          model = selected;
        }
      }

      if (!model) { ui.error('모델명이 필요합니다.'); return; }

      let provider = 'auto';
      if (model.startsWith('glm-')) provider = 'zhipu';
      else if (model.startsWith('claude-')) provider = 'anthropic';
      else if (model.startsWith('gpt-')) provider = 'openai';
      else if (model.startsWith('gemini-')) provider = 'gemini';
      else if (model.startsWith('moonshot-')) provider = 'moonshot';

      const spinner = ora(`모델 변경: ${model}...`).start();
      try {
        patchNanobotConfig(oc, { model, provider });
        execOnServer(oc, `cd ~/${rt.dirName} && docker compose restart`);
        spinner.succeed(`모델 변경 완료: ${chalk.cyan(model)} (provider: ${provider})`);
      } catch (e: any) {
        spinner.fail(e.message);
      }
    });

  configCommand
    .command('provider')
    .description('프로바이더 키 관리')
    .argument('[action]', 'list | add | remove')
    .action(async (action?: string) => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();

      if (rt.id !== 'nanobot') {
        ui.error('config 명령은 Nanobot 전용입니다.');
        return;
      }

      if (!action || action === 'list') {
        const spinner = ora('프로바이더 확인 중...').start();
        try {
          const result = execOnServer(oc, `sudo python3 << 'PYEOF'\nimport json\nc=json.load(open('/var/lib/docker/volumes/nanobot_nanobot-config/_data/config.json'))\nfor name, cfg in c.get('providers', {}).items():\n    key = cfg.get('apiKey', '')\n    if key:\n        masked = key[:8] + '...' + key[-4:] if len(key) > 12 else '***'\n        print(f'{name}: {masked}')\n    else:\n        print(f'{name}: (미등록)')\nPYEOF`);
          spinner.stop();
          console.log();
          ui.heading('등록된 프로바이더');
          console.log(result);
        } catch (e: any) {
          spinner.fail(e.message);
        }
        return;
      }

      if (action === 'add') {
        await collectAllLLMKeys();

        const allKeys = getAllKeys();
        const providerMap: Record<string, string> = {};
        if (allKeys.anthropic) providerMap.anthropic = allKeys.anthropic;
        if (allKeys.openai) providerMap.openai = allKeys.openai;
        if (allKeys.glm) providerMap.zhipu = allKeys.glm;
        if (allKeys.google) providerMap.gemini = allKeys.google;
        if (allKeys.kimi) providerMap.moonshot = allKeys.kimi;

        const spinner = ora('프로바이더 키 적용 중...').start();
        try {
          patchNanobotConfig(oc, { providers: providerMap });
          execOnServer(oc, `cd ~/${rt.dirName} && docker compose restart`);
          spinner.succeed('프로바이더 키 적용 완료');
        } catch (e: any) {
          spinner.fail(e.message);
        }
        return;
      }

      ui.error('사용법: freestack agent config provider [list|add]');
    });

  configCommand
    .command('channel')
    .description('채널 설정 (Telegram/Slack/Discord)')
    .argument('[action]', 'list | add')
    .action(async (action?: string) => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();

      if (rt.id !== 'nanobot') {
        ui.error('config 명령은 Nanobot 전용입니다.');
        return;
      }

      if (!action || action === 'list') {
        const spinner = ora('채널 상태 확인 중...').start();
        try {
          const result = execOnServer(oc, `sudo python3 << 'PYEOF'\nimport json\nc=json.load(open('/var/lib/docker/volumes/nanobot_nanobot-config/_data/config.json'))\nfor name in ['telegram', 'slack', 'discord', 'whatsapp', 'email']:\n    ch = c.get('channels', {}).get(name, {})\n    enabled = ch.get('enabled', False)\n    status = 'ON' if enabled else 'OFF'\n    print(f'{name}: {status}')\nPYEOF`);
          spinner.stop();
          console.log();
          ui.heading('채널 상태');
          console.log(result);
        } catch (e: any) {
          spinner.fail(e.message);
        }
        return;
      }

      if (action === 'add') {
        await collectChannelKeys();

        const allKeys = getAllKeys();
        const patchOpts: any = {};
        if (allKeys.telegram) patchOpts.telegram = { token: allKeys.telegram };
        if (allKeys.slack && allKeys.slackApp) patchOpts.slack = { botToken: allKeys.slack, appToken: allKeys.slackApp };
        if (allKeys.discordBot) patchOpts.discord = { token: allKeys.discordBot };

        if (Object.keys(patchOpts).length === 0) {
          ui.warn('채널 토큰이 등록되지 않았습니다.');
          return;
        }

        const spinner = ora('채널 설정 적용 중...').start();
        try {
          patchNanobotConfig(oc, patchOpts);
          execOnServer(oc, `cd ~/${rt.dirName} && docker compose restart`);
          spinner.succeed('채널 설정 적용 완료');
        } catch (e: any) {
          spinner.fail(e.message);
        }
        return;
      }

      ui.error('사용법: freestack agent config channel [list|add]');
    });

  configCommand
    .command('show')
    .description('현재 에이전트 설정 요약')
    .action(async () => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();

      if (rt.id !== 'nanobot') {
        ui.error('config 명령은 Nanobot 전용입니다.');
        return;
      }

      const spinner = ora('설정 조회 중...').start();
      try {
        const result = execOnServer(oc, `sudo python3 << 'PYEOF'\nimport json\nc=json.load(open('/var/lib/docker/volumes/nanobot_nanobot-config/_data/config.json'))\nd = c.get('agents',{}).get('defaults',{})\nprint(f'모델: {d.get(\"model\", \"(미설정)\")}')\nprint(f'프로바이더: {d.get(\"provider\", \"auto\")}')\nprint()\nprint('프로바이더 키:')\nfor name, cfg in c.get('providers', {}).items():\n    key = cfg.get('apiKey', '')\n    if key:\n        masked = key[:6] + '...' + key[-4:] if len(key) > 10 else '***'\n        print(f'  {name}: {masked}')\nprint()\nprint('채널:')\nfor name in ['telegram', 'slack', 'discord', 'whatsapp', 'email']:\n    ch = c.get('channels', {}).get(name, {})\n    enabled = ch.get('enabled', False)\n    status = 'ON' if enabled else 'OFF'\n    print(f'  {name}: {status}')\nPYEOF`);
        spinner.stop();
        console.log();
        ui.heading(`${rt.name} 설정`);
        console.log(result);
      } catch (e: any) {
        spinner.fail(e.message);
      }
    });
}
