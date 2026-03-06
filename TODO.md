# freestack TODO

## 현재 완료

### CLI 명령어
- [x] `freestack init` - 가이드 위자드 (doctor → 서비스 설정 → 키 검증)
- [x] `freestack doctor` - 로컬 도구 체크 + brew 자동 설치
- [x] `freestack keys` - API 키 통합 관리 (set/list/export) — Kimi, GLM 추가됨
- [x] `freestack dns` - Cloudflare DNS + Email Routing + Resend DNS 자동 등록
- [x] `freestack mail` - 메일 발송/인박스/읽기 (Resend)
- [x] `freestack openclaw` - AI 비서 배포/관리 (Docker on Oracle VM) — **보류, AMD Micro 메모리 부족**
- [x] `freestack vpn` - Tailscale VPN 설정/상태/SSH
- [x] `freestack server` - Oracle Cloud 인스턴스 목록/무료 티어 정보
- [x] `freestack team` - 팀 멤버 CRUD + 역할 관리 (ANON/TEAM/GROUP/ADMIN)
- [x] `freestack calendar` - 일정 추가/목록/오늘 (DB 기반)
- [x] `freestack files` - 파일 업로드/다운로드/목록 (R2 + DB 메타)
- [x] `freestack ai` - AI 채팅 (Claude/OpenAI/Gemini/Kimi/GLM) + DB 로그 저장/검색
- [x] `freestack status` - 전체 대시보드
- [x] `freestack init --manifest` - AI용 JSON 매니페스트 출력

### 서비스 통합
- [x] Cloudflare (DNS, CDN, Email Routing, R2)
- [x] Resend (이메일 발송)
- [x] Oracle Cloud (AMD Micro VM 프로비저닝)
- [x] MySQL 설치 + 스키마 생성 (VM 위)
- [x] MySQL / PostgreSQL / Neon (DB 선택형 코드)

---

## 🔴 즉시 해야 할 것

### 1. VM OOM 복구
OpenClaw Docker 컨테이너가 1GB RAM을 다 잡아먹어서 OOM 상태.

**OCI 웹 콘솔에서 해결:**
1. Compute → Instances → Console connection → Cloud Shell
2. 로그인 후:
```bash
sudo systemctl disable docker
sudo systemctl disable containerd
sudo docker rm -f openclaw
sudo reboot
```

### 2. swap 추가 (OOM 재발 방지)
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo systemctl enable docker
sudo systemctl start docker
```

### 3. fs_chat_logs 테이블 마이그레이션
`freestack team setup` 다시 실행하면 initSchema()에서 자동 생성됨.

---

## 🟡 다음 단계 (VM 복구 후)

### 메일 세팅 확인
- [ ] Resend 도메인 인증 상태 확인 (`freestack dns resend-verify`)
- [ ] Cloudflare Email Routing 포워딩 주소 확인
- [ ] 메일 발송/수신 테스트

### 파일 공유 (GCS 대체 = Cloudflare R2)
- [ ] `freestack files setup` — R2 버킷 생성
- [ ] 파일 업로드/목록 테스트

### 팀원 등록
- [ ] `freestack team add` — admin + 멤버 등록
- [ ] 역할 변경 테스트

### Tailscale VPN
- [ ] 로컬 + VM 양쪽 설정
- [ ] VPN 경유 SSH 확인
- [ ] 공개 포트 닫고 Tailscale만으로 접근

### AI 채팅 테스트
- [ ] API 키 등록 → ask/chat 테스트
- [ ] 파일 컨텍스트 (`-f README.md`) 테스트
- [ ] DB 로그 확인 (`freestack ai logs`)

---

## 🟢 향후 기능

### Auth 서버 (Better Auth)
- [ ] `freestack auth setup` - 배포 + DB 연동
- [ ] OAuth (Google, GitHub, Slack SSO)
- [ ] RBAC 매핑 + JWT 토큰
- [ ] 참고: https://www.better-auth.com/

### 메일 고도화
- [ ] 템플릿 관리, 대량 발송, 예약 발송
- [ ] OCI Email Delivery 연동 (3,000건/월)

### 캘린더 고도화
- [ ] 알림 (Slack/Telegram), Google Calendar 동기화, 반복 일정

### 파일 공유 고도화
- [ ] R2 퍼블릭 도메인, 공유 링크(만료), 접근 제어

### OpenClaw / AI 비서
- [ ] ARM VM 확보 (4C/24GB) → OpenClaw + Ollama 배포
- [ ] AMD Micro는 DB + VPN 전용 유지

### Slack / Telegram 봇
- [ ] 봇 서버 배포, 일정 알림, 팀 관리 커맨드

### 인프라 자동화
- [ ] 원클릭 프로비저닝, DB 백업 (R2), 헬스 체크

### 웹 대시보드
- [ ] Cloudflare Pages에 관리 대시보드 배포

---

## 무료 티어 총정리

| 서비스 | 무료 할당 | 용도 |
|--------|----------|------|
| Cloudflare | DNS, CDN, Email Routing, Pages, R2 10GB | 프론트 전체 |
| Resend | 3,000통/월 | 이메일 발송 |
| Oracle Cloud | ARM 4C/24GB + AMD x2 + 200GB + DB + 10TB | 서버 인프라 |
| OCI Email | 3,000건/월 | 이메일 대안 |
| Tailscale | 3유저, 100디바이스 | VPN |
| Neon | 0.5GB Postgres | 서버리스 DB |
| Upstash Redis | 10K cmd/일 | 캐시/큐 |
| Better Auth | 무제한 (셀프호스팅) | 인증/SSO |
