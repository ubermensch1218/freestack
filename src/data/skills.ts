// freestack 스킬 허브 레지스트리
// ClawHub 호환 + freestack 자체 큐레이션

export type SkillCategory = 'finance' | 'social' | 'productivity' | 'research' | 'development' | 'content' | 'communication';

export interface SkillQuestion {
  id: string;
  message: string;
  type: 'input' | 'editor' | 'list';
  default?: string;
  placeholder: string;
  choices?: { name: string; value: string }[];
}

export interface Skill {
  id: string;
  name: string;
  emoji: string;
  description: string;
  version: string;
  author: string;
  category: SkillCategory;
  tags: string[];
  channels: string[];
  envVars?: string[];
  source: 'freestack' | 'clawhub' | 'community';
  clawHubId?: string;
  prompt: string;
  questions?: SkillQuestion[];
  dependencies?: string[];
  recommended?: string[];
}

export interface InstalledSkill {
  id: string;
  version: string;
  source: 'freestack' | 'clawhub' | 'community';
  installedAt: string;
  configValues?: Record<string, string>;
  enabled: boolean;
}

export const SKILL_CATEGORIES = [
  { id: 'finance' as const,       name: '주식 & 금융',   emoji: '📈' },
  { id: 'social' as const,        name: 'SNS',          emoji: '📱' },
  { id: 'productivity' as const,  name: '생산성',        emoji: '⚡' },
  { id: 'research' as const,      name: '리서치',        emoji: '🔍' },
  { id: 'development' as const,   name: '개발',          emoji: '💻' },
  { id: 'content' as const,       name: '콘텐츠',        emoji: '🎬' },
  { id: 'communication' as const, name: '커뮤니케이션',   emoji: '💬' },
];

export const SKILLS: Skill[] = [
  // ─── 주식 & 금융 ───
  {
    id: 'stock-watcher',
    name: '주식 가격 모니터링',
    emoji: '📊',
    description: '관심 종목 실시간 가격 모니터링 & 조건부 알림 (목표가, 등락률)',
    version: '1.0.0',
    author: 'clawhub',
    category: 'finance',
    tags: ['stock', 'price', 'alert', 'monitoring'],
    channels: ['telegram', 'slack'],
    envVars: ['BRAVE_API_KEY'],
    source: 'clawhub',
    clawHubId: 'stock-watcher',
    questions: [
      { id: 'watchlist', message: '관심 종목 (콤마 구분):', type: 'input', default: 'AAPL, NVDA, TSLA, 삼성전자', placeholder: '{{WATCHLIST}}' },
      { id: 'alertCondition', message: '알림 조건:', type: 'list', default: '등락률 3%', placeholder: '{{ALERT_CONDITION}}', choices: [
        { name: '등락률 3% 이상 변동', value: '하루 등락률 3% 이상 변동 시' },
        { name: '등락률 5% 이상 변동', value: '하루 등락률 5% 이상 변동 시' },
        { name: '목표가 도달 시', value: '내가 설정한 목표가에 도달하면' },
      ]},
      { id: 'checkInterval', message: '확인 주기:', type: 'list', default: '30분', placeholder: '{{CHECK_INTERVAL}}', choices: [
        { name: '15분마다', value: '15분' }, { name: '30분마다', value: '30분' }, { name: '1시간마다', value: '1시간' },
      ]},
    ],
    prompt: `다음 종목을 {{CHECK_INTERVAL}}마다 모니터링해줘:
{{WATCHLIST}}

알림 조건: {{ALERT_CONDITION}}
알림은 Telegram으로 보내줘. 포함할 정보:
- 종목명, 현재가, 등락률
- 거래량 이상 여부
- 관련 뉴스 헤드라인 1-2개`,
  },
  {
    id: 'stock-technical-analysis',
    name: '기술적 분석 리포트',
    emoji: '📉',
    description: '종목의 기술적 분석 — RSI, MACD, 볼린저밴드, 지지/저항선 분석 리포트 생성.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'finance',
    tags: ['stock', 'technical-analysis', 'chart', 'RSI', 'MACD'],
    channels: ['telegram', 'slack'],
    envVars: ['BRAVE_API_KEY'],
    source: 'clawhub',
    clawHubId: 'stock-technical-analysis',
    questions: [
      { id: 'ticker', message: '분석할 종목 (티커/종목명):', type: 'input', default: 'NVDA', placeholder: '{{TICKER}}' },
      { id: 'timeframe', message: '분석 기간:', type: 'list', default: '일봉', placeholder: '{{TIMEFRAME}}', choices: [
        { name: '일봉 (단기)', value: '일봉 (최근 3개월)' },
        { name: '주봉 (중기)', value: '주봉 (최근 1년)' },
        { name: '월봉 (장기)', value: '월봉 (최근 3년)' },
      ]},
    ],
    prompt: `{{TICKER}} 종목의 기술적 분석 리포트를 만들어줘.
기간: {{TIMEFRAME}}

포함할 지표:
1. RSI (과매수/과매도 판단)
2. MACD (추세 전환 신호)
3. 볼린저 밴드 (변동성)
4. 이동평균선 (20일, 60일, 120일)
5. 지지/저항선
6. 거래량 분석

결론: 매수/매도/관망 의견과 근거를 요약해줘.
⚠️ 투자 판단은 참고용이며 투자 책임은 본인에게 있음을 명시.`,
  },
  {
    id: 'naverstock',
    name: '네이버 주식 정보',
    emoji: '🇰🇷',
    description: '네이버 금융 기반 한국 주식 정보 조회 — 시세, 뉴스, 토론방 요약.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'finance',
    tags: ['naver', 'stock', 'korean', 'kospi', 'kosdaq'],
    channels: ['telegram', 'slack'],
    source: 'clawhub',
    clawHubId: 'naverstock-skill',
    questions: [
      { id: 'stocks', message: '관심 종목 (종목명, 콤마 구분):', type: 'input', default: '삼성전자, SK하이닉스, NAVER', placeholder: '{{STOCKS}}' },
    ],
    prompt: `네이버 금융에서 다음 종목을 조회해줘: {{STOCKS}}

각 종목에 대해:
1. 현재가, 등락률, 거래량
2. 최근 뉴스 3개
3. 종목 토론방 핵심 의견 요약
4. 외국인/기관 매매 동향`,
  },

  // ─── SNS ───
  {
    id: 'yarn-threads-cli',
    name: 'Threads 게시물 관리',
    emoji: '🧵',
    description: 'Threads.com 게시물 작성, 답글, 피드 조회. CLI에서 직접 Threads 관리.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'social',
    tags: ['threads', 'meta', 'social', 'posting'],
    channels: ['telegram'],
    source: 'clawhub',
    clawHubId: 'yarn-threads-cli',
    questions: [
      { id: 'accountName', message: 'Threads 계정명 (@username):', type: 'input', default: '', placeholder: '{{ACCOUNT_NAME}}' },
      { id: 'postStyle', message: '게시물 톤:', type: 'list', default: '캐주얼', placeholder: '{{POST_STYLE}}', choices: [
        { name: '캐주얼 (일상 톤)', value: '캐주얼하고 친근한' },
        { name: '전문적', value: '전문적이고 인사이트 있는' },
        { name: '유머러스', value: '유머러스하고 밈 감성의' },
      ]},
    ],
    prompt: `Threads 계정 {{ACCOUNT_NAME}} 관리를 도와줘.
게시물 톤: {{POST_STYLE}}

기능:
1. 내가 주제를 주면 Threads 게시물 초안 작성 (300자 이내)
2. 트렌딩 주제 기반 게시물 아이디어 제안
3. 답글/대화 관리
4. 게시 일정 관리`,
  },
  {
    id: 'social-scheduler',
    name: 'SNS 예약 게시',
    emoji: '📅',
    description: '여러 SNS에 콘텐츠를 예약 게시. Threads, X, LinkedIn, Instagram 지원.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'social',
    tags: ['social', 'schedule', 'posting', 'threads', 'twitter', 'linkedin'],
    channels: ['telegram', 'slack'],
    envVars: ['X_BEARER_TOKEN'],
    source: 'clawhub',
    clawHubId: 'social-scheduler',
    questions: [
      { id: 'platforms', message: '게시할 플랫폼 (콤마 구분):', type: 'input', default: 'Threads, X, LinkedIn', placeholder: '{{PLATFORMS}}' },
      { id: 'frequency', message: '게시 빈도:', type: 'list', default: '매일 1회', placeholder: '{{FREQUENCY}}', choices: [
        { name: '매일 1회', value: '매일 1회' },
        { name: '매일 2회 (아침/저녁)', value: '매일 2회 (아침 9시, 저녁 7시)' },
        { name: '주 3회', value: '주 3회 (월/수/금)' },
      ]},
      { id: 'contentNiche', message: '콘텐츠 주제/니치:', type: 'input', default: 'AI, 스타트업', placeholder: '{{CONTENT_NICHE}}' },
    ],
    prompt: `SNS 예약 게시 매니저 역할을 해줘.

플랫폼: {{PLATFORMS}}
빈도: {{FREQUENCY}}
주제: {{CONTENT_NICHE}}

워크플로우:
1. 매일 {{CONTENT_NICHE}} 관련 콘텐츠 아이디어 3개 제안
2. 내가 고르면 플랫폼별로 최적화된 글 작성
3. 예약 시간에 맞춰 게시 (각 플랫폼 최적 시간대 반영)
4. 성과 피드백 요청 (좋아요, 댓글 수 등)`,
  },
  {
    id: 'naver-blog-writer',
    name: '네이버 블로그 자동 게시',
    emoji: '📝',
    description: '네이버 블로그 포스트 작성 및 게시. SEO 최적화, 이미지 삽입 지원.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'social',
    tags: ['naver', 'blog', 'seo', 'korean', 'writing'],
    channels: ['telegram'],
    source: 'clawhub',
    clawHubId: 'naver-blog-writer',
    questions: [
      { id: 'blogTopic', message: '블로그 주제/카테고리:', type: 'input', default: 'IT/테크 리뷰', placeholder: '{{BLOG_TOPIC}}' },
      { id: 'targetKeywords', message: '타겟 키워드 (콤마 구분):', type: 'input', default: '', placeholder: '{{TARGET_KEYWORDS}}' },
    ],
    prompt: `네이버 블로그 포스트 작성을 도와줘.
주제: {{BLOG_TOPIC}}
타겟 키워드: {{TARGET_KEYWORDS}}

작성 시 지침:
1. 네이버 SEO 최적화 (제목에 키워드 포함, 본문 2,000자 이상)
2. 소제목 구분 (H2, H3)
3. 이미지 삽입 위치 표시
4. 해시태그 5-10개 추천
5. 네이버 검색에 잘 노출되는 문체 사용`,
  },
  {
    id: 'kakaotalk',
    name: '카카오톡 연동',
    emoji: '💬',
    description: '카카오톡 메시지 전송 및 알림. 카카오 비즈니스 API 활용.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'communication',
    tags: ['kakaotalk', 'kakao', 'korean', 'messaging'],
    channels: ['telegram'],
    source: 'clawhub',
    clawHubId: 'kakaotalk',
    questions: [
      { id: 'useCase', message: '카카오톡 활용 목적:', type: 'list', default: '알림', placeholder: '{{USE_CASE}}', choices: [
        { name: '개인 알림 (나에게 메시지)', value: '나에게 주요 알림을 카카오톡으로 전송' },
        { name: '팀 알림 (그룹 메시지)', value: '팀 그룹 채팅에 업무 알림 전송' },
        { name: '고객 알림 (비즈니스)', value: '고객에게 비즈니스 알림톡 전송' },
      ]},
    ],
    prompt: `카카오톡 연동을 설정해줘.
목적: {{USE_CASE}}

카카오 로그인 API와 메시지 API를 활용해서:
1. 인증 설정 (카카오 디벨로퍼스 앱 등록 필요)
2. 메시지 템플릿 설정
3. 다른 스킬(주식 알림, 일정 리마인더 등)에서 카카오톡으로 알림 전송`,
  },

  // ─── 생산성 ───
  {
    id: 'reddit-readonly',
    name: 'Reddit 피드 읽기',
    emoji: '👽',
    description: '서브레딧 인기 게시물 읽기. 인증 없이 사용 가능.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'research',
    tags: ['reddit', 'feed', 'social', 'readonly'],
    channels: ['telegram', 'discord'],
    source: 'clawhub',
    clawHubId: 'reddit-readonly',
    questions: [
      { id: 'subreddits', message: '서브레딧 목록 (콤마 구분):', type: 'input', default: 'MachineLearning, LocalLLaMA, startups', placeholder: '{{SUBREDDITS}}' },
    ],
    prompt: `다음 서브레딧의 인기 게시물을 주기적으로 확인해줘: {{SUBREDDITS}}

각 서브레딧에서:
1. Hot 게시물 상위 5개
2. 각 게시물의 핵심 내용 2-3줄 요약
3. 댓글 중 인사이트 있는 것 1-2개`,
  },
  {
    id: 'naver-search',
    name: '네이버 검색',
    emoji: '🔍',
    description: '네이버 검색 API — 뉴스, 블로그, 카페, 쇼핑 통합 검색.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'research',
    tags: ['naver', 'search', 'korean', 'news'],
    channels: ['telegram', 'slack'],
    source: 'clawhub',
    clawHubId: 'naver-search',
    questions: [
      { id: 'defaultTopics', message: '주요 관심 검색 주제 (콤마 구분):', type: 'input', default: 'AI, 스타트업, 부동산', placeholder: '{{DEFAULT_TOPICS}}' },
    ],
    prompt: `네이버 검색을 활용해줘.
주요 관심 주제: {{DEFAULT_TOPICS}}

기능:
1. 키워드 검색 시 뉴스/블로그/카페 결과 통합 요약
2. 관심 주제의 일일 트렌드 변화 모니터링
3. 네이버 실검(데이터랩) 기반 이슈 알림`,
  },
  {
    id: 'naver-shopping',
    name: '네이버 쇼핑 검색',
    emoji: '🛒',
    description: '네이버 쇼핑 가격 비교, 최저가 알림, 상품 트렌드 분석.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'productivity',
    tags: ['naver', 'shopping', 'price', 'korean', 'ecommerce'],
    channels: ['telegram'],
    source: 'clawhub',
    clawHubId: 'naver-shopping-plus',
    questions: [
      { id: 'products', message: '가격 추적할 상품 (콤마 구분):', type: 'input', default: '', placeholder: '{{PRODUCTS}}' },
    ],
    prompt: `네이버 쇼핑에서 다음 상품을 모니터링해줘: {{PRODUCTS}}

기능:
1. 최저가 알림 (현재 최저가 대비 5% 이상 하락 시)
2. 가격 변동 추이 요약
3. 할인 이벤트/쿠폰 정보`,
  },

  // ─── 개발 ───
  {
    id: 'claude-team',
    name: 'Claude 팀 워크플로우',
    emoji: '🤖',
    description: 'Claude API를 활용한 팀 워크플로우 자동화. 코드 리뷰, 문서 작성 등.',
    version: '1.0.0',
    author: 'clawhub',
    category: 'development',
    tags: ['claude', 'anthropic', 'ai', 'team', 'workflow'],
    channels: ['slack'],
    envVars: ['ANTHROPIC_API_KEY'],
    source: 'clawhub',
    clawHubId: 'claude-team',
    questions: [
      { id: 'teamSize', message: '팀 규모:', type: 'list', default: '2-5명', placeholder: '{{TEAM_SIZE}}', choices: [
        { name: '1인 (솔로)', value: '1인' },
        { name: '2-5명', value: '2-5명' },
        { name: '6-15명', value: '6-15명' },
      ]},
      { id: 'mainUse', message: '주 활용 목적:', type: 'list', default: '코드 리뷰', placeholder: '{{MAIN_USE}}', choices: [
        { name: '코드 리뷰 & PR 요약', value: '코드 리뷰와 PR 요약' },
        { name: '문서 작성 자동화', value: '기술 문서 자동 생성' },
        { name: '이슈 트리아지', value: 'GitHub 이슈 자동 분류 및 우선순위 지정' },
      ]},
    ],
    prompt: `Claude를 팀 워크플로우에 통합해줘.
팀 규모: {{TEAM_SIZE}}
주 활용: {{MAIN_USE}}

Slack 채널에서 동작:
1. PR 링크를 공유하면 자동 코드 리뷰
2. 이슈 링크를 공유하면 관련 코드/문서 찾아서 컨텍스트 제공
3. /doc 명령으로 기술 문서 초안 생성
4. 일일 스탠드업 요약`,
  },
];
