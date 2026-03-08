import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../services/config.js';
import { SKILLS, SKILL_CATEGORIES, type Skill, type SkillCategory } from '../data/skills.js';
import { ENV_VAR_REGISTRY } from '../data/usecases.js';
import { getAllKeys } from './keys.js';
import * as registry from '../services/skill-registry.js';
import * as clawhub from '../services/clawhub-client.js';
import * as ui from '../utils/ui.js';

function openUrl(url: string) {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${cmd} "${url}"`, { stdio: 'ignore' });
  } catch {}
}

export const hubCommand = new Command('hub')
  .description('스킬 허브 — 검색, 설치, 관리 (ClawHub 호환)');

// ─── 기본: 인터랙티브 브라우저 ───

hubCommand
  .action(async () => {
    console.log();
    ui.heading('Freestack 스킬 허브');
    ui.info('카테고리를 선택하고, 원하는 스킬을 설치하세요.');
    console.log();

    const installed = registry.getInstalled();
    ui.info(`설치됨: ${chalk.green(String(installed.length))}개  |  레지스트리: ${chalk.cyan(String(SKILLS.length))}개`);
    console.log();

    const { category } = await inquirer.prompt([{
      type: 'list',
      name: 'category',
      message: '카테고리 선택:',
      choices: [
        ...SKILL_CATEGORIES.map(c => {
          const count = registry.getByCategory(c.id).length;
          return { name: `${c.emoji} ${c.name} (${count})`, value: c.id };
        }),
        new inquirer.Separator(),
        { name: `🔍 키워드 검색`, value: '__search__' },
        { name: `📦 설치된 스킬 보기`, value: '__installed__' },
      ],
    }]);

    if (category === '__search__') {
      const { query } = await inquirer.prompt([{
        type: 'input',
        name: 'query',
        message: '검색어:',
      }]);
      await doSearch(query);
      return;
    }

    if (category === '__installed__') {
      showInstalled();
      return;
    }

    // 카테고리 내 스킬 선택
    const skills = registry.getByCategory(category);
    if (skills.length === 0) {
      ui.info('이 카테고리에 스킬이 없습니다.');
      return;
    }

    const { selected } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selected',
      message: '설치할 스킬 선택:',
      choices: skills.map(s => ({
        name: `${s.emoji} ${s.name} ${registry.isInstalled(s.id) ? chalk.green('(설치됨)') : ''} — ${chalk.dim(s.description.substring(0, 50))}`,
        value: s.id,
        checked: false,
      })),
      pageSize: 15,
    }]);

    if (!selected.length) {
      ui.info('선택된 스킬이 없습니다.');
      return;
    }

    for (const skillId of selected) {
      await installSkillInteractive(skillId);
    }

    showPostInstall();
  });

// ─── search ───

hubCommand
  .command('search <query>')
  .description('스킬 통합 검색 (freestack + ClawHub)')
  .action(async (query: string) => {
    await doSearch(query);
  });

async function doSearch(query: string) {
  const spinner = ora(`"${query}" 검색 중...`).start();

  const results = await registry.searchAll(query);
  spinner.stop();

  console.log();
  if (results.local.length > 0) {
    ui.heading(`freestack 스킬 (${results.local.length})`);
    for (const s of results.local) {
      const installed = registry.isInstalled(s.id) ? chalk.green(' ✓') : '';
      console.log(`  ${s.emoji} ${chalk.bold(s.name)}${installed}  ${chalk.dim(`[${s.source}]`)}`);
      console.log(`    ${chalk.dim(s.description)}`);
    }
  }

  if (results.clawhub.length > 0) {
    console.log();
    ui.heading(`ClawHub 스킬 (${results.clawhub.length})`);
    for (const r of results.clawhub) {
      console.log(`  📦 ${chalk.bold(r.name)}  ${chalk.dim(`(${r.score.toFixed(3)})`)}`);
      console.log(`    ${chalk.dim(r.description)}`);
      console.log(`    설치: ${chalk.cyan(`clawhub install ${r.id}`)}`);
    }
  }

  if (results.local.length === 0 && results.clawhub.length === 0) {
    ui.info(`"${query}"에 대한 결과가 없습니다.`);
    ui.info(`ClawHub에서 직접 검색: ${chalk.cyan(`clawhub search "${query}"`)}`);
  }

  // freestack 스킬이 있으면 설치 제안
  if (results.local.length > 0) {
    console.log();
    const notInstalled = results.local.filter(s => !registry.isInstalled(s.id));
    if (notInstalled.length > 0) {
      const { installIds } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'installIds',
        message: '설치할 스킬 선택 (Enter로 건너뛰기):',
        choices: notInstalled.map(s => ({
          name: `${s.emoji} ${s.name}`,
          value: s.id,
        })),
      }]);
      for (const id of installIds) {
        await installSkillInteractive(id);
      }
    }
  }
}

// ─── browse ───

hubCommand
  .command('browse [category]')
  .description('카테고리별 스킬 목록')
  .action(async (category?: string) => {
    if (category) {
      const cat = SKILL_CATEGORIES.find(c => c.id === category);
      if (!cat) {
        ui.error(`알 수 없는 카테고리: ${category}`);
        ui.info(`사용 가능: ${SKILL_CATEGORIES.map(c => c.id).join(', ')}`);
        return;
      }
      showCategorySkills(cat.id);
      return;
    }

    // 전체 카테고리 표시
    console.log();
    ui.heading('Freestack 스킬 카탈로그');
    console.log();

    for (const cat of SKILL_CATEGORIES) {
      const skills = registry.getByCategory(cat.id);
      if (skills.length === 0) continue;
      showCategorySkills(cat.id);
    }
  });

function showCategorySkills(categoryId: SkillCategory) {
  const cat = SKILL_CATEGORIES.find(c => c.id === categoryId)!;
  const skills = registry.getByCategory(categoryId);

  ui.heading(`${cat.emoji} ${cat.name}`);
  for (const s of skills) {
    const installed = registry.isInstalled(s.id) ? chalk.green(' ✓') : '';
    console.log(`  ${s.emoji} ${chalk.bold(s.name)}${installed}`);
    console.log(`    ${chalk.dim(s.description)}`);
    console.log(`    채널: ${s.channels.map(c => chalk.cyan(c)).join(', ')}  ${s.envVars?.length ? `키: ${s.envVars.map(e => chalk.yellow(e)).join(', ')}` : ''}`);
    console.log();
  }
}

// ─── info ───

hubCommand
  .command('info <skill-id>')
  .description('스킬 상세 정보')
  .action(async (skillId: string) => {
    const skill = registry.getById(skillId);
    if (!skill) {
      ui.error(`스킬을 찾을 수 없습니다: ${skillId}`);
      ui.info('검색: freestack hub search <키워드>');
      return;
    }

    console.log();
    console.log(`${skill.emoji} ${chalk.bold.white(skill.name)}  ${chalk.dim(`v${skill.version}`)}`);
    console.log(chalk.dim(skill.description));
    console.log();

    ui.keyValue({
      'ID': skill.id,
      '카테고리': SKILL_CATEGORIES.find(c => c.id === skill.category)?.name || skill.category,
      '소스': skill.source === 'clawhub' ? `ClawHub (${skill.clawHubId})` : skill.source,
      '채널': skill.channels.join(', '),
      '태그': skill.tags.join(', '),
      '설치 상태': registry.isInstalled(skill.id) ? chalk.green('설치됨') : chalk.dim('미설치'),
    });

    if (skill.envVars?.length) {
      console.log();
      ui.heading('필요한 API 키');
      const keys = getAllKeys();
      for (const env of skill.envVars) {
        const meta = ENV_VAR_REGISTRY.find(r => r.envVar === env);
        const hasKey = meta ? !!keys[meta.keyId] : false;
        console.log(`  ${hasKey ? chalk.green('✓') : chalk.red('✗')} ${env} ${meta ? chalk.dim(`(${meta.name})`) : ''}`);
      }
    }

    if (skill.questions?.length) {
      console.log();
      ui.heading('설정 질문');
      for (const q of skill.questions) {
        console.log(`  • ${q.message} ${q.default ? chalk.dim(`(기본: ${q.default})`) : ''}`);
      }
    }

    console.log();
    ui.heading('프롬프트 미리보기');
    console.log(chalk.dim(skill.prompt.substring(0, 300) + (skill.prompt.length > 300 ? '...' : '')));

    if (!registry.isInstalled(skill.id)) {
      console.log();
      const { install } = await inquirer.prompt([{
        type: 'confirm',
        name: 'install',
        message: '이 스킬을 설치할까요?',
        default: true,
      }]);
      if (install) await installSkillInteractive(skill.id);
    }
  });

// ─── install ───

hubCommand
  .command('install <skill-id>')
  .description('스킬 설치')
  .action(async (skillId: string) => {
    await installSkillInteractive(skillId);
    showPostInstall();
  });

async function installSkillInteractive(skillId: string) {
  const skill = registry.getById(skillId);
  if (!skill) {
    ui.error(`스킬을 찾을 수 없습니다: ${skillId}`);
    return;
  }

  console.log();
  console.log(chalk.bold('━'.repeat(60)));
  ui.heading(`${skill.emoji} ${skill.name} 설치`);
  console.log(chalk.dim(skill.description));
  console.log();

  // 1. API 키 수집
  if (skill.envVars?.length) {
    const keys = getAllKeys();
    for (const envName of skill.envVars) {
      const meta = ENV_VAR_REGISTRY.find(r => r.envVar === envName);
      if (!meta) continue;
      if (keys[meta.keyId]) {
        ui.success(`${meta.name} — 이미 설정됨`);
        continue;
      }

      console.log();
      console.log(chalk.bold(meta.name));
      console.log(chalk.dim(meta.description));
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
        openUrl(meta.signupUrl);
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
          if (!v) return true;
          if (meta.prefix && !v.startsWith(meta.prefix)) return `${meta.prefix}로 시작해야 합니다`;
          return true;
        },
      }]);

      if (apiKey?.trim()) {
        keys[meta.keyId] = apiKey.trim();
        config.set('keys' as any, keys);
        ui.success(`${meta.name} 저장됨`);
      } else {
        ui.info(`건너뜀 — 나중에: ${chalk.cyan(`freestack keys set ${meta.keyId}`)}`);
      }
    }
  }

  // 2. 인터랙티브 질문
  const configValues: Record<string, string> = {};

  if (skill.questions?.length) {
    console.log();
    ui.info('스킬 설정:');
    console.log();

    for (const q of skill.questions) {
      const promptConfig: any = {
        type: q.type === 'editor' ? 'editor' : q.type === 'list' ? 'list' : 'input',
        name: 'value',
        message: q.message,
      };
      if (q.default) promptConfig.default = q.default;
      if (q.choices) promptConfig.choices = q.choices;

      const { value } = await inquirer.prompt([promptConfig]);
      if (value && String(value).trim()) {
        configValues[q.id] = String(value).trim();
      }
    }
  }

  // 3. 저장
  registry.installSkill(skill.id, skill.source, skill.version, configValues);

  // 4. SKILL.md 파일 생성
  const skillDir = path.join(process.cwd(), 'openclaw-skills', skill.id);
  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });

  let filledPrompt = skill.prompt;
  for (const q of skill.questions || []) {
    const val = configValues[q.id];
    if (val) {
      filledPrompt = filledPrompt.split(q.placeholder).join(val);
    }
  }

  const skillMd = registry.toSkillMd(skill, filledPrompt);
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
  fs.writeFileSync(path.join(skillDir, 'prompt.txt'), filledPrompt);

  ui.success(`${skill.emoji} ${skill.name} 설치 완료 → ${skillDir}`);

  // 5. 추천 스킬
  if (skill.recommended?.length) {
    const notInstalled = skill.recommended.filter(id => !registry.isInstalled(id));
    if (notInstalled.length > 0) {
      console.log();
      ui.info('함께 추천하는 스킬:');
      for (const recId of notInstalled) {
        const rec = registry.getById(recId);
        if (rec) console.log(`  ${rec.emoji} ${rec.name} — ${chalk.dim(rec.description.substring(0, 40))}`);
      }
    }
  }
}

// ─── remove ───

hubCommand
  .command('remove <skill-id>')
  .description('스킬 제거')
  .action(async (skillId: string) => {
    if (!registry.isInstalled(skillId)) {
      ui.warn(`${skillId} 스킬이 설치되어 있지 않습니다.`);
      return;
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `${skillId} 스킬을 제거할까요?`,
      default: false,
    }]);

    if (!confirm) return;

    registry.removeSkill(skillId);

    // 로컬 파일도 삭제
    const skillDir = path.join(process.cwd(), 'openclaw-skills', skillId);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true });
    }

    ui.success(`${skillId} 스킬 제거됨`);
  });

// ─── list ───

hubCommand
  .command('list')
  .description('설치된 스킬 목록')
  .action(() => {
    showInstalled();
  });

function showInstalled() {
  const installed = registry.getInstalled();

  if (installed.length === 0) {
    ui.info('설치된 스킬이 없습니다.');
    ui.info(`스킬 찾기: ${chalk.cyan('freestack hub')} 또는 ${chalk.cyan('freestack hub search <키워드>')}`);
    return;
  }

  console.log();
  ui.heading(`설치된 스킬 (${installed.length}개)`);
  console.log();

  ui.table(
    ['스킬', '소스', '상태', '설치일'],
    installed.map(inst => {
      const skill = registry.getById(inst.id);
      return [
        skill ? `${skill.emoji} ${skill.name}` : inst.id,
        inst.source,
        inst.enabled ? chalk.green('활성') : chalk.dim('비활성'),
        new Date(inst.installedAt).toLocaleDateString('ko-KR'),
      ];
    }),
  );

  console.log();
  ui.info(`통합 프롬프트 생성: ${chalk.cyan('freestack hub export')}`);
}

// ─── export ───

hubCommand
  .command('export')
  .description('설치된 스킬의 통합 프롬프트 생성')
  .option('-o, --output <path>', '출력 파일 경로')
  .action(async (opts) => {
    const masterPrompt = registry.exportMasterPrompt();

    if (!masterPrompt) {
      ui.info('활성 스킬이 없습니다. 먼저 스킬을 설치하세요.');
      return;
    }

    const outputPath = opts.output || path.join(process.cwd(), 'openclaw-skills', 'MASTER_SKILL.md');
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outputPath, masterPrompt);

    const installed = registry.getInstalled().filter(s => s.enabled);
    ui.success(`${installed.length}개 스킬 통합 프롬프트 생성 완료`);
    ui.keyValue({ '파일': outputPath });

    // 서버 배포 제안
    const ocConfig = config.get('openclaw') as any;
    if (ocConfig?.serverIp || ocConfig?.tailscaleIp) {
      const { deploy } = await inquirer.prompt([{
        type: 'confirm',
        name: 'deploy',
        message: '서버에도 배포할까요?',
        default: true,
      }]);
      if (deploy) {
        try {
          const ip = ocConfig.tailscaleIp || ocConfig.serverIp;
          const user = ocConfig.sshUser || 'ubuntu';
          const keyFlag = ocConfig.sshKeyPath && ocConfig.type !== 'homeserver' ? `-i ${ocConfig.sshKeyPath}` : '';
          const content = fs.readFileSync(outputPath, 'utf-8');
          execSync(
            `ssh -o StrictHostKeyChecking=no ${keyFlag} ${user}@${ip} 'mkdir -p ~/openclaw/skills && cat > ~/openclaw/skills/MASTER_SKILL.md << '"'"'SKILLEOF'"'"'\n${content}\nSKILLEOF'`,
            { encoding: 'utf-8', timeout: 15000 },
          );
          ui.success(`서버 배포 완료: ${ip}:~/openclaw/skills/MASTER_SKILL.md`);
        } catch (e: any) {
          ui.warn(`서버 배포 실패: ${e.message}`);
        }
      }
    } else {
      console.log();
      ui.info('이 파일을 OpenClaw/NanoClaw에 붙여넣어서 모든 스킬을 한번에 설정하세요.');
    }
  });

// ─── update ───

hubCommand
  .command('update [skill-id]')
  .description('스킬 업데이트')
  .action(async (skillId?: string) => {
    const installed = registry.getInstalled();

    if (installed.length === 0) {
      ui.info('설치된 스킬이 없습니다.');
      return;
    }

    const targets = skillId
      ? installed.filter(s => s.id === skillId)
      : installed;

    if (targets.length === 0) {
      ui.warn(`${skillId} 스킬이 설치되어 있지 않습니다.`);
      return;
    }

    let updated = 0;
    for (const inst of targets) {
      const skill = registry.getById(inst.id);
      if (!skill) continue;

      if (skill.version !== inst.version) {
        registry.installSkill(inst.id, inst.source, skill.version, inst.configValues);
        ui.success(`${skill.emoji} ${skill.name}: ${inst.version} → ${skill.version}`);
        updated++;
      }
    }

    if (updated === 0) {
      ui.success('모든 스킬이 최신 버전입니다.');
    }
  });

// ─── setup: 원샷 위자드 ───

hubCommand
  .command('setup')
  .description('원샷 설정 — 스킬 선택 → 질문 → API 키 → 서버 배포까지')
  .action(async () => {
    console.log();
    console.log(chalk.bold('━'.repeat(60)));
    ui.heading('Freestack 스킬 원샷 설정');
    ui.info('카테고리별로 스킬을 고르고, 질문에 답하면 서버에 자동 배포합니다.');
    console.log();

    // 1. 전체 카테고리에서 멀티셀렉트
    const choices: any[] = [];
    for (const cat of SKILL_CATEGORIES) {
      const catSkills = registry.getByCategory(cat.id);
      if (catSkills.length === 0) continue;
      choices.push(new inquirer.Separator(`\n── ${cat.emoji} ${cat.name} ──`));
      for (const s of catSkills) {
        const installed = registry.isInstalled(s.id);
        choices.push({
          name: `${s.emoji} ${s.name} ${installed ? chalk.green('(설치됨)') : ''} — ${chalk.dim(s.description.substring(0, 50))}`,
          value: s.id,
          checked: installed, // 이미 설치된 건 체크 상태
        });
      }
    }

    // usecases도 포함 (openclaw usecases에서 가져오기)
    let includeUsecases = false;
    try {
      const { USECASES, USECASE_CATEGORIES: UC_CATS } = await import('../data/usecases.js');
      if (USECASES.length > 0) {
        choices.push(new inquirer.Separator(`\n── 🎯 유즈케이스 (openclaw) ──`));
        for (const uc of USECASES) {
          choices.push({
            name: `${uc.emoji} ${uc.name} — ${chalk.dim(uc.description.substring(0, 50))}`,
            value: `uc:${uc.id}`,
            checked: false,
          });
        }
        includeUsecases = true;
      }
    } catch {}

    const { selected } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selected',
      message: '설치할 스킬/유즈케이스 선택 (스페이스바):',
      choices,
      pageSize: 25,
    }]);

    if (!selected.length) {
      ui.info('선택된 항목이 없습니다.');
      return;
    }

    const skillIds = (selected as string[]).filter(id => !id.startsWith('uc:'));
    const usecaseIds = (selected as string[]).filter(id => id.startsWith('uc:')).map(id => id.slice(3));

    // 2. 요약
    console.log();
    ui.heading(`${selected.length}개 항목 설치`);
    if (skillIds.length) ui.info(`스킬: ${skillIds.length}개`);
    if (usecaseIds.length) ui.info(`유즈케이스: ${usecaseIds.length}개`);

    // 필요한 API 키 / 채널 수집
    const allEnvVars = new Set<string>();
    const allChannels = new Set<string>();

    for (const id of skillIds) {
      const s = registry.getById(id);
      if (s) {
        s.envVars?.forEach(e => allEnvVars.add(e));
        s.channels.forEach(c => allChannels.add(c));
      }
    }

    if (includeUsecases && usecaseIds.length) {
      const { USECASES } = await import('../data/usecases.js');
      for (const ucId of usecaseIds) {
        const uc = USECASES.find(u => u.id === ucId);
        if (uc) {
          uc.envVars?.forEach(e => allEnvVars.add(e));
          uc.channels.forEach(c => allChannels.add(c));
        }
      }
    }

    if (allEnvVars.size) {
      console.log();
      ui.info(`필요한 API 키: ${[...allEnvVars].join(', ')}`);
    }
    if (allChannels.size) {
      ui.info(`필요한 채널: ${[...allChannels].join(', ')}`);
    }

    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: '설치를 시작할까요?',
      default: true,
    }]);
    if (!proceed) return;

    // 3. 스킬 설치 (인터랙티브)
    for (const id of skillIds) {
      if (registry.isInstalled(id)) {
        const skill = registry.getById(id);
        ui.success(`${skill?.emoji || '📦'} ${skill?.name || id} — 이미 설치됨 (건너뜀)`);
        continue;
      }
      await installSkillInteractive(id);
    }

    // 4. 유즈케이스 설치
    if (usecaseIds.length && includeUsecases) {
      const { USECASES } = await import('../data/usecases.js');

      for (const ucId of usecaseIds) {
        const uc = USECASES.find(u => u.id === ucId);
        if (!uc) continue;

        console.log();
        console.log(chalk.bold('━'.repeat(60)));
        ui.heading(`${uc.emoji} ${uc.name} — 유즈케이스 설정`);
        console.log(chalk.dim(uc.description));
        console.log();

        let prompt = uc.setupPrompt;
        const configValues: Record<string, string> = {};

        if (uc.questions?.length) {
          for (const q of uc.questions) {
            const promptConfig: any = {
              type: q.type === 'editor' ? 'editor' : q.type === 'list' ? 'list' : 'input',
              name: 'value',
              message: q.message,
            };
            if (q.default) promptConfig.default = q.default;
            if (q.choices) promptConfig.choices = q.choices;

            const { value } = await inquirer.prompt([promptConfig]);
            if (value && String(value).trim()) {
              const trimmed = String(value).trim();
              configValues[q.id] = trimmed;
              prompt = prompt.split(q.placeholder).join(trimmed);
            }
          }
        }

        // 유즈케이스도 스킬로 저장
        registry.installSkill(ucId, 'freestack', '1.0.0', configValues);

        const ucDir = path.join(process.cwd(), 'openclaw-skills', ucId);
        if (!fs.existsSync(ucDir)) fs.mkdirSync(ucDir, { recursive: true });
        fs.writeFileSync(path.join(ucDir, 'prompt.txt'), prompt);
        fs.writeFileSync(path.join(ucDir, 'README.md'), `# ${uc.emoji} ${uc.name}\n\n${uc.description}\n\n## 프롬프트\n\n${prompt}\n`);

        ui.success(`${uc.emoji} ${uc.name} 설치 완료`);
      }
    }

    // 5. 통합 프롬프트 생성
    console.log();
    console.log(chalk.bold('━'.repeat(60)));
    ui.heading('통합 프롬프트 생성');

    const masterPrompt = registry.exportMasterPrompt();

    // 유즈케이스 프롬프트도 합치기
    let combinedPrompt = masterPrompt;
    if (usecaseIds.length && includeUsecases) {
      const { USECASES } = await import('../data/usecases.js');
      const ucSections: string[] = [];
      for (const ucId of usecaseIds) {
        const uc = USECASES.find(u => u.id === ucId);
        if (!uc) continue;
        const promptPath = path.join(process.cwd(), 'openclaw-skills', ucId, 'prompt.txt');
        if (fs.existsSync(promptPath)) {
          const prompt = fs.readFileSync(promptPath, 'utf-8');
          ucSections.push(`## ${uc.emoji} ${uc.name}\n\n${prompt}`);
        }
      }
      if (ucSections.length) {
        combinedPrompt += '\n\n---\n\n# 유즈케이스\n\n' + ucSections.join('\n\n---\n\n');
      }
    }

    const masterPath = path.join(process.cwd(), 'openclaw-skills', 'MASTER_SETUP.md');
    const masterDir = path.dirname(masterPath);
    if (!fs.existsSync(masterDir)) fs.mkdirSync(masterDir, { recursive: true });
    fs.writeFileSync(masterPath, combinedPrompt);

    const totalCount = skillIds.length + usecaseIds.length;
    ui.success(`${totalCount}개 스킬/유즈케이스 통합 프롬프트 생성`);
    ui.keyValue({ '파일': masterPath });

    // 6. 서버 배포 제안
    const ocConfig = config.get('openclaw') as any;
    if (ocConfig?.serverIp || ocConfig?.tailscaleIp) {
      console.log();
      const serverLabel = ocConfig.type === 'homeserver'
        ? `🏠 홈서버 (${ocConfig.tailscaleIp})`
        : `🖥️  ${ocConfig.serverIp}`;

      const { deployToServer } = await inquirer.prompt([{
        type: 'confirm',
        name: 'deployToServer',
        message: `${serverLabel}에 스킬 프롬프트를 배포할까요?`,
        default: true,
      }]);

      if (deployToServer) {
        const deploySpinner = ora('서버에 배포 중...').start();
        try {
          const ip = ocConfig.tailscaleIp || ocConfig.serverIp;
          const user = ocConfig.sshUser || 'ubuntu';
          const keyFlag = ocConfig.sshKeyPath && ocConfig.type !== 'homeserver' ? `-i ${ocConfig.sshKeyPath}` : '';
          const ssh = (cmd: string) => execSync(
            `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${keyFlag} ${user}@${ip} '${cmd}'`,
            { encoding: 'utf-8', timeout: 30000 },
          );

          ssh('mkdir -p ~/openclaw/skills');

          // 마스터 프롬프트 전송
          const content = fs.readFileSync(masterPath, 'utf-8');
          ssh(`cat > ~/openclaw/skills/MASTER_SETUP.md << 'SKILLEOF'\n${content}\nSKILLEOF`);

          // 개별 프롬프트도 전송
          const allIds = [...skillIds, ...usecaseIds];
          for (const id of allIds) {
            const promptPath = path.join(process.cwd(), 'openclaw-skills', id, 'prompt.txt');
            if (fs.existsSync(promptPath)) {
              const promptContent = fs.readFileSync(promptPath, 'utf-8');
              ssh(`mkdir -p ~/openclaw/skills/${id}`);
              ssh(`cat > ~/openclaw/skills/${id}/prompt.txt << 'SKILLEOF'\n${promptContent}\nSKILLEOF`);
            }
          }

          deploySpinner.succeed(`서버 배포 완료 (${allIds.length}개 스킬)`);
          ui.keyValue({
            '서버': `${ip} (~/openclaw/skills/)`,
            '마스터': `~/openclaw/skills/MASTER_SETUP.md`,
          });
        } catch (e: any) {
          deploySpinner.fail(`서버 배포 실패: ${e.message}`);
          ui.info('로컬 파일은 유지됩니다. 수동으로 복사하세요.');
        }
      }
    }

    // 7. 최종 요약
    console.log();
    console.log(chalk.bold('━'.repeat(60)));
    ui.heading('설정 완료!');
    console.log();

    const allInstalled = registry.getInstalled();
    ui.keyValue({
      '총 설치': `${allInstalled.length}개 스킬`,
      '로컬 디렉토리': path.join(process.cwd(), 'openclaw-skills'),
      '통합 프롬프트': masterPath,
    });

    console.log();
    ui.heading('사용법');
    ui.info(`1. OpenClaw/NanoClaw 채팅에 ${chalk.cyan('MASTER_SETUP.md')} 내용을 붙여넣기`);
    ui.info(`2. 또는 개별 ${chalk.cyan('openclaw-skills/<스킬>/prompt.txt')} 사용`);
    ui.info(`3. ${chalk.cyan('freestack hub list')} — 설치 현황`);
    ui.info(`4. ${chalk.cyan('freestack hub search <키워드>')} — 추가 스킬 검색`);

    if (!ocConfig?.serverIp && !ocConfig?.tailscaleIp) {
      console.log();
      ui.warn('OpenClaw 서버가 아직 설정되지 않았습니다.');
      ui.info(`서버 배포: ${chalk.cyan('freestack openclaw deploy')} 후 ${chalk.cyan('freestack hub setup')} 재실행`);
    }
  });

// ─── helpers ───

function showPostInstall() {
  const installed = registry.getInstalled();
  if (installed.length === 0) return;

  console.log();
  console.log(chalk.bold('━'.repeat(60)));
  ui.heading('다음 단계');
  ui.info(`1. ${chalk.cyan('freestack hub export')} — 통합 프롬프트 생성`);
  ui.info(`2. 생성된 MASTER_SKILL.md를 OpenClaw/NanoClaw에 붙여넣기`);
  ui.info(`3. 개별 스킬: ${chalk.cyan('openclaw-skills/<스킬>/prompt.txt')}`);
  ui.info(`4. ${chalk.cyan('freestack hub list')} — 설치 현황 확인`);
}
