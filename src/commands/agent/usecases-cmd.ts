import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { config } from '../../services/config.js';
import * as ui from '../../utils/ui.js';
import { getAllKeys } from '../keys.js';
import { execOnServer } from './runtime.js';
import { USECASES, USECASE_CATEGORIES, ENV_VAR_REGISTRY } from '../../data/usecases.js';

export function showUsecaseList() {
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

export function registerUsecasesCommand(agentCommand: Command) {
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
}
