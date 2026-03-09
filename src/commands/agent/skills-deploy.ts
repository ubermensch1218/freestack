import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import * as ui from '../../utils/ui.js';
import { SKILLS, SKILL_CATEGORIES } from '../../data/skills.js';
import * as skillRegistry from '../../services/skill-registry.js';
import { type RuntimeConfig, execOnServer, getServerConfig, getSavedRuntime } from './runtime.js';

export async function collectSkillsDuringDeploy() {
  console.log();
  ui.heading('스킬 설정');
  ui.info('에이전트에게 능력을 추가합니다. 나중에 freestack hub 으로도 관리 가능.');
  console.log(chalk.dim('  조작: ↑↓ 이동 / Space 선택·해제 / a 전체선택 / Enter 확인'));
  console.log();

  // 카테고리별로 스킬을 보여주기
  const choices = SKILL_CATEGORIES.map(cat => {
    const catSkills = SKILLS.filter(s => s.category === cat.id);
    if (catSkills.length === 0) return [];
    return [
      new inquirer.Separator(`── ${cat.emoji} ${cat.name} ──`),
      ...catSkills.map(s => {
        const installed = skillRegistry.isInstalled(s.id);
        return {
          name: installed
            ? `${s.emoji} ${s.name} — ${chalk.green('✓ 설치됨')}`
            : `${s.emoji} ${s.name} — ${chalk.dim(s.description)}`,
          value: s.id,
          checked: installed,
        };
      }),
    ];
  }).flat();

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: '설치할 스킬 선택:',
    choices,
    pageSize: 20,
  }]);

  if (selected.length === 0) {
    ui.info('스킬을 선택하지 않았습니다. 나중에: freestack hub setup');
    return;
  }

  // 선택된 스킬 중 아직 설치 안 된 것만 설치
  for (const skillId of selected) {
    if (skillRegistry.isInstalled(skillId)) continue;
    const skill = skillRegistry.getById(skillId);
    if (!skill) continue;

    // 스킬에 질문이 있으면 인터랙티브로
    let configValues: Record<string, string> | undefined;
    if (skill.questions && skill.questions.length > 0) {
      console.log();
      ui.info(`${skill.emoji} ${skill.name} 설정:`);
      configValues = {};
      for (const q of skill.questions) {
        if (q.type === 'list' && q.choices) {
          const { answer } = await inquirer.prompt([{
            type: 'list',
            name: 'answer',
            message: q.message,
            choices: q.choices,
            default: q.default,
          }]);
          configValues[q.id] = answer;
        } else {
          const { answer } = await inquirer.prompt([{
            type: 'input',
            name: 'answer',
            message: q.message,
            default: q.default,
          }]);
          configValues[q.id] = answer;
        }
      }
    }

    skillRegistry.installSkill(skillId, skill.source, skill.version, configValues);
    ui.success(`${skill.emoji} ${skill.name} 설치됨`);
  }

  console.log();
  ui.success(`${selected.length}개 스킬 준비 완료 — 배포 후 workspace에 자동 배포됩니다.`);
}

export async function deploySkillsToWorkspace(ocConfig: any, rt: RuntimeConfig) {
  const installed = skillRegistry.getInstalled().filter(s => s.enabled);
  if (installed.length === 0) return;

  const spinner = ora(`${installed.length}개 스킬 workspace 배포 중...`).start();
  try {
    const configVolume = `/var/lib/docker/volumes/${rt.dirName}_${rt.dirName}-config/_data`;
    const skillsDir = `${configVolume}/workspace/skills`;

    execOnServer(ocConfig, `sudo mkdir -p ${skillsDir}`);

    for (const inst of installed) {
      const skill = skillRegistry.getById(inst.id);
      if (!skill) continue;

      const prompt = skillRegistry.getFilledPrompt(inst.id) || skill.prompt;
      const content = `# ${skill.emoji} ${skill.name}\n\n${skill.description}\n\n## 프롬프트\n\n${prompt}`;
      // heredoc으로 안전하게 전달
      const heredoc = `sudo tee ${skillsDir}/${inst.id}.md > /dev/null << 'SKILLEOF'\n${content}\nSKILLEOF`;
      execOnServer(ocConfig, heredoc);
    }

    // 마스터 프롬프트
    const masterPrompt = skillRegistry.exportMasterPrompt();
    if (masterPrompt) {
      const heredoc = `sudo tee ${configVolume}/workspace/SKILLS.md > /dev/null << 'SKILLEOF'\n${masterPrompt}\nSKILLEOF`;
      execOnServer(ocConfig, heredoc);
    }

    spinner.succeed(`${installed.length}개 스킬 workspace 배포 완료`);
  } catch (e: any) {
    spinner.warn(`스킬 배포 실패: ${e.message} — freestack agent skills 로 재시도`);
  }
}

export function registerSkillsCommand(agentCommand: Command) {
  agentCommand
    .command('skills')
    .description('스킬을 에이전트 workspace에 배포')
    .option('-l, --list', '배포된 스킬 목록')
    .action(async (opts) => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();

      if (rt.id !== 'nanobot') {
        ui.error('skills 명령은 Nanobot 전용입니다.');
        return;
      }

      if (opts.list) {
        try {
          const result = execOnServer(oc, `ls -la /var/lib/docker/volumes/nanobot_nanobot-config/_data/workspace/skills/ 2>/dev/null || echo "(스킬 없음)"`);
          console.log();
          ui.heading('배포된 스킬');
          console.log(result);
        } catch (e: any) {
          ui.error(e.message);
        }
        return;
      }

      const installed = skillRegistry.getInstalled().filter(s => s.enabled);

      if (installed.length === 0) {
        ui.warn('설치된 스킬이 없습니다.');
        ui.info(`스킬 설치: ${chalk.cyan('freestack hub install <id>')}`);
        ui.info(`한번에 설치: ${chalk.cyan('freestack hub setup')}`);
        return;
      }

      console.log();
      ui.heading('스킬 배포');
      console.log(`  설치된 스킬 ${installed.length}개:`);
      for (const inst of installed) {
        const skill = skillRegistry.getById(inst.id);
        if (skill) console.log(`    ${skill.emoji} ${skill.name}`);
      }
      console.log();

      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: `${installed.length}개 스킬을 에이전트 workspace에 배포할까요?`,
        default: true,
      }]);

      if (!proceed) return;

      await deploySkillsToWorkspace(oc, rt);
      console.log();
      ui.info(`에이전트가 ${chalk.cyan('~/.nanobot/workspace/skills/')} 에서 스킬을 읽습니다.`);
      ui.info(`텔레그램에서 "스킬 목록 보여줘" 로 확인할 수 있습니다.`);
    });
}
