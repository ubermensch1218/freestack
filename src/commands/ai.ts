import { Command } from 'commander';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { getKey } from './keys.js';
import * as db from '../services/db.js';
import * as ui from '../utils/ui.js';

export const aiCommand = new Command('ai')
  .description('AI 어시스턴트 (Claude / OpenAI / Gemini / Kimi / GLM)');

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ─── Provider definitions ───

type Provider = 'anthropic' | 'openai' | 'google' | 'kimi' | 'glm';

const PROVIDERS: Record<Provider, {
  name: string;
  keyId: string;
  defaultModel: string;
  call: (messages: Message[], apiKey: string, model: string) => Promise<string>;
}> = {
  anthropic: {
    name: 'Claude',
    keyId: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    call: callClaude,
  },
  openai: {
    name: 'ChatGPT',
    keyId: 'openai',
    defaultModel: 'gpt-4o',
    call: callOpenAICompatible('https://api.openai.com/v1/chat/completions'),
  },
  google: {
    name: 'Gemini',
    keyId: 'google',
    defaultModel: 'gemini-2.0-flash',
    call: callGemini,
  },
  kimi: {
    name: 'Kimi',
    keyId: 'kimi',
    defaultModel: 'moonshot-v1-8k',
    call: callOpenAICompatible('https://api.moonshot.cn/v1/chat/completions'),
  },
  glm: {
    name: 'GLM',
    keyId: 'glm',
    defaultModel: 'glm-4-flash',
    call: callOpenAICompatible('https://open.bigmodel.cn/api/paas/v4/chat/completions'),
  },
};

// ─── API callers ───

async function callClaude(messages: Message[], apiKey: string, model: string): Promise<string> {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const body: any = { model, max_tokens: 4096, messages: chatMessages };
  if (systemMsg) body.system = systemMsg.content;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error (${res.status}): ${err}`);
  }

  const data = await res.json() as any;
  return data.content?.[0]?.text || '(empty response)';
}

function callOpenAICompatible(baseUrl: string) {
  return async (messages: Message[], apiKey: string, model: string): Promise<string> => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error (${res.status}): ${err}`);
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content || '(empty response)';
  };
}

async function callGemini(messages: Message[], apiKey: string, model: string): Promise<string> {
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemMsg = messages.find(m => m.role === 'system');
  const body: any = { contents };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '(empty response)';
}

// ─── Helpers ───

function detectProvider(): { provider: Provider; apiKey: string } | null {
  for (const [id, def] of Object.entries(PROVIDERS)) {
    const key = getKey(def.keyId);
    if (key) return { provider: id as Provider, apiKey: key };
  }
  return null;
}

function genSessionId(): string {
  return randomBytes(8).toString('hex');
}

function readFileContext(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const ext = filePath.split('.').pop() || '';
    return `\n---\nFile: ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\`\n---\n`;
  } catch (e: any) {
    return `\n[파일 읽기 실패: ${filePath}: ${e.message}]\n`;
  }
}

async function saveLog(sessionId: string, provider: string, model: string, role: string, content: string) {
  try {
    await db.addChatLog({ session_id: sessionId, provider, model, role, content });
  } catch {
    // DB not configured — silently skip
  }
}

function resolveProvider(providerOpt?: string): { provider: Provider; apiKey: string; model: string } {
  if (providerOpt) {
    const p = providerOpt as Provider;
    const def = PROVIDERS[p];
    if (!def) throw new Error(`알 수 없는 프로바이더: ${p}. 사용 가능: ${Object.keys(PROVIDERS).join(', ')}`);
    const key = getKey(def.keyId);
    if (!key) throw new Error(`${def.name} API 키가 없습니다. freestack keys set ${def.keyId}`);
    return { provider: p, apiKey: key, model: def.defaultModel };
  }

  const detected = detectProvider();
  if (!detected) throw new Error('API 키가 없습니다. freestack keys set anthropic');
  return { ...detected, model: PROVIDERS[detected.provider].defaultModel };
}

// ─── Commands ───

// freestack ai ask "question" -f context.md
aiCommand
  .command('ask <question...>')
  .description('AI에게 질문 (한 번)')
  .option('-p, --provider <provider>', '프로바이더 (anthropic/openai/google/kimi/glm)')
  .option('-m, --model <model>', '모델명')
  .option('-f, --file <paths...>', '.md 등 컨텍스트 파일')
  .action(async (questionParts: string[], opts) => {
    let question = questionParts.join(' ');

    try {
      const { provider, apiKey, model: defaultModel } = resolveProvider(opts.provider);
      const model = opts.model || defaultModel;
      const def = PROVIDERS[provider];

      // Attach file context
      if (opts.file) {
        const ctx = (opts.file as string[]).map(readFileContext).join('\n');
        question = `${ctx}\n\n${question}`;
      }

      console.log(chalk.dim(`${def.name} (${model})`));
      console.log();

      const sessionId = genSessionId();
      const messages: Message[] = [{ role: 'user', content: question }];
      const answer = await def.call(messages, apiKey, model);

      console.log(answer);

      // Save to DB
      await saveLog(sessionId, provider, model, 'user', question);
      await saveLog(sessionId, provider, model, 'assistant', answer);
    } catch (e: any) {
      ui.error(e.message);
    }
  });

// freestack ai chat
aiCommand
  .command('chat')
  .description('AI와 대화 (멀티턴, DB 저장)')
  .option('-p, --provider <provider>', '프로바이더 (anthropic/openai/google/kimi/glm)')
  .option('-m, --model <model>', '모델명')
  .option('-s, --system <prompt>', '시스템 프롬프트')
  .option('-f, --file <paths...>', '.md 등 컨텍스트 파일')
  .action(async (opts) => {
    try {
      const { provider, apiKey, model: defaultModel } = resolveProvider(opts.provider);
      const model = opts.model || defaultModel;
      const def = PROVIDERS[provider];
      const sessionId = genSessionId();

      ui.heading(`${def.name} Chat`);
      console.log(chalk.dim(`model: ${model} | session: ${sessionId.substring(0, 8)}`));
      console.log(chalk.dim(`종료: exit | 파일 첨부: /file path.md | 프로바이더: ${Object.keys(PROVIDERS).join('/')}`));
      if (opts.system) console.log(chalk.dim(`system: ${opts.system}`));
      console.log();

      const messages: Message[] = [];

      if (opts.system) {
        messages.push({ role: 'system', content: opts.system });
      }

      // Pre-load file context
      if (opts.file) {
        const ctx = (opts.file as string[]).map(readFileContext).join('\n');
        messages.push({ role: 'user', content: `다음 파일을 참고해줘:\n${ctx}` });
        messages.push({ role: 'assistant', content: '파일 내용을 확인했습니다. 질문해주세요.' });
        console.log(chalk.dim(`  ${(opts.file as string[]).length}개 파일 로드됨`));
      }

      while (true) {
        const { input } = await inquirer.prompt([{
          type: 'input',
          name: 'input',
          message: chalk.cyan('You:'),
        }]);

        if (!input || input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          ui.info('대화 종료');
          break;
        }

        // In-chat file loading
        if (input.startsWith('/file ')) {
          const filePath = input.slice(6).trim();
          const ctx = readFileContext(filePath);
          messages.push({ role: 'user', content: `파일 참고:\n${ctx}` });
          messages.push({ role: 'assistant', content: `${filePath} 파일 내용을 확인했습니다.` });
          console.log(chalk.dim(`  파일 로드됨: ${filePath}`));
          continue;
        }

        messages.push({ role: 'user', content: input });
        await saveLog(sessionId, provider, model, 'user', input);

        try {
          process.stdout.write(chalk.dim('  thinking...'));
          const answer = await def.call(messages, apiKey, model);
          process.stdout.write('\r' + ' '.repeat(40) + '\r');
          console.log(chalk.green('AI:'), answer);
          console.log();
          messages.push({ role: 'assistant', content: answer });
          await saveLog(sessionId, provider, model, 'assistant', answer);
        } catch (e: any) {
          process.stdout.write('\r' + ' '.repeat(40) + '\r');
          ui.error(e.message);
          messages.pop();
        }
      }
    } catch (e: any) {
      ui.error(e.message);
    }
  });

// freestack ai logs
aiCommand
  .command('logs')
  .description('AI 대화 세션 목록')
  .option('-n, --limit <n>', '개수', '20')
  .action(async (opts) => {
    try {
      const sessions = await db.listChatSessions(parseInt(opts.limit));
      if (!sessions || sessions.length === 0) {
        ui.info('저장된 대화가 없습니다.');
        return;
      }

      ui.heading(`AI 대화 기록 (${sessions.length}건)`);
      ui.table(
        ['세션 ID', '프로바이더', '모델', '시작', '메시지', '첫 질문'],
        sessions.map((s: any) => [
          chalk.cyan(s.session_id.substring(0, 8)),
          s.provider,
          chalk.dim(s.model),
          formatTime(s.started_at),
          `${s.msg_count}건`,
          (s.first_msg || '').substring(0, 50) + ((s.first_msg || '').length > 50 ? '...' : ''),
        ]),
      );
      console.log();
      ui.info('세션 보기: freestack ai read <session-id>');
    } catch (e: any) {
      ui.error(e.message);
    }
  });

// freestack ai read <sessionId>
aiCommand
  .command('read <sessionId>')
  .description('대화 세션 상세 보기')
  .action(async (sessionId: string) => {
    try {
      const logs = await db.getChatSession(sessionId);
      if (!logs || logs.length === 0) {
        // Try prefix match
        const sessions = await db.listChatSessions(100);
        const match = sessions?.find((s: any) => s.session_id.startsWith(sessionId));
        if (match) {
          const fullLogs = await db.getChatSession(match.session_id);
          printSession(fullLogs || []);
          return;
        }
        ui.warn('세션을 찾을 수 없습니다.');
        return;
      }
      printSession(logs);
    } catch (e: any) {
      ui.error(e.message);
    }
  });

// freestack ai search <keyword>
aiCommand
  .command('search <keyword...>')
  .description('대화 로그 검색')
  .option('-n, --limit <n>', '개수', '20')
  .action(async (keywordParts: string[], opts) => {
    const keyword = keywordParts.join(' ');
    try {
      const results = await db.searchChatLogs(keyword, parseInt(opts.limit));
      if (!results || results.length === 0) {
        ui.info(`"${keyword}" 검색 결과 없음`);
        return;
      }

      ui.heading(`검색: "${keyword}" (${results.length}건)`);
      for (const r of results as any[]) {
        const roleColor = r.role === 'user' ? chalk.cyan : chalk.green;
        const preview = r.content.length > 120 ? r.content.substring(0, 117) + '...' : r.content;
        console.log(`  ${chalk.dim(r.session_id.substring(0, 8))} ${roleColor(r.role.padEnd(10))} ${preview}`);
      }
      console.log();
      ui.info('세션 보기: freestack ai read <session-id>');
    } catch (e: any) {
      ui.error(e.message);
    }
  });

// freestack ai providers
aiCommand
  .command('providers')
  .description('지원 AI 프로바이더 + 키 상태')
  .action(() => {
    ui.heading('AI Providers');
    ui.table(
      ['ID', '이름', '기본 모델', 'API Key'],
      Object.entries(PROVIDERS).map(([id, def]) => {
        const key = getKey(def.keyId);
        return [
          id,
          def.name,
          chalk.dim(def.defaultModel),
          key ? chalk.green('설정됨') : chalk.dim('-'),
        ];
      }),
    );
    console.log();
    ui.info('키 설정: freestack keys set <provider-id>');
  });

// ─── Helpers ───

function printSession(logs: any[]) {
  if (logs.length === 0) return;
  const first = logs[0];
  console.log(chalk.dim(`세션: ${first.session_id} | ${first.provider} ${first.model}`));
  console.log();

  for (const l of logs) {
    if (l.role === 'user') {
      console.log(chalk.cyan.bold('You:'), l.content);
    } else {
      console.log(chalk.green.bold('AI:'), l.content);
    }
    console.log();
  }
}

function formatTime(t: any): string {
  if (!t) return '-';
  try {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return String(t);
  }
}
