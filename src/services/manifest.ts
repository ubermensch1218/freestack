// Service manifest - structured guide for both humans and AI agents
// AI agents can read this to understand setup flow and automate it

export interface ServiceStep {
  id: string;
  name: string;
  description: string;
  category: 'infra' | 'email' | 'ai' | 'messaging' | 'vpn';
  freeTier: string;
  required: boolean;
  signupUrl: string;
  docsUrl: string;
  keyInstructions: string;
  keys: Array<{
    id: string;
    name: string;
    envVar: string;
    prefix?: string;
    hint: string;
    validateUrl?: string;
  }>;
  setupFields?: Array<{
    id: string;
    name: string;
    hint: string;
    type: 'text' | 'email' | 'domain' | 'ip';
    default?: string;
  }>;
  validate: (keys: Record<string, string>) => Promise<{ ok: boolean; message: string }>;
  postSetup?: string[];
}

export const SERVICES: ServiceStep[] = [
  {
    id: 'domain',
    name: 'Domain',
    description: '회사 도메인 설정',
    category: 'infra',
    freeTier: 'Cloudflare 무료 DNS, 일부 등록기관에서 무료 도메인(.tk 등)',
    required: true,
    signupUrl: '',
    docsUrl: '',
    keyInstructions: '보유한 도메인을 입력하세요.',
    keys: [],
    setupFields: [
      { id: 'domain', name: '도메인', hint: '예: mycompany.com', type: 'domain' },
      { id: 'companyName', name: '회사/팀명', hint: '예: MyStartup', type: 'text' },
      { id: 'adminEmail', name: '관리자 개인 이메일', hint: '메일 전달 및 알림용', type: 'email' },
    ],
    validate: async () => ({ ok: true, message: '' }),
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'DNS, CDN, Email Routing, DDoS 방어, Pages',
    category: 'infra',
    freeTier: 'DNS 무료, CDN 무료, Email Routing 무료, Pages 무료, R2 10GB',
    required: true,
    signupUrl: 'https://dash.cloudflare.com/sign-up',
    docsUrl: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/',
    keyInstructions: [
      '1. https://dash.cloudflare.com/sign-up 에서 가입',
      '2. 도메인 추가 후 네임서버 변경',
      '3. My Profile > API Tokens > Create Token',
      '4. "Edit zone DNS" 템플릿 사용 + Email Routing 권한 추가',
      '5. Account ID는 대시보드 우측 하단에서 확인',
    ].join('\n'),
    keys: [
      { id: 'cloudflare', name: 'API Token', envVar: 'CLOUDFLARE_API_TOKEN', hint: 'My Profile > API Tokens', validateUrl: 'https://api.cloudflare.com/client/v4/user/tokens/verify' },
      { id: 'cloudflareAccountId', name: 'Account ID', envVar: 'CLOUDFLARE_ACCOUNT_ID', hint: '대시보드 우측 하단' },
    ],
    validate: async (keys) => {
      try {
        const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
          headers: { 'Authorization': `Bearer ${keys.cloudflare}` },
        });
        const data = await res.json() as any;
        return data.success
          ? { ok: true, message: `Token 유효 (${data.result?.status})` }
          : { ok: false, message: `Token 무효: ${JSON.stringify(data.errors)}` };
      } catch (e: any) {
        return { ok: false, message: e.message };
      }
    },
  },
  {
    id: 'resend',
    name: 'Resend',
    description: '이메일 발송 (SMTP API)',
    category: 'email',
    freeTier: '100통/일, 3,000통/월',
    required: true,
    signupUrl: 'https://resend.com/signup',
    docsUrl: 'https://resend.com/docs/api-reference/introduction',
    keyInstructions: [
      '1. https://resend.com/signup 에서 가입',
      '2. API Keys 메뉴에서 키 생성',
      '3. Domains 메뉴에서 도메인 추가 (DNS 레코드는 freestack이 자동 설정)',
    ].join('\n'),
    keys: [
      { id: 'resend', name: 'API Key', envVar: 'RESEND_API_KEY', prefix: 're_', hint: 'Dashboard > API Keys' },
    ],
    validate: async (keys) => {
      try {
        const res = await fetch('https://api.resend.com/domains', {
          headers: { 'Authorization': `Bearer ${keys.resend}` },
        });
        return res.ok
          ? { ok: true, message: 'Resend API 연결 성공' }
          : { ok: false, message: `HTTP ${res.status}` };
      } catch (e: any) {
        return { ok: false, message: e.message };
      }
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'AI 에이전트 엔진 (OpenClaw 기본 프로바이더)',
    category: 'ai',
    freeTier: '무료 크레딧 제공 (가입 시)',
    required: false,
    signupUrl: 'https://console.anthropic.com/',
    docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
    keyInstructions: [
      '1. https://console.anthropic.com/ 에서 가입',
      '2. Settings > API Keys > Create Key',
      '3. OpenClaw에서 Claude를 AI 엔진으로 사용',
    ].join('\n'),
    keys: [
      { id: 'anthropic', name: 'API Key', envVar: 'ANTHROPIC_API_KEY', prefix: 'sk-ant-', hint: 'Console > Settings > API Keys' },
    ],
    validate: async (keys) => {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': keys.anthropic,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        return res.ok || res.status === 400
          ? { ok: true, message: 'Anthropic API 키 유효' }
          : { ok: false, message: `HTTP ${res.status}` };
      } catch (e: any) {
        return { ok: false, message: e.message };
      }
    },
  },
  {
    id: 'slack',
    name: 'Slack',
    description: '팀 메시징 + OpenClaw 봇 연동',
    category: 'messaging',
    freeTier: 'Free 플랜 (90일 메시지 이력, 10개 연동)',
    required: false,
    signupUrl: 'https://api.slack.com/apps',
    docsUrl: 'https://api.slack.com/quickstart',
    keyInstructions: [
      '1. https://api.slack.com/apps 에서 "Create New App"',
      '2. "From scratch" 선택 → 앱 이름 + 워크스페이스 선택',
      '3. OAuth & Permissions에서 Bot Token Scopes 추가:',
      '   - chat:write, channels:read, channels:history, users:read',
      '4. Install to Workspace → Bot User OAuth Token 복사 (xoxb-...)',
      '5. Basic Information > App-Level Token 생성 (connections:write 스코프)',
    ].join('\n'),
    keys: [
      { id: 'slack', name: 'Bot Token', envVar: 'SLACK_BOT_TOKEN', prefix: 'xoxb-', hint: 'OAuth & Permissions > Bot User OAuth Token' },
      { id: 'slackApp', name: 'App Token', envVar: 'SLACK_APP_TOKEN', prefix: 'xapp-', hint: 'Basic Info > App-Level Tokens' },
    ],
    validate: async (keys) => {
      try {
        const res = await fetch('https://slack.com/api/auth.test', {
          headers: { 'Authorization': `Bearer ${keys.slack}` },
        });
        const data = await res.json() as any;
        return data.ok
          ? { ok: true, message: `Slack 연결: ${data.team} / @${data.user}` }
          : { ok: false, message: data.error || 'auth failed' };
      } catch (e: any) {
        return { ok: false, message: e.message };
      }
    },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: '텔레그램 봇 (OpenClaw 모바일 접근)',
    category: 'messaging',
    freeTier: '완전 무료',
    required: false,
    signupUrl: 'https://t.me/BotFather',
    docsUrl: 'https://core.telegram.org/bots/tutorial',
    keyInstructions: [
      '1. Telegram에서 @BotFather 검색',
      '2. /newbot 명령어 → 봇 이름/유저네임 입력',
      '3. 발급된 Bot Token 복사 (숫자:문자열 형식)',
      '4. OpenClaw에서 이 봇을 통해 어디서나 AI와 대화',
    ].join('\n'),
    keys: [
      { id: 'telegram', name: 'Bot Token', envVar: 'TELEGRAM_BOT_TOKEN', hint: '@BotFather > /newbot' },
    ],
    validate: async (keys) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${keys.telegram}/getMe`);
        const data = await res.json() as any;
        return data.ok
          ? { ok: true, message: `Telegram 봇: @${data.result.username}` }
          : { ok: false, message: data.description || 'invalid token' };
      } catch (e: any) {
        return { ok: false, message: e.message };
      }
    },
  },
  {
    id: 'tailscale',
    name: 'Tailscale',
    description: '내부 VPN (Zero-config mesh VPN)',
    category: 'vpn',
    freeTier: '3유저, 100디바이스',
    required: false,
    signupUrl: 'https://login.tailscale.com/start',
    docsUrl: 'https://tailscale.com/kb/1085/auth-keys',
    keyInstructions: [
      '1. https://login.tailscale.com/start 에서 가입 (GitHub/Google SSO)',
      '2. Settings > Keys > Generate auth key',
      '3. Reusable + Ephemeral 옵션 권장 (서버용)',
    ].join('\n'),
    keys: [
      { id: 'tailscale', name: 'Auth Key', envVar: 'TAILSCALE_AUTHKEY', prefix: 'tskey-', hint: 'Admin > Settings > Keys' },
    ],
    validate: async () => ({ ok: true, message: 'Tailscale 키는 연결 시 검증됩니다' }),
  },
];

// AI-readable JSON manifest
export function getManifestForAI() {
  return {
    tool: 'freestack',
    version: '0.1.0',
    description: 'Free-tier startup workspace bootstrapper',
    setupFlow: SERVICES.map(s => ({
      step: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      required: s.required,
      freeTier: s.freeTier,
      signupUrl: s.signupUrl,
      docsUrl: s.docsUrl,
      instructions: s.keyInstructions,
      requiredKeys: s.keys.map(k => ({ id: k.id, envVar: k.envVar, prefix: k.prefix, hint: k.hint })),
      setupFields: s.setupFields,
    })),
    architecture: {
      dns: 'Cloudflare (free)',
      emailInbound: 'Cloudflare Email Routing (free)',
      emailOutbound: 'Resend (3K/month free) or OCI Email Delivery (3K/month free)',
      compute: 'Oracle Cloud Always Free (ARM 4 OCPU/24GB + AMD x2)',
      vpn: 'Tailscale (3 users free)',
      ai: 'Nanobot/OpenClaw/ZeroClaw + Anthropic Claude or Ollama (local)',
      messaging: 'Slack (free) + Telegram (free)',
    },
    commands: {
      init: 'freestack init - Interactive setup wizard',
      dns: 'freestack dns setup - Configure DNS + email routing',
      mail: 'freestack mail send/inbox/read - Email management',
      keys: 'freestack keys set/list/export - API key management',
      agent: 'freestack agent deploy/status/logs - AI agent (Nanobot default)',
      vpn: 'freestack vpn setup/status/ssh - Tailscale VPN',
      server: 'freestack server list/info - Oracle Cloud instances',
      status: 'freestack status - Full dashboard',
    },
  };
}
