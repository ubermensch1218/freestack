// OpenClaw / NanoClaw 유즈케이스 레지스트리
// 출처: github.com/hesamsheikh/awesome-openclaw-usecases (한국어화)

export interface UsecaseQuestion {
  id: string;
  message: string;
  type: 'input' | 'editor' | 'list';
  default?: string;
  placeholder: string;          // 프롬프트 내 치환 대상
  choices?: { name: string; value: string }[];
}

export interface Usecase {
  id: string;
  name: string;
  emoji: string;
  description: string;
  painPoint: string;
  channels: string[];
  skills: string[];
  envVars?: string[];
  questions: UsecaseQuestion[];
  setupPrompt: string;
  source: string;
}

export const USECASES: Usecase[] = [
  {
    id: 'youtube-content-pipeline',
    name: 'YouTube 콘텐츠 파이프라인',
    emoji: '🎬',
    description: '매시간 AI 뉴스를 스캔하고, 영상 아이디어를 Telegram으로 피칭. 90일 카탈로그와 시맨틱 중복 제거로 같은 주제 반복 방지.',
    painPoint: '매일 트렌드를 찾고, 이미 다룬 주제인지 확인하는 데 시간을 낭비하지 않아도 됩니다.',
    channels: ['telegram', 'slack'],
    skills: ['web_search', 'x-research-v2', 'knowledge-base'],
    envVars: ['X_BEARER_TOKEN'],
    questions: [
      { id: 'niche', message: '콘텐츠 분야/니치 (예: AI, 개발, 스타트업):', type: 'input', default: 'AI', placeholder: '{{NICHE}}' },
      { id: 'telegramTopic', message: 'Telegram 토픽 이름:', type: 'input', default: '영상 아이디어', placeholder: '{{TELEGRAM_TOPIC}}' },
      { id: 'slackChannel', message: 'Slack 채널 이름:', type: 'input', default: 'ai_trends', placeholder: '{{SLACK_CHANNEL}}' },
      { id: 'taskTool', message: '태스크 관리 도구:', type: 'list', default: 'Todoist', placeholder: '{{TASK_TOOL}}', choices: [
        { name: 'Todoist', value: 'Todoist' }, { name: 'Asana', value: 'Asana' }, { name: 'Notion', value: 'Notion' },
      ]},
      { id: 'scanInterval', message: '스캔 주기:', type: 'list', default: '매시간', placeholder: '{{SCAN_INTERVAL}}', choices: [
        { name: '매시간', value: '매시간' }, { name: '3시간마다', value: '3시간마다' }, { name: '매일 아침', value: '매일 아침 9시' },
      ]},
    ],
    setupPrompt: `{{SCAN_INTERVAL}} 크론잡을 실행해서:
1. 웹과 X/Twitter에서 최신 {{NICHE}} 뉴스를 검색
2. 내 90일 YouTube 카탈로그와 비교 (중복 방지)
3. 과거 피칭 데이터베이스와 시맨틱 유사도 검사
4. 새로운 아이디어면 Telegram "{{TELEGRAM_TOPIC}}" 토픽에 소스와 함께 피칭

또한: Slack #{{SLACK_CHANNEL}}에 링크를 공유하면 자동으로:
1. 해당 주제 리서치
2. X에서 관련 게시물 검색
3. 내 지식 베이스 쿼리
4. {{TASK_TOOL}}에 전체 개요가 담긴 카드 생성`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/youtube-content-pipeline.md',
  },
  {
    id: 'overnight-mini-app-builder',
    name: '자율 태스크 & 미니앱 빌더',
    emoji: '🤖',
    description: '목표를 입력하면 매일 아침 4-5개 태스크를 자동 생성하고 직접 실행. 밤새 서프라이즈 미니앱 MVP까지 만들어줌.',
    painPoint: '큰 목표를 매일의 실행 가능한 단계로 쪼개고 실행하는 일 자체를 AI에게 위임.',
    channels: ['telegram', 'discord'],
    skills: ['sessions_spawn', 'sessions_send'],
    questions: [
      { id: 'careerGoals', message: '커리어 목표 (여러 줄 가능, 줄바꿈으로 구분):', type: 'input', default: 'YouTube 구독자 10만 달성\nSaaS 제품 Q3 출시', placeholder: '{{CAREER_GOALS}}' },
      { id: 'businessGoals', message: '비즈니스 목표:', type: 'input', default: '월 매출 $10K 달성\n파트너십 5개 구축', placeholder: '{{BUSINESS_GOALS}}' },
      { id: 'personalGoals', message: '개인 목표:', type: 'input', default: '월 2권 독서\n운동 주 3회', placeholder: '{{PERSONAL_GOALS}}' },
      { id: 'taskTime', message: '매일 태스크 생성 시간:', type: 'input', default: '아침 8시', placeholder: '{{TASK_TIME}}' },
      { id: 'taskCount', message: '매일 생성할 태스크 수:', type: 'input', default: '4-5', placeholder: '{{TASK_COUNT}}' },
    ],
    setupPrompt: `내 목표와 미션을 전부 기억해:

커리어:
{{CAREER_GOALS}}

비즈니스:
{{BUSINESS_GOALS}}

개인:
{{PERSONAL_GOALS}}

매일 {{TASK_TIME}}에 내 컴퓨터에서 자율적으로 완료할 수 있는 {{TASK_COUNT}}개 태스크를 만들어.
그리고 직접 스케줄하고 실행해. 예시:
- 경쟁사 리서치 및 분석 보고서 작성
- 트렌딩 주제 기반 영상 스크립트 초안
- 앱에 새 기능 구현
- SNS 콘텐츠 작성 및 예약
- 밤새 서프라이즈 미니앱 MVP 빌드

칸반 보드에서 모든 태스크를 추적해. 완료하면 보드 업데이트.`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/overnight-mini-app-builder.md',
  },
  {
    id: 'content-factory',
    name: '멀티 에이전트 콘텐츠 팩토리',
    emoji: '🏭',
    description: 'Discord 채널별로 리서치/글쓰기/썸네일 에이전트가 분업. 매일 아침 완성된 콘텐츠를 받아볼 수 있음.',
    painPoint: '리서치→글쓰기→디자인 3단계를 각각 수동으로 하는 대신 체인으로 자동화.',
    channels: ['discord'],
    skills: ['sessions_spawn', 'x-research-v2', 'knowledge-base'],
    questions: [
      { id: 'niche', message: '콘텐츠 분야/니치:', type: 'input', default: 'AI 기술', placeholder: '{{NICHE}}' },
      { id: 'platform', message: '주요 콘텐츠 플랫폼:', type: 'list', default: 'YouTube', placeholder: '{{PLATFORM}}', choices: [
        { name: 'YouTube 영상 스크립트', value: 'YouTube 영상 스크립트' },
        { name: 'X/Twitter 스레드', value: 'X/Twitter 스레드' },
        { name: '뉴스레터', value: '뉴스레터' },
        { name: '블로그 포스트', value: '블로그 포스트' },
        { name: 'LinkedIn 포스트', value: 'LinkedIn 포스트' },
      ]},
      { id: 'scheduleTime', message: '매일 실행 시간:', type: 'input', default: '아침 8시', placeholder: '{{SCHEDULE_TIME}}' },
    ],
    setupPrompt: `Discord에 콘텐츠 팩토리를 만들어줘.
채널별로 다른 에이전트를 설정:

1. 리서치 에이전트 (#리서치): 매일 {{SCHEDULE_TIME}}, {{NICHE}} 분야에서 트렌딩 스토리,
   경쟁사 콘텐츠, SNS에서 잘 되는 콘텐츠를 조사. 상위 5개 기회를 소스와 함께 게시.

2. 글쓰기 에이전트 (#스크립트): 리서치 에이전트의 최고 아이디어를 가져와서
   {{PLATFORM}} 형식으로 전체 초안 작성. #스크립트에 게시.

3. 썸네일 에이전트 (#썸네일): 콘텐츠용 AI 썸네일 또는 커버 이미지 생성.
   #썸네일에 게시.

매일 {{SCHEDULE_TIME}}에 자동으로 이 파이프라인을 실행.`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/content-factory.md',
  },
  {
    id: 'podcast-production',
    name: '팟캐스트 프로덕션 파이프라인',
    emoji: '🎙️',
    description: '주제/게스트 입력 → 리서치, 질문지, 대본, 쇼노트, SNS 홍보 키트까지 자동 생성.',
    painPoint: '팟캐스트 제작 시간의 70%는 녹음이 아닌 리서치와 후반 작업. 이걸 자동화.',
    channels: ['telegram', 'slack', 'discord'],
    skills: ['web_search', 'sessions_spawn'],
    questions: [
      { id: 'podcastName', message: '팟캐스트 이름:', type: 'input', default: '내 팟캐스트', placeholder: '{{PODCAST_NAME}}' },
      { id: 'podcastNiche', message: '팟캐스트 주제/분야:', type: 'input', default: 'AI와 스타트업', placeholder: '{{PODCAST_NICHE}}' },
      { id: 'tone', message: '톤 & 스타일:', type: 'list', default: '캐주얼', placeholder: '{{TONE}}', choices: [
        { name: '캐주얼 (친구 대화)', value: '캐주얼하고 친근한' },
        { name: '프로페셔널', value: '전문적이고 깔끔한' },
        { name: '교육적', value: '교육적이고 명확한' },
      ]},
      { id: 'snsAccounts', message: 'SNS 계정 (X, LinkedIn, Instagram 유저명, 콤마 구분):', type: 'input', default: '', placeholder: '{{SNS_ACCOUNTS}}' },
      { id: 'outputDir', message: '출력 디렉토리:', type: 'input', default: '~/podcast/episodes', placeholder: '{{OUTPUT_DIR}}' },
    ],
    setupPrompt: `"{{PODCAST_NAME}}" 팟캐스트 제작을 도와줘. 분야: {{PODCAST_NICHE}}.

녹음 전 — 주제와 게스트 이름을 주면:
1. 게스트 리서치 — 배경, 최근 작업, 논쟁적 발언, 흥미로운 이야기
2. 주제 리서치 — 주요 트렌드, 최신 뉴스, 일반적 오해
3. 에피소드 아웃라인 생성:
   - 오프닝 훅 (주의를 끄는 1-2문장)
   - 인트로 스크립트 (30초, {{TONE}} 톤)
   - 5-7개 인터뷰 질문 (쉬운 것부터 깊은 것까지)
   - 2-3개 "백업 질문"
   - 마무리 + CTA
   {{OUTPUT_DIR}}/[에피소드번호]/prep/ 에 저장

녹음 후 트랜스크립트를 주면:
- 타임스탬프가 있는 쇼노트 생성
- SEO 최적화된 에피소드 설명 (200자 이내)
- SNS 게시물 ({{SNS_ACCOUNTS}}):
  X 트윗 3개, LinkedIn 1개, Instagram 캡션 1개
- 하이라이트 3개 (타임스탬프 포함)
  {{OUTPUT_DIR}}/[에피소드번호]/publish/ 에 저장`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/podcast-production-pipeline.md',
  },
  {
    id: 'tech-news-digest',
    name: '테크 뉴스 다이제스트',
    emoji: '📰',
    description: 'RSS 46개 + X/Twitter 44명 + GitHub 19개 + 웹검색 4개에서 뉴스를 수집, 품질 점수 매기고 매일 전달.',
    painPoint: '매일 수십 개 소스를 확인하는 대신, 큐레이션된 다이제스트를 아침에 받아보기.',
    channels: ['discord', 'telegram'],
    skills: ['tech-news-digest'],
    envVars: ['X_BEARER_TOKEN', 'BRAVE_API_KEY', 'GITHUB_TOKEN'],
    questions: [
      { id: 'email', message: '다이제스트 받을 이메일:', type: 'input', default: '', placeholder: '{{EMAIL}}' },
      { id: 'discordChannel', message: 'Discord 채널명:', type: 'input', default: 'tech-news', placeholder: '{{DISCORD_CHANNEL}}' },
      { id: 'scheduleTime', message: '매일 전달 시간:', type: 'input', default: '아침 9시', placeholder: '{{SCHEDULE_TIME}}' },
      { id: 'customRss', message: '커스텀 RSS 피드 URL (콤마 구분, 없으면 Enter):', type: 'input', default: '', placeholder: '{{CUSTOM_RSS}}' },
      { id: 'customTwitter', message: '팔로우할 X/Twitter 계정 (콤마 구분, 없으면 Enter):', type: 'input', default: '', placeholder: '{{CUSTOM_TWITTER}}' },
      { id: 'customGithub', message: '모니터링할 GitHub 레포 (콤마 구분, 없으면 Enter):', type: 'input', default: '', placeholder: '{{CUSTOM_GITHUB}}' },
    ],
    setupPrompt: `ClawHub에서 tech-news-digest를 설치해.
매일 {{SCHEDULE_TIME}}에 Discord #{{DISCORD_CHANNEL}} 채널로 테크 다이제스트를 보내줘.
이메일로도 보내줘: {{EMAIL}}

내 커스텀 소스도 추가:
- RSS: {{CUSTOM_RSS}}
- Twitter: {{CUSTOM_TWITTER}}
- GitHub: {{CUSTOM_GITHUB}}`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/multi-source-tech-news-digest.md',
  },
  {
    id: 'daily-reddit-digest',
    name: '일일 Reddit 다이제스트',
    emoji: '📋',
    description: '즐겨찾는 서브레딧의 인기 게시물을 매일 큐레이션. 피드백으로 취향을 학습.',
    painPoint: 'Reddit 브라우징에 시간을 쏟지 않고도 핵심 게시물만 받아보기.',
    channels: ['telegram', 'discord'],
    skills: ['reddit-readonly'],
    questions: [
      { id: 'subreddits', message: '서브레딧 목록 (콤마 구분):', type: 'input', default: 'MachineLearning, LocalLLaMA, SideProject, Startups', placeholder: '{{SUBREDDITS}}' },
      { id: 'digestTime', message: '다이제스트 시간:', type: 'input', default: '오후 5시', placeholder: '{{DIGEST_TIME}}' },
      { id: 'excludeTypes', message: '제외할 콘텐츠 유형 (콤마 구분, 없으면 Enter):', type: 'input', default: '밈, 짤', placeholder: '{{EXCLUDE_TYPES}}' },
      { id: 'preferTypes', message: '선호하는 콘텐츠 유형:', type: 'input', default: '기술 글, 튜토리얼, 오픈소스 프로젝트', placeholder: '{{PREFER_TYPES}}' },
    ],
    setupPrompt: `다음 서브레딧의 인기 게시물을 매일 다이제스트로 만들어줘:
{{SUBREDDITS}}

Reddit 프로세스용 별도 메모리를 만들어서, 내가 좋아하는 게시물 유형을
매일 피드백으로 학습해줘.
- 제외: {{EXCLUDE_TYPES}}
- 선호: {{PREFER_TYPES}}
매일 {{DIGEST_TIME}}에 이 다이제스트를 실행해서 전달해줘.`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/daily-reddit-digest.md',
  },
  {
    id: 'multi-channel-assistant',
    name: '멀티채널 퍼스널 어시스턴트',
    emoji: '🔗',
    description: 'Telegram 토픽별 라우팅 + Slack + Google 워크스페이스 + Todoist + Asana 통합 어시스턴트.',
    painPoint: '여러 앱을 오가며 태스크/일정/메시지를 관리하는 대신 하나의 AI 인터페이스로 통합.',
    channels: ['telegram', 'slack', 'gmail'],
    skills: ['gog', 'todoist', 'asana'],
    questions: [
      { id: 'telegramTopics', message: 'Telegram 토픽 목록 (콤마 구분):', type: 'input', default: '설정, 업데이트, 영상 아이디어, CRM, 수익, 지식 베이스', placeholder: '{{TELEGRAM_TOPICS}}' },
      { id: 'taskTool', message: '주 태스크 관리 도구:', type: 'list', default: 'Todoist', placeholder: '{{TASK_TOOL}}', choices: [
        { name: 'Todoist', value: 'Todoist' }, { name: 'Asana', value: 'Asana' }, { name: 'Notion', value: 'Notion' },
      ]},
      { id: 'projectTool', message: '프로젝트 관리 도구:', type: 'list', default: 'Asana', placeholder: '{{PROJECT_TOOL}}', choices: [
        { name: 'Asana', value: 'Asana' }, { name: 'Notion', value: 'Notion' }, { name: 'Linear', value: 'Linear' },
      ]},
      { id: 'reminders', message: '자동 리마인더 (예: "월요일 6시: 분리수거", 세미콜론 구분):', type: 'input', default: '월요일 오후 6시: 내일 분리수거; 금요일 오후 3시: 주간 업데이트 작성', placeholder: '{{REMINDERS}}' },
    ],
    setupPrompt: `너는 내 멀티채널 어시스턴트야. 컨텍스트에 따라 요청을 라우팅해:

Telegram 토픽: {{TELEGRAM_TOPICS}}

명령어 매핑:
- "[태스크] 할일 추가" → {{TASK_TOOL}}
- "[주제] 카드 생성" → {{PROJECT_TOOL}}
- "[일정] 스케줄" → Google Calendar
- "[사람]에게 [주제] 메일" → Gmail
- "[파일] 드라이브 업로드" → Google Drive

자동 리마인더:
{{REMINDERS}}`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/multi-channel-assistant.md',
  },
  {
    id: 'todoist-task-manager',
    name: 'Todoist 태스크 시각화',
    emoji: '✅',
    description: '에이전트 작업을 Todoist에 실시간 동기화. 진행 상황, 계획, 로그를 투명하게 추적.',
    painPoint: '에이전트가 복잡한 태스크를 실행할 때 뭘 하고 있는지 모르는 문제를 해결.',
    channels: ['telegram'],
    skills: [],
    envVars: ['TODOIST_API_TOKEN'],
    questions: [
      { id: 'todoistToken', message: 'Todoist API Token:', type: 'input', default: '', placeholder: '{{TODOIST_TOKEN}}' },
      { id: 'projectId', message: 'Todoist Project ID (OpenClaw Workspace):', type: 'input', default: '', placeholder: '{{PROJECT_ID}}' },
      { id: 'sectionProgress', message: '진행중 Section ID:', type: 'input', default: '', placeholder: '{{SECTION_PROGRESS}}' },
      { id: 'sectionWaiting', message: '대기 Section ID:', type: 'input', default: '', placeholder: '{{SECTION_WAITING}}' },
      { id: 'sectionDone', message: '완료 Section ID:', type: 'input', default: '', placeholder: '{{SECTION_DONE}}' },
    ],
    setupPrompt: `Todoist 기반 태스크 가시성 시스템을 만들어줘.

scripts/ 폴더에 3개 bash 스크립트를 생성:
1. todoist_api.sh (Todoist REST API curl 래퍼)
2. sync_task.sh (섹션별 태스크 생성/업데이트: 진행중, 대기, 완료)
3. add_comment.sh (진행 로그를 코멘트로 게시)

설정값:
- Token: {{TODOIST_TOKEN}}
- Project ID: {{PROJECT_ID}}
- Section IDs: 진행중={{SECTION_PROGRESS}}, 대기={{SECTION_WAITING}}, 완료={{SECTION_DONE}}

앞으로 복잡한 태스크를 줄 때마다:
1. '진행중'에 태스크 생성, 설명에 전체 계획 기재
2. 하위 단계 완료할 때마다 add_comment.sh로 로그
3. 완료 시 '완료'로 이동`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/todoist-task-manager.md',
  },
  {
    id: 'knowledge-base-rag',
    name: '개인 지식 베이스 (RAG)',
    emoji: '🧠',
    description: 'URL을 Telegram/Slack에 드롭하면 자동 수집. 시맨틱 검색으로 저장한 모든 콘텐츠를 찾을 수 있음.',
    painPoint: '기사, 트윗, 영상을 많이 보지만 지난주에 본 그것을 찾을 수 없는 문제.',
    channels: ['telegram', 'slack'],
    skills: ['knowledge-base', 'web_fetch'],
    questions: [
      { id: 'ingestChannel', message: '수집용 채널/토픽 이름:', type: 'input', default: '지식 베이스', placeholder: '{{INGEST_CHANNEL}}' },
      { id: 'contentTypes', message: '주로 수집할 콘텐츠 유형 (콤마 구분):', type: 'input', default: '기사, 트윗, YouTube 영상, PDF, 논문', placeholder: '{{CONTENT_TYPES}}' },
      { id: 'searchTopics', message: '주요 관심 주제 (콤마 구분):', type: 'input', default: 'LLM, AI 에이전트, 스타트업, 오픈소스', placeholder: '{{SEARCH_TOPICS}}' },
    ],
    setupPrompt: `"{{INGEST_CHANNEL}}" 토픽/채널에 URL을 드롭하면:
1. 콘텐츠를 가져와 ({{CONTENT_TYPES}})
2. 메타데이터와 함께 지식 베이스에 수집 (제목, URL, 날짜, 유형)
3. 확인 응답: 수집된 내용과 청크 수

이 토픽에서 질문하면:
1. 지식 베이스를 시맨틱 검색
2. 소스와 관련 발췌문이 포함된 상위 결과 반환
3. 좋은 매칭이 없으면 알려줘

주요 관심 분야: {{SEARCH_TOPICS}}
다른 워크플로우(영상 아이디어, 미팅 준비 등)에서 리서치가 필요하면
자동으로 지식 베이스를 쿼리해.`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/knowledge-base-rag.md',
  },
  {
    id: 'market-research-product',
    name: '시장 리서치 & 프로덕트 팩토리',
    emoji: '🔬',
    description: 'Reddit/X에서 실제 불만과 요구사항을 수집 → 기회 분석 → MVP 자동 빌드까지.',
    painPoint: '"뭘 만들어야 할지 모르겠다" 문제를 자동 시장 조사로 해결.',
    channels: ['telegram', 'discord'],
    skills: ['last-30-days'],
    questions: [
      { id: 'researchTopic', message: '리서치할 주제/분야:', type: 'input', default: 'AI 에이전트', placeholder: '{{RESEARCH_TOPIC}}' },
      { id: 'targetAudience', message: '타겟 오디언스:', type: 'input', default: '개발자, 스타트업 창업자', placeholder: '{{TARGET_AUDIENCE}}' },
      { id: 'schedule', message: '리서치 주기:', type: 'list', default: '매주 월요일', placeholder: '{{SCHEDULE}}', choices: [
        { name: '매주 월요일 아침', value: '매주 월요일 아침' },
        { name: '매일 아침', value: '매일 아침' },
        { name: '격주 월요일', value: '격주 월요일 아침' },
      ]},
      { id: 'deliveryChannel', message: '결과 전달 채널:', type: 'list', default: 'Telegram', placeholder: '{{DELIVERY_CHANNEL}}', choices: [
        { name: 'Telegram', value: 'Telegram' }, { name: 'Discord', value: 'Discord' }, { name: 'Slack', value: 'Slack' },
      ]},
    ],
    setupPrompt: `Last 30 Days 스킬을 사용해서 "{{RESEARCH_TOPIC}}" 분야에서
{{TARGET_AUDIENCE}}가 겪는 문제점을 리서치해줘.

결과를 다음으로 정리:
- 주요 불만점 (빈도순 랭킹)
- 구체적인 불만과 기능 요청
- 기존 솔루션의 빈틈
- 새로운 제품 기회

{{SCHEDULE}}, "{{RESEARCH_TOPIC}}" 분야에 대한 Reddit과 X 리서치를 실행해서
상위 기회를 {{DELIVERY_CHANNEL}}으로 보내줘.

가장 유망한 기회를 골라서 MVP를 만들어줘.
핵심 기능만 간단하게. 공유할 수 있는 웹앱으로.`,
    source: 'https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/market-research-product-factory.md',
  },
  {
    id: 'us-market-report',
    name: '미국 주식 데일리 리포트',
    emoji: '🇺🇸',
    description: '매일 아침 미장 마감 요약 — S&P 500, NASDAQ, DOW, 섹터별 등락, 주요 종목, 실적 발표, Fed/매크로 이벤트.',
    painPoint: '미국 장 끝나면 새벽인데, 아침에 일어나면 이미 정리된 요약을 받아보고 싶다.',
    channels: ['telegram', 'slack'],
    skills: ['web_search'],
    envVars: ['BRAVE_API_KEY'],
    questions: [
      { id: 'deliveryTime', message: '리포트 받을 시간 (한국 시간):', type: 'input', default: '아침 7시', placeholder: '{{DELIVERY_TIME}}' },
      { id: 'watchlist', message: '관심 종목 (티커, 콤마 구분):', type: 'input', default: 'AAPL, NVDA, TSLA, MSFT, GOOGL, AMZN, META', placeholder: '{{WATCHLIST}}' },
      { id: 'sectors', message: '관심 섹터 (콤마 구분):', type: 'input', default: 'AI/반도체, 빅테크, 바이오, 에너지', placeholder: '{{SECTORS}}' },
      { id: 'channel', message: '리포트 전달 채널:', type: 'list', default: 'Telegram', placeholder: '{{CHANNEL}}', choices: [
        { name: 'Telegram', value: 'Telegram' }, { name: 'Slack', value: 'Slack' }, { name: 'Discord', value: 'Discord' },
      ]},
      { id: 'style', message: '리포트 스타일:', type: 'list', default: '간결', placeholder: '{{STYLE}}', choices: [
        { name: '간결 (핵심만 5줄)', value: '간결하게 핵심만 5줄 이내로' },
        { name: '상세 (섹터별 분석 포함)', value: '섹터별 상세 분석 포함, 표 형식으로' },
        { name: '투자 메모 (내 포트폴리오 중심)', value: '내 관심 종목 중심으로 투자 메모 형식' },
      ]},
      { id: 'includePremarket', message: '프리마켓/애프터마켓 포함?:', type: 'list', default: '포함', placeholder: '{{PREMARKET}}', choices: [
        { name: '포함 (프리마켓 + 애프터 주요 움직임)', value: '\n\n프리마켓/애프터마켓 주요 움직임도 포함해줘.' },
        { name: '정규장만', value: '' },
      ]},
    ],
    setupPrompt: `매일 {{DELIVERY_TIME}} (KST)에 미국 주식 시장 데일리 리포트를 {{CHANNEL}}로 보내줘.

리포트 구성:
1. 📊 지수 요약: S&P 500, NASDAQ, DOW, Russell 2000 — 종가, 등락률, 거래량
2. 🏆 Top Movers: 상승/하락 상위 5개 종목 (이유 포함)
3. 👀 관심 종목: {{WATCHLIST}} — 각 종목 종가, 등락, 주요 뉴스
4. 🏭 섹터 동향: {{SECTORS}} — 섹터 ETF 기준 등락
5. 📅 주요 이벤트: 실적 발표, Fed 발언, 경제 지표, 옵션 만기 등
6. 💡 내일 전망: 선물/아시아장 동향, 주요 일정{{PREMARKET}}

스타일: {{STYLE}}.
한국어로 작성. 숫자는 정확하게 (% 소수점 2자리).
출처가 불확실한 정보는 명시해줘.`,
    source: 'freestack-custom',
  },
  {
    id: 'kr-market-report',
    name: '한국 주식 데일리 리포트',
    emoji: '🇰🇷',
    description: '매일 장 마감 후 국장 요약 — KOSPI, KOSDAQ, 외국인/기관 수급, 섹터, 주요 종목, 공시.',
    painPoint: '장중에 바빠서 못 보다가 마감 후 뉴스를 일일이 찾아보는 시간 낭비.',
    channels: ['telegram', 'slack'],
    skills: ['web_search'],
    envVars: ['BRAVE_API_KEY'],
    questions: [
      { id: 'deliveryTime', message: '리포트 받을 시간:', type: 'input', default: '오후 4시', placeholder: '{{DELIVERY_TIME}}' },
      { id: 'watchlist', message: '관심 종목 (종목명 또는 코드, 콤마 구분):', type: 'input', default: '삼성전자, SK하이닉스, NAVER, 카카오, LG에너지솔루션', placeholder: '{{WATCHLIST}}' },
      { id: 'sectors', message: '관심 섹터/테마 (콤마 구분):', type: 'input', default: '반도체, 2차전지, AI/소프트웨어, 바이오, 조선', placeholder: '{{SECTORS}}' },
      { id: 'channel', message: '리포트 전달 채널:', type: 'list', default: 'Telegram', placeholder: '{{CHANNEL}}', choices: [
        { name: 'Telegram', value: 'Telegram' }, { name: 'Slack', value: 'Slack' }, { name: 'Discord', value: 'Discord' },
      ]},
      { id: 'style', message: '리포트 스타일:', type: 'list', default: '간결', placeholder: '{{STYLE}}', choices: [
        { name: '간결 (핵심만)', value: '간결하게 핵심만' },
        { name: '상세 (수급 분석 포함)', value: '외국인/기관 수급 흐름 상세 분석 포함' },
        { name: '테마 중심', value: '오늘의 테마/이슈 중심으로 정리' },
      ]},
      { id: 'includeDisclosure', message: '주요 공시 포함?:', type: 'list', default: '포함', placeholder: '{{DISCLOSURE}}', choices: [
        { name: '포함 (관심 종목 공시 + 주요 공시)', value: '\n\n관심 종목 관련 공시와 시장 주요 공시(유상증자, 대규모 지분변동, 실적 발표 등)도 포함해줘.' },
        { name: '미포함', value: '' },
      ]},
    ],
    setupPrompt: `매일 {{DELIVERY_TIME}} (KST)에 한국 주식 시장 데일리 리포트를 {{CHANNEL}}로 보내줘.

리포트 구성:
1. 📊 지수 요약: KOSPI, KOSDAQ — 종가, 등락률, 거래대금
2. 💰 수급 동향: 외국인/기관/개인 순매수 상위 5개 종목
3. 👀 관심 종목: {{WATCHLIST}} — 종가, 등락률, 거래량, 주요 뉴스
4. 🏭 섹터/테마: {{SECTORS}} — 테마별 등락, 주도주
5. 🏆 거래대금 상위: 코스피+코스닥 합산 거래대금 Top 10
6. 📋 시장 이슈: 금리, 환율(원/달러), 유가, 정책/규제 뉴스
7. 🌏 글로벌 연동: 전일 미장 영향, 중국/일본 시장 동향{{DISCLOSURE}}

스타일: {{STYLE}}.
한국어로 작성. 종목코드도 같이 표기 (예: 삼성전자 005930).
증권사 리포트나 뉴스 출처가 있으면 함께 표기.`,
    source: 'freestack-custom',
  },
];

// ─── 유즈케이스에서 필요한 환경변수 메타 ───

export interface EnvVarMeta {
  envVar: string;
  name: string;
  description: string;
  signupUrl: string;
  instructions: string;
  prefix?: string;
  keyId: string;       // keys.ts의 KEY_DEFS id 매핑
  oauthNote?: string;  // OAuth 관련 안내
}

export const ENV_VAR_REGISTRY: EnvVarMeta[] = [
  {
    envVar: 'X_BEARER_TOKEN',
    name: 'X/Twitter Bearer Token',
    description: 'X API v2 읽기 전용 (트윗/트렌드 검색)',
    signupUrl: 'https://developer.x.com/en/portal/dashboard',
    instructions: '1. developer.x.com 로그인\n2. Projects & Apps → 프로젝트 생성\n3. Keys and tokens → Bearer Token 복사',
    keyId: 'xBearerToken',
    oauthNote: 'OAuth 2.0 App-Only (Bearer Token) — 사용자 인증 불필요, 읽기 전용',
  },
  {
    envVar: 'BRAVE_API_KEY',
    name: 'Brave Search API Key',
    description: '웹 검색 API (월 2,000건 무료)',
    signupUrl: 'https://brave.com/search/api/',
    instructions: '1. brave.com/search/api 에서 가입\n2. Free plan 선택 (2,000 queries/월)\n3. API Keys → 키 복사',
    keyId: 'braveSearch',
  },
  {
    envVar: 'GITHUB_TOKEN',
    name: 'GitHub Personal Access Token',
    description: 'GitHub API (레포 모니터링, 트렌드)',
    signupUrl: 'https://github.com/settings/tokens/new',
    instructions: '1. github.com/settings/tokens/new\n2. Token name: freestack\n3. Scopes: public_repo (읽기만 필요)\n4. Generate → 토큰 복사',
    prefix: 'ghp_',
    keyId: 'githubToken',
    oauthNote: 'Fine-grained PAT 또는 Classic token 모두 가능',
  },
  {
    envVar: 'TODOIST_API_TOKEN',
    name: 'Todoist API Token',
    description: '태스크 관리 연동 (읽기/쓰기)',
    signupUrl: 'https://app.todoist.com/app/settings/integrations/developer',
    instructions: '1. Todoist 설정 → 연동 → 개발자\n2. API token 복사',
    keyId: 'todoistToken',
  },
  {
    envVar: 'DISCORD_BOT_TOKEN',
    name: 'Discord Bot Token',
    description: 'Discord 봇 연동',
    signupUrl: 'https://discord.com/developers/applications',
    instructions: '1. discord.com/developers/applications\n2. New Application → Bot 탭\n3. Token → Reset Token → 복사\n4. OAuth2 → bot scope + Send Messages 권한으로 서버에 초대',
    keyId: 'discordBot',
    oauthNote: 'Bot Token (OAuth2로 서버 초대 필요)',
  },
  {
    envVar: 'SLACK_BOT_TOKEN',
    name: 'Slack Bot Token',
    description: 'Slack 봇 연동 (메시지 읽기/쓰기)',
    signupUrl: 'https://api.slack.com/apps',
    instructions: '1. api.slack.com/apps → Create New App\n2. OAuth & Permissions → Bot Token Scopes 추가\n3. Install to Workspace → Bot User OAuth Token 복사',
    prefix: 'xoxb-',
    keyId: 'slack',
    oauthNote: 'OAuth 2.0 — 워크스페이스 설치 후 Bot Token 발급',
  },
  {
    envVar: 'TELEGRAM_BOT_TOKEN',
    name: 'Telegram Bot Token',
    description: 'Telegram 봇 연동',
    signupUrl: 'https://t.me/BotFather',
    instructions: '1. Telegram에서 @BotFather 채팅\n2. /newbot → 봇 이름/유저네임 설정\n3. 토큰 복사',
    keyId: 'telegram',
  },
];

export const USECASE_CATEGORIES = [
  { id: 'content', name: '콘텐츠 제작', usecases: ['youtube-content-pipeline', 'content-factory', 'podcast-production'] },
  { id: 'productivity', name: '생산성', usecases: ['overnight-mini-app-builder', 'multi-channel-assistant', 'todoist-task-manager'] },
  { id: 'research', name: '리서치 & 정보', usecases: ['tech-news-digest', 'daily-reddit-digest', 'knowledge-base-rag', 'market-research-product'] },
  { id: 'finance', name: '주식 & 금융', usecases: ['us-market-report', 'kr-market-report'] },
];
