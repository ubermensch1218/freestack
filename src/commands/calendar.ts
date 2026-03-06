import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import * as db from '../services/db.js';
import * as ui from '../utils/ui.js';

export const calendarCommand = new Command('calendar')
  .alias('cal')
  .description('캘린더 / 미팅 일정 관리 (Oracle DB)');

calendarCommand
  .command('add')
  .description('일정 추가')
  .option('-t, --title <title>', '제목')
  .option('-d, --date <date>', '날짜 (YYYY-MM-DD)')
  .option('--time <time>', '시간 (HH:mm)', '10:00')
  .option('--duration <min>', '소요 시간 (분)', '60')
  .option('-a, --attendees <emails>', '참석자 (콤마 구분)')
  .action(async (opts) => {
    const today = new Date().toISOString().split('T')[0];

    const answers = await inquirer.prompt([
      ...(!opts.title ? [{ type: 'input', name: 'title', message: '일정 제목:', validate: (v: string) => v.length > 0 || '제목을 입력하세요' }] : []),
      ...(!opts.date ? [{ type: 'input', name: 'date', message: '날짜 (YYYY-MM-DD):', default: today, validate: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) || 'YYYY-MM-DD 형식' }] : []),
      ...(!opts.time || opts.time === '10:00' ? [{ type: 'input', name: 'time', message: '시간 (HH:mm):', default: '10:00' }] : []),
      ...(!opts.attendees ? [{ type: 'input', name: 'attendees', message: '참석자 이메일 (콤마 구분, 선택):' }] : []),
    ]);

    const spinner = ora('일정 추가 중...').start();
    try {
      const attendees = (opts.attendees || answers.attendees || '')
        .split(',').map((s: string) => s.trim()).filter(Boolean);

      await db.addEvent({
        title: opts.title || answers.title,
        date: opts.date || answers.date,
        time: opts.time !== '10:00' ? opts.time : (answers.time || '10:00'),
        duration_min: parseInt(opts.duration),
        attendees,
        created_by: 'admin',
      });
      spinner.succeed(`일정 추가됨: ${opts.title || answers.title} (${opts.date || answers.date} ${opts.time !== '10:00' ? opts.time : (answers.time || '10:00')})`);
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

calendarCommand
  .command('list')
  .description('일정 목록')
  .option('-d, --date <date>', '특정 날짜')
  .option('-w, --week', '이번 주')
  .action(async (opts) => {
    const spinner = ora('일정 조회 중...').start();
    try {
      const result = await db.listEvents({ date: opts.date, week: opts.week });
      spinner.stop();

      const events = result || [];

      if (events.length === 0) {
        ui.info('등록된 일정이 없습니다.');
        return;
      }

      // Sort by date + time
      events.sort((a: any, b: any) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

      ui.heading(`일정 (${events.length}건)`);
      ui.table(
        ['날짜', '시간', '제목', '소요', '참석자'],
        events.map((e: any) => {
          const dateStr = formatDate(e.date);
          const attendeeStr = Array.isArray(e.attendees) ? e.attendees.join(', ') : (e.attendees || '-');
          return [
            dateStr,
            chalk.cyan(e.time || '-'),
            chalk.bold(e.title),
            `${e.duration_min || 60}분`,
            attendeeStr.length > 30 ? attendeeStr.substring(0, 27) + '...' : attendeeStr,
          ];
        }),
      );
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

calendarCommand
  .command('today')
  .description('오늘 일정')
  .action(async () => {
    const today = new Date().toISOString().split('T')[0];
    const spinner = ora('오늘 일정 조회 중...').start();
    try {
      const result = await db.listEvents({ date: today });
      spinner.stop();

      const events = result || [];

      ui.heading(`오늘 일정 (${today})`);

      if (events.length === 0) {
        ui.info('오늘 일정이 없습니다.');
        return;
      }

      events.sort((a: any, b: any) => (a.time || '').localeCompare(b.time || ''));

      for (const e of events) {
        const attendees = Array.isArray(e.attendees) ? e.attendees : [];
        console.log(`  ${chalk.cyan(e.time)} ${chalk.bold(e.title)} ${chalk.dim(`(${e.duration_min || 60}분)`)}`);
        if (attendees.length > 0) {
          console.log(`         ${chalk.dim('참석:')} ${attendees.join(', ')}`);
        }
      }
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${dateStr} (${days[d.getDay()]})`;
  } catch {
    return dateStr;
  }
}
