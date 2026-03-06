import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { config } from '../services/config.js';
import * as db from '../services/db.js';
import * as r2 from '../services/r2.js';
import * as ui from '../utils/ui.js';

export const filesCommand = new Command('files')
  .description('파일 공유 (Cloudflare R2 CDN + Oracle DB 메타)');

filesCommand
  .command('setup')
  .description('R2 버킷 생성')
  .action(async () => {
    const domain = config.get('domain') || 'freestack';
    const bucketName = domain.replace(/\./g, '-') + '-files';

    const { bucket } = await inquirer.prompt([{
      type: 'input',
      name: 'bucket',
      message: 'R2 버킷 이름:',
      default: bucketName,
    }]);

    const spinner = ora(`R2 버킷 생성: ${bucket}`).start();
    try {
      r2.createBucket(bucket);
      config.set('r2' as any, { bucket });
      spinner.succeed(`R2 버킷 생성됨: ${bucket}`);
      ui.info('무료: 10GB 스토리지, 월 1,000만 읽기, 100만 쓰기');
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        config.set('r2' as any, { bucket });
        spinner.succeed(`R2 버킷 이미 존재: ${bucket}`);
      } else {
        spinner.fail(e.message);
      }
    }
  });

filesCommand
  .command('upload <path>')
  .description('파일 업로드')
  .option('-n, --name <name>', '저장할 파일명')
  .option('-r, --role <role>', '접근 권한 (ANON/TEAM/GROUP/ADMIN)', 'TEAM')
  .option('-g, --group <group>', '그룹 제한')
  .action(async (localPath: string, opts) => {
    const spinner = ora('파일 업로드 중...').start();
    try {
      const fileInfo = r2.getFileInfo(localPath);
      const remoteName = opts.name || fileInfo.name;
      const r2Url = r2.uploadFile(localPath, remoteName);

      spinner.text = 'DB에 메타데이터 저장 중...';

      try {
        await db.addFileRecord({
          name: remoteName,
          path: remoteName,
          size: fileInfo.size,
          mime_type: fileInfo.mime_type,
          uploaded_by: 'admin',
          access_role: opts.role as db.Role,
          group: opts.group,
          r2_url: r2Url,
        });
      } catch {
        // DB not configured - still uploaded to R2
      }

      spinner.succeed(`업로드 완료: ${remoteName}`);
      ui.keyValue({
        '파일명': remoteName,
        '크기': formatSize(fileInfo.size),
        '타입': fileInfo.mime_type,
        '접근 권한': opts.role,
        'R2 URL': r2Url,
      });
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

filesCommand
  .command('download <remotePath> [localPath]')
  .description('파일 다운로드')
  .action(async (remotePath: string, localPath?: string) => {
    const dest = localPath || remotePath;
    const spinner = ora(`다운로드: ${remotePath}`).start();
    try {
      r2.downloadFile(remotePath, dest);
      spinner.succeed(`다운로드 완료: ${dest}`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

filesCommand
  .command('list')
  .description('파일 목록')
  .option('-r, --role <role>', '권한 필터')
  .option('-g, --group <group>', '그룹 필터')
  .action(async (opts) => {
    // Try DB first
    try {
      const result = await db.listFiles({ role: opts.role, group: opts.group });
      const files = result || [];

      if (files.length > 0) {
        ui.heading(`파일 (${files.length}개)`);
        ui.table(
          ['파일명', '크기', '타입', '권한', '그룹', '업로드'],
          files.map((f: any) => [
            f.name,
            formatSize(f.size || 0),
            chalk.dim(f.mime_type || '-'),
            roleBadge(f.access_role || 'TEAM'),
            f.grp || '-',
            f.uploaded_by || '-',
          ]),
        );
        return;
      }
    } catch {}

    // Fallback: list R2 directly
    const spinner = ora('R2 파일 목록 조회 중...').start();
    try {
      const output = r2.listObjects();
      spinner.stop();
      console.log(output);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

filesCommand
  .command('delete <remotePath>')
  .description('파일 삭제')
  .action(async (remotePath: string) => {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `정말 ${remotePath}를 삭제할까요?`,
      default: false,
    }]);
    if (!confirm) return;

    const spinner = ora('삭제 중...').start();
    try {
      r2.deleteFile(remotePath);
      try { await db.removeFileRecord(parseInt(remotePath) || 0); } catch {}
      spinner.succeed(`삭제됨: ${remotePath}`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

function roleBadge(role: string): string {
  switch (role) {
    case 'ADMIN': return chalk.red.bold('ADMIN');
    case 'GROUP': return chalk.yellow('GROUP');
    case 'TEAM': return chalk.cyan('TEAM');
    case 'ANON': return chalk.dim('ANON');
    default: return role;
  }
}
