import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import * as ui from '../utils/ui.js';

interface Tool {
  id: string;
  name: string;
  check: string;
  versionCmd: string;
  brewFormula?: string;
  brewCask?: string;
  npmInstall?: string;
  description: string;
  required: boolean;
}

const TOOLS: Tool[] = [
  {
    id: 'brew',
    name: 'Homebrew',
    check: 'which brew',
    versionCmd: 'brew --version | head -1',
    description: 'macOS 패키지 매니저',
    required: true,
  },
  {
    id: 'node',
    name: 'Node.js',
    check: 'which node',
    versionCmd: 'node --version',
    brewFormula: 'node',
    description: 'JavaScript 런타임 (OpenClaw 필수)',
    required: true,
  },
  {
    id: 'docker',
    name: 'Docker',
    check: 'which docker',
    versionCmd: 'docker --version',
    brewCask: 'docker',
    description: '컨테이너 런타임 (서버 배포용)',
    required: false,
  },
  {
    id: 'tailscale',
    name: 'Tailscale',
    check: 'which tailscale || test -d /Applications/Tailscale.app',
    versionCmd: 'tailscale version 2>/dev/null || echo "app installed"',
    brewCask: 'tailscale',
    description: 'Mesh VPN (내부 네트워크)',
    required: false,
  },
  {
    id: 'oci',
    name: 'OCI CLI',
    check: 'which oci',
    versionCmd: 'oci --version 2>/dev/null | head -1',
    brewFormula: 'oci-cli',
    description: 'Oracle Cloud CLI (서버 관리)',
    required: false,
  },
  {
    id: 'gh',
    name: 'GitHub CLI',
    check: 'which gh',
    versionCmd: 'gh --version | head -1',
    brewFormula: 'gh',
    description: 'GitHub CLI (코드 관리)',
    required: false,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    check: 'which ollama || test -d /Applications/Ollama.app',
    versionCmd: 'ollama --version 2>/dev/null || echo "app installed"',
    brewCask: 'ollama',
    description: '로컬 LLM 런타임 (무료 AI)',
    required: false,
  },
  {
    id: 'wrangler',
    name: 'Wrangler (Cloudflare)',
    check: 'which wrangler',
    versionCmd: 'wrangler --version 2>/dev/null',
    npmInstall: 'npm install -g wrangler',
    description: 'Cloudflare Workers/Pages CLI',
    required: false,
  },
  {
    id: 'ssh',
    name: 'SSH',
    check: 'which ssh',
    versionCmd: 'ssh -V 2>&1 | head -1',
    description: '서버 접속 (기본 내장)',
    required: true,
  },
  {
    id: 'git',
    name: 'Git',
    check: 'which git',
    versionCmd: 'git --version',
    brewFormula: 'git',
    description: '버전 관리',
    required: true,
  },
];

function isInstalled(check: string): boolean {
  try {
    execSync(check, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getVersion(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '-';
  }
}

function hasBrew(): boolean {
  return isInstalled('which brew');
}

function checkAll() {
  return TOOLS.map(tool => ({
    tool,
    installed: isInstalled(tool.check),
    version: isInstalled(tool.check) ? getVersion(tool.versionCmd) : '',
  }));
}

function printTable(results: ReturnType<typeof checkAll>) {
  ui.table(
    ['도구', '상태', '버전', '용도'],
    results.map(r => [
      r.tool.name,
      r.installed
        ? chalk.green('OK')
        : (r.tool.required ? chalk.red('MISSING') : chalk.yellow('미설치')),
      r.installed ? chalk.dim(r.version.substring(0, 30)) : '',
      r.tool.description,
    ]),
  );
}

async function installBrew(): Promise<boolean> {
  ui.error('Homebrew가 설치되어 있지 않습니다.');
  const { ok } = await inquirer.prompt([{
    type: 'confirm', name: 'ok',
    message: 'Homebrew를 먼저 설치할까요?',
    default: true,
  }]);
  if (!ok) return false;
  const spinner = ora('Homebrew 설치 중...').start();
  try {
    execSync('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"', {
      stdio: 'inherit', timeout: 300000,
    });
    spinner.succeed('Homebrew 설치 완료');
    return true;
  } catch (e: any) {
    spinner.fail(`Homebrew 설치 실패: ${e.message}`);
    return false;
  }
}

async function brewInstall(tools: Array<{ tool: Tool }>) {
  const formulas = tools.filter(r => r.tool.brewFormula).map(r => r.tool.brewFormula!);
  const casks = tools.filter(r => r.tool.brewCask && !r.tool.brewFormula).map(r => r.tool.brewCask!);
  const npms = tools.filter(r => r.tool.npmInstall);

  if (formulas.length > 0) {
    const spinner = ora(`brew install ${formulas.join(' ')}`).start();
    try {
      execSync(`brew install ${formulas.join(' ')}`, { stdio: 'pipe', timeout: 300000 });
      spinner.succeed(`설치 완료: ${formulas.join(', ')}`);
    } catch (e: any) {
      spinner.fail(`설치 실패: ${e.message}`);
    }
  }
  for (const cask of casks) {
    const spinner = ora(`brew install --cask ${cask}`).start();
    try {
      execSync(`brew install --cask ${cask}`, { stdio: 'pipe', timeout: 300000 });
      spinner.succeed(`설치 완료: ${cask}`);
    } catch (e: any) {
      spinner.fail(`${cask} 설치 실패: ${e.message}`);
    }
  }
  for (const r of npms) {
    const spinner = ora(r.tool.npmInstall!).start();
    try {
      execSync(r.tool.npmInstall!, { stdio: 'pipe', timeout: 120000 });
      spinner.succeed(`설치 완료: ${r.tool.name}`);
    } catch (e: any) {
      spinner.fail(`${r.tool.name}: ${e.message}`);
    }
  }
}

async function ensureSSHKey() {
  const hasKey = isInstalled('test -f ~/.ssh/id_rsa.pub || test -f ~/.ssh/id_ed25519.pub');
  if (hasKey) {
    ui.success('SSH 키 존재');
    return;
  }
  ui.warn('SSH 키가 없습니다.');
  const { genKey } = await inquirer.prompt([{
    type: 'confirm', name: 'genKey',
    message: 'SSH 키를 생성할까요? (ed25519, Oracle VM 접속용)',
    default: true,
  }]);
  if (!genKey) return;
  const { email } = await inquirer.prompt([{
    type: 'input', name: 'email',
    message: '이메일 (SSH 키 코멘트):',
    default: 'admin@freestack',
  }]);
  try {
    execSync(`ssh-keygen -t ed25519 -C "${email}" -f ~/.ssh/id_ed25519 -N ""`, { stdio: 'inherit' });
    ui.success('SSH 키 생성 완료: ~/.ssh/id_ed25519');
  } catch (e: any) {
    ui.error(`SSH 키 생성 실패: ${e.message}`);
  }
}

// ─── Exported: init에서 호출 ───

export async function ensureTools(): Promise<boolean> {
  ui.heading('로컬 환경 체크');
  console.log();

  const results = checkAll();
  printTable(results);

  const missing = results.filter(r => !r.installed);

  if (missing.length === 0) {
    console.log();
    ui.success('모든 도구가 설치되어 있습니다!');
    await ensureSSHKey();
    return true;
  }

  const installable = missing.filter(r => r.tool.brewFormula || r.tool.brewCask || r.tool.npmInstall);

  if (installable.length === 0) {
    console.log();
    ui.info('수동 설치가 필요한 도구만 남았습니다.');
    return true;
  }

  // Brew check
  if (!hasBrew() && installable.some(r => r.tool.brewFormula || r.tool.brewCask)) {
    const ok = await installBrew();
    if (!ok) return false;
  }

  console.log();
  const missingRequired = installable.filter(r => r.tool.required);
  const missingOptional = installable.filter(r => !r.tool.required);

  // 필수 도구는 바로 설치
  if (missingRequired.length > 0) {
    ui.info(`필수 도구 ${missingRequired.length}개 설치합니다: ${missingRequired.map(r => r.tool.name).join(', ')}`);
    await brewInstall(missingRequired);
  }

  // 선택 도구는 물어보고 설치
  if (missingOptional.length > 0) {
    const { selected } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selected',
      message: `선택 도구 ${missingOptional.length}개 — 같이 설치할 것 고르세요:`,
      choices: missingOptional.map(r => ({
        name: `${r.tool.name} ${chalk.dim(`- ${r.tool.description}`)}`,
        value: r.tool.id,
        checked: true, // 기본 전부 체크
      })),
    }]);

    const toInstall = missingOptional.filter(r => selected.includes(r.tool.id));
    if (toInstall.length > 0) {
      await brewInstall(toInstall);
    }
  }

  // 재확인
  console.log();
  ui.heading('설치 결과');
  const recheck = checkAll();
  printTable(recheck);

  const stillMissing = recheck.filter(r => !r.installed && r.tool.required);
  if (stillMissing.length > 0) {
    ui.error(`필수 도구 미설치: ${stillMissing.map(r => r.tool.name).join(', ')}`);
    return false;
  }

  await ensureSSHKey();
  return true;
}

// ─── CLI command ───

export const doctorCommand = new Command('doctor')
  .description('로컬 환경 진단 및 도구 자동 설치')
  .option('--install', '누락된 도구 전부 자동 설치 (비대화형)', false)
  .action(async (opts) => {
    if (opts.install) {
      // Non-interactive: install everything
      const results = checkAll();
      ui.heading('로컬 환경 진단');
      console.log();
      printTable(results);

      const missing = results.filter(r => !r.installed);
      const installable = missing.filter(r => r.tool.brewFormula || r.tool.brewCask || r.tool.npmInstall);

      if (installable.length === 0) {
        ui.success('모든 도구가 설치되어 있습니다!');
        return;
      }

      if (!hasBrew()) {
        const ok = await installBrew();
        if (!ok) return;
      }

      console.log();
      ui.info(`${installable.length}개 도구 설치 중...`);
      await brewInstall(installable);

      console.log();
      ui.heading('설치 결과');
      printTable(checkAll());
      await ensureSSHKey();
    } else {
      // Interactive
      await ensureTools();
    }
  });
