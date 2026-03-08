import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { config } from '../services/config.js';
import { SERVICES, getManifestForAI } from '../services/manifest.js';
import { ensureTools } from './doctor.js';
import * as ui from '../utils/ui.js';

function openUrl(url: string) {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${cmd} "${url}"`, { stdio: 'ignore' });
  } catch {}
}

export const initCommand = new Command('init')
  .description('Freestack 워크스페이스 초기 설정 위자드')
  .option('--manifest', 'AI용 JSON 매니페스트 출력', false)
  .option('--only <services>', '특정 서비스만 설정 (콤마 구분)')
  .option('--skip <services>', '특정 서비스 건너뛰기 (콤마 구분)')
  .action(async (opts) => {
    // AI manifest mode
    if (opts.manifest) {
      console.log(JSON.stringify(getManifestForAI(), null, 2));
      return;
    }

    console.log(ui.logo);

    // Step 0: 로컬 도구 체크 + 자동 설치
    const toolsReady = await ensureTools();
    if (!toolsReady) {
      ui.error('필수 도구 설치에 실패했습니다. 수동 설치 후 다시 시도해주세요.');
      return;
    }

    console.log();
    ui.heading('워크스페이스 설정 위자드');
    console.log();
    ui.info('각 서비스별로 가입 링크 → API 키 입력 → 검증 → 다음 단계로 진행합니다.');
    ui.info(chalk.dim('건너뛰려면 Enter, 나중에 freestack keys set 으로 추가 가능'));
    console.log();

    const only = opts.only?.split(',') || null;
    const skip = opts.skip?.split(',') || [];

    let services = SERVICES.filter(s => {
      if (only) return only.includes(s.id);
      if (skip.includes(s.id)) return false;
      return true;
    });

    // If not filtering, ask which categories
    if (!only) {
      const { categories } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'categories',
        message: '설정할 서비스 카테고리 선택:',
        choices: [
          { name: `${chalk.cyan('필수')} - 도메인 + Cloudflare + Resend`, value: 'required', checked: true },
          { name: `${chalk.green('AI')} - Anthropic (Claude) for OpenClaw`, value: 'ai', checked: true },
          { name: `${chalk.yellow('메시징')} - Slack + Telegram`, value: 'messaging', checked: false },
          { name: `${chalk.magenta('VPN')} - Tailscale`, value: 'vpn', checked: false },
        ],
      }]);

      services = services.filter(s => {
        if (s.required && categories.includes('required')) return true;
        if (categories.includes(s.category)) return true;
        return false;
      });
    }

    const keys = (config.get('keys') as any) || {};
    let completedCount = 0;

    for (const service of services) {
      console.log();
      console.log(chalk.bold('━'.repeat(60)));
      ui.heading(`${service.name} ${chalk.dim(`(${service.freeTier})`)}`);
      console.log(chalk.dim(service.description));
      console.log();

      // Setup fields (domain, company name, etc.)
      if (service.setupFields) {
        for (const field of service.setupFields) {
          const existing = config.get(field.id as any) as string | undefined;
          const { value } = await inquirer.prompt([{
            type: 'input',
            name: 'value',
            message: `${field.name}:`,
            default: existing || field.default,
            validate: (v: string) => {
              if (!v && service.required) return `${field.name}을(를) 입력하세요`;
              if (field.type === 'domain' && v && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return '올바른 도메인 형식';
              if (field.type === 'email' && v && !v.includes('@')) return '올바른 이메일 형식';
              return true;
            },
          }]);
          if (value) config.set(field.id as any, value);
        }
      }

      // Skip if no keys needed
      if (service.keys.length === 0) {
        completedCount++;
        continue;
      }

      // Show instructions
      console.log(chalk.cyan('설정 방법:'));
      service.keyInstructions.split('\n').forEach(line => {
        console.log(`  ${line}`);
      });
      console.log();

      // Offer to open signup URL
      if (service.signupUrl) {
        const { openBrowser } = await inquirer.prompt([{
          type: 'confirm',
          name: 'openBrowser',
          message: `브라우저에서 ${service.name} 열기? (${service.signupUrl})`,
          default: !keys[service.keys[0].id], // only default to yes if key not set
        }]);

        if (openBrowser) {
          openUrl(service.signupUrl);
          ui.info('브라우저에서 가입/로그인 후 API 키를 복사하세요.');

          // Wait for user
          await inquirer.prompt([{
            type: 'confirm',
            name: 'ready',
            message: 'API 키를 복사했나요? 계속 진행할까요?',
            default: true,
          }]);
        }
      }

      // Input each key
      let allKeysSet = true;
      for (const keyDef of service.keys) {
        const existing = keys[keyDef.id];
        const { value } = await inquirer.prompt([{
          type: 'input',
          name: 'value',
          message: `${keyDef.name} ${chalk.dim(`(${keyDef.hint})`)}:`,
          default: existing ? maskKey(existing) : undefined,
          transformer: (v: string) => {
            if (v === maskKey(existing)) return chalk.dim(v);
            return v;
          },
        }]);

        const finalValue = (value === maskKey(existing)) ? existing : value;

        if (finalValue && finalValue.trim()) {
          // Prefix validation
          if (keyDef.prefix && !finalValue.startsWith(keyDef.prefix)) {
            ui.warn(`${keyDef.prefix}로 시작하는 키를 기대합니다. 입력값: ${finalValue.substring(0, 10)}...`);
            const { proceed } = await inquirer.prompt([{
              type: 'confirm',
              name: 'proceed',
              message: '그래도 저장할까요?',
              default: false,
            }]);
            if (!proceed) { allKeysSet = false; continue; }
          }
          keys[keyDef.id] = finalValue;
        } else {
          allKeysSet = false;
          ui.info(`${keyDef.name} 건너뜀 (나중에: freestack keys set ${keyDef.id})`);
        }
      }

      // Validate
      if (allKeysSet && service.keys.length > 0) {
        const spinner = ora(`${service.name} API 키 검증 중...`).start();
        try {
          const result = await service.validate(keys);
          if (result.ok) {
            spinner.succeed(`${service.name}: ${result.message}`);
            completedCount++;
          } else {
            spinner.fail(`${service.name}: ${result.message}`);
            const { retry } = await inquirer.prompt([{
              type: 'confirm',
              name: 'retry',
              message: '키를 다시 입력할까요?',
              default: true,
            }]);
            if (retry) {
              // Simple retry - just re-ask first key
              const { retryValue } = await inquirer.prompt([{
                type: 'input',
                name: 'retryValue',
                message: `${service.keys[0].name}:`,
              }]);
              if (retryValue) {
                keys[service.keys[0].id] = retryValue;
                const retryResult = await service.validate(keys);
                if (retryResult.ok) {
                  ui.success(`${service.name}: ${retryResult.message}`);
                  completedCount++;
                } else {
                  ui.error(`검증 실패: ${retryResult.message}. 나중에 freestack keys set 으로 수정 가능.`);
                }
              }
            }
          }
        } catch (e: any) {
          spinner.warn(`검증 스킵: ${e.message}`);
        }
      }

      // Save after each service
      config.set('keys' as any, keys);

      // Also sync to legacy config paths for backward compat
      if (keys.cloudflare) {
        config.set('cloudflare' as any, {
          ...(config.get('cloudflare') || {}),
          apiToken: keys.cloudflare,
          accountId: keys.cloudflareAccountId || (config.get('cloudflare') as any)?.accountId,
        });
      }
      if (keys.resend) {
        config.set('resend' as any, { apiKey: keys.resend });
      }
    }

    // Summary
    console.log();
    console.log(chalk.bold('━'.repeat(60)));
    ui.heading('설정 완료!');
    ui.keyValue({
      '완료': `${completedCount}/${services.length} 서비스`,
      '설정 파일': config.path,
    });
    console.log();

    // Next steps
    ui.heading('다음 단계');
    let step = 1;
    ui.info(`${step++}. ${chalk.cyan('freestack team setup')} - 데이터베이스 설정 (Cloudflare D1 추천 — 무료 서버리스)`);
    const domain = config.get('domain');
    if (keys.cloudflare && domain) {
      ui.info(`${step++}. ${chalk.cyan('freestack dns setup')} - DNS + Email Routing 설정`);
    }
    if (keys.resend) {
      ui.info(`${step++}. ${chalk.cyan('freestack dns resend-verify')} - Resend 도메인 DNS 자동 등록`);
    }
    if (keys.anthropic || keys.telegram || keys.slack) {
      ui.info(`${step++}. ${chalk.cyan('freestack openclaw deploy')} - AI 비서 배포`);
    }
    if (keys.tailscale) {
      ui.info(`${step++}. ${chalk.cyan('freestack vpn setup')} - VPN 설정`);
    }
    ui.info(`${step++}. ${chalk.cyan('freestack server capacity')} - 리전별 무료 VM 가용 여부 조회`);
    ui.info(`   ${chalk.cyan('freestack status')} - 전체 현황 보기`);
  });

function maskKey(key: string): string {
  if (!key || key.length < 12) return key;
  return key.substring(0, 8) + '****' + key.substring(key.length - 4);
}
