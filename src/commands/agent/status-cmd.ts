import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import * as ui from '../../utils/ui.js';
import { getServerConfig, getSavedRuntime, execOnServer } from './runtime.js';
import { showCloudPricing } from './deploy.js';

export function registerStatusCommands(agentCommand: Command) {
  agentCommand
    .command('status')
    .description('에이전트 실행 상태 확인')
    .action(async () => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();

      const spinner = ora('상태 확인 중...').start();
      try {
        const status = execOnServer(oc, `docker ps --filter name=${rt.dirName} --format "{{.Status}}"`);
        const stats = execOnServer(oc, `docker stats ${rt.dirName} --no-stream --format "CPU: {{.CPUPerc}}, MEM: {{.MemUsage}}"`).trim();
        spinner.stop();

        if (status.trim()) {
          ui.success(`${rt.name}: ${chalk.green(status.trim())}`);
          console.log(`  ${stats}`);
          ui.keyValue({
            '런타임': rt.name,
            'URL': `http://${oc.tailscaleIp || oc.serverIp}:${rt.port}`,
            'Provider': oc.provider || '-',
            'Type': oc.type === 'homeserver' ? '🏠 홈서버' : '🖥️  원격 VM',
          });
        } else {
          ui.warn(`${rt.name}이 실행중이 아닙니다.`);
          ui.info('시작: freestack agent start');
        }
      } catch (e: any) {
        spinner.fail(e.message);
      }
    });

  agentCommand
    .command('logs')
    .description('에이전트 로그 보기')
    .option('-n, --lines <n>', '줄 수', '50')
    .action(async (opts) => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();
      try {
        console.log(execOnServer(oc, `docker logs ${rt.dirName} --tail ${opts.lines}`));
      } catch (e: any) {
        ui.error(e.message);
      }
    });

  agentCommand
    .command('start')
    .description('에이전트 시작')
    .action(async () => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();
      const spinner = ora(`${rt.name} 시작 중...`).start();
      try {
        execOnServer(oc, `cd ~/${rt.dirName} && docker compose up -d`);
        spinner.succeed(`${rt.name} 시작됨`);
      } catch (e: any) {
        spinner.fail(e.message);
      }
    });

  agentCommand
    .command('stop')
    .description('에이전트 중지')
    .action(async () => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();
      const spinner = ora(`${rt.name} 중지 중...`).start();
      try {
        execOnServer(oc, `cd ~/${rt.dirName} && docker compose down`);
        spinner.succeed(`${rt.name} 중지됨`);
      } catch (e: any) {
        spinner.fail(e.message);
      }
    });

  agentCommand
    .command('update')
    .description('에이전트 최신 버전으로 업데이트')
    .action(async () => {
      const oc = getServerConfig();
      if (!oc) return;
      const rt = getSavedRuntime();
      const spinner = ora(`${rt.name} 업데이트 중...`).start();
      try {
        execOnServer(oc, `cd ~/${rt.dirName} && docker compose pull && docker compose up -d`);
        spinner.succeed(`${rt.name} 업데이트 완료`);
      } catch (e: any) {
        spinner.fail(e.message);
      }
    });

  agentCommand
    .command('pricing')
    .description('클라우드 서버 가격 비교')
    .action(() => showCloudPricing());
}
