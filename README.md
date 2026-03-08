<p align="center">
  <img src="https://img.shields.io/badge/cost-$0%2Fmonth-brightgreen?style=for-the-badge" alt="Cost: $0/month" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-blue?style=for-the-badge" alt="Node >= 18" />
  <img src="https://img.shields.io/npm/v/%40ubermensch1218%2Ffreestack?style=for-the-badge&color=orange" alt="npm" />
</p>

<h1 align="center">freestack</h1>

<p align="center">
  <strong>Bootstrap your entire startup workspace for $0/month.</strong><br/>
  DNS, email, server, database, VPN, AI agent, file sharing, skill hub — all from free tiers.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &bull;
  <a href="#what-you-get">What You Get</a> &bull;
  <a href="#commands">Commands</a> &bull;
  <a href="#ai-agent">AI Agent</a> &bull;
  <a href="#skill-hub">Skill Hub</a> &bull;
  <a href="#architecture">Architecture</a>
</p>

---

## What You Get

One CLI sets up a complete workspace that normally costs $50+/user/month:

| Feature | Paid Alternative | freestack ($0) |
|---------|-----------------|----------------|
| Custom domain email | Google Workspace $7/user/mo | Cloudflare Email Routing + Resend |
| DNS + CDN + DDoS | Cloudflare Pro $20/mo | Cloudflare Free |
| Server (4 CPU, 24GB RAM) | AWS/GCP $50+/mo | Oracle Cloud Always Free |
| Database (MySQL/Postgres) | RDS $15+/mo | Self-hosted on Oracle VM |
| VPN for team | Tailscale Business $6/user/mo | Tailscale Personal (3 users) |
| AI Agent | ChatGPT Team $25/user/mo | Nanobot/OpenClaw + Ollama (self-hosted) |
| File sharing (10GB) | Google Drive $7/user/mo | Cloudflare R2 |

**Total: $0/month** for up to 3 team members.

---

## Quickstart

```bash
# Install from npm
npm install -g @ubermensch1218/freestack

# Or use npx
npx @ubermensch1218/freestack init

# Run the wizard
freestack init
```

The wizard will:

1. Check your machine and install missing tools
2. Walk through each service — open signup pages, collect API keys, validate them
3. Provision infrastructure — Oracle VM, MySQL, DNS
4. Deploy your stack — AI agent, VPN, email routing

---

## Commands

### Setup & Status

```
freestack init              # Interactive setup wizard (does everything)
freestack doctor            # Check & install local tools (brew)
freestack doctor --install  # Auto-install all missing tools
freestack keys set          # Manage API keys interactively
freestack keys list         # Show stored keys (masked)
freestack keys export       # Export as .env format
freestack status            # Full dashboard
```

### DNS & Email

```
freestack dns setup         # Cloudflare DNS + Email Routing
freestack dns records       # List DNS records
freestack dns resend-verify # Auto-add Resend DNS records
freestack mail send         # Send email (interactive or flags)
freestack mail inbox        # View sent emails
freestack mail read <id>    # Read email details
```

### Server & Team

```
freestack server list       # Oracle Cloud instances
freestack server info       # Free tier details
freestack team setup        # DB setup (MySQL / PostgreSQL / Neon)
freestack team add          # Add team member
freestack team list         # List members with roles
freestack team role <email> <ADMIN|GROUP|TEAM|ANON>
```

### Calendar & Files

```
freestack cal add           # Add event
freestack cal today         # Today's schedule
freestack cal list --week   # This week's events
freestack files setup       # Create R2 bucket
freestack files upload <p>  # Upload to R2 CDN
freestack files list        # List files with access roles
```

### AI Agent (Nanobot / OpenClaw / ZeroClaw)

```
freestack agent deploy      # Deploy AI agent (choose runtime + target)
freestack agent status      # Check running state
freestack agent logs        # View container logs
freestack agent start       # Start container
freestack agent stop        # Stop container
freestack agent update      # Pull latest image
freestack agent pricing     # Cloud server price comparison
freestack agent usecases    # Install usecase templates
```

Deploy flow:

```
? AI 에이전트 런타임 선택:
  ❯ 🐱 Nanobot (HKUDS) — 추천  Python 4천줄, 45MB, MCP
    🦞 OpenClaw — 280K stars, 최대 기능, 무거움
    ⚡ ZeroClaw — Rust, 5MB, ARM/엣지 특화

? 배포 대상 선택:
  ❯ 🏠 홈서버 (Tailscale) — $0/월
    🖥️  원격 Linux VM (SSH)
    📋 클라우드 가격 비교
```

### Skill Hub

```
freestack hub               # Interactive category browser
freestack hub search <q>    # Search local + ClawHub
freestack hub browse [cat]  # Browse by category
freestack hub info <id>     # Skill details + env var status
freestack hub install <id>  # Interactive install (API keys → Q&A)
freestack hub remove <id>   # Uninstall skill
freestack hub list          # Installed skills table
freestack hub export        # Generate master prompt
freestack hub update [id]   # Version update
freestack hub setup         # ONE-SHOT WIZARD: all skills in one go
```

### VPN (Tailscale)

```
freestack vpn setup         # Install on local + server
freestack vpn status        # Network status
freestack vpn ssh           # SSH via VPN
freestack vpn expose <port> # Tailscale Funnel (public HTTPS)
```

---

## AI Agent

freestack supports three self-hosted AI agent runtimes:

| | Nanobot (default) | OpenClaw | ZeroClaw |
|---|---|---|---|
| Language | Python (~4K LOC) | TypeScript (430K LOC) | Rust (3.4MB binary) |
| Memory | 45MB | 2-4GB | <5MB |
| Startup | 0.8s | 8-12s | <10ms |
| LLM Providers | 11+ (Claude, OpenAI, Gemini, Kimi, GLM, DeepSeek, Ollama...) | 11+ | 20+ |
| Channels | Telegram, Discord, WhatsApp, Slack, Email, QQ | Same | Same |
| MCP Support | Yes (v0.1.4+) | Yes | No |
| Install | `pip install nanobot-ai` or Docker | Docker | Binary |

**Why Nanobot is default**: Smallest footprint, auditable code, MCP support, no security CVEs, runs on 1GB VPS.

### Multi-LLM Support

During deploy, freestack collects API keys for multiple providers:

```
Claude (Anthropic) — primary
OpenAI             — fallback
Google Gemini      — fallback
Kimi (Moonshot)    — cheap alternative
GLM (Zhipu)        — cheap alternative
Ollama             — local GPU, $0
```

All keys are injected into the Docker container. The runtime uses them for fallback chains and cost-optimized routing.

### Post-Deploy Verification

After deploy, freestack runs a test against every registered key:

```
테스트 run — 등록된 키 검증

✓ Claude — 작동 확인!
✓ OpenAI — 작동 확인!
✗ Gemini — HTTP 403
✓ Telegram — @mybot 작동 확인!

검증 결과: 3/4 서비스 작동 확인!
? 더 넣을 키가 있을까요? (Y/n)
```

---

## Skill Hub

11 curated skills across 7 categories, plus ClawHub integration (5400+ community skills):

| Category | Skills |
|----------|--------|
| Finance | stock-watcher, stock-technical-analysis, naverstock |
| Social | yarn-threads-cli, social-scheduler |
| Content | naver-blog-writer |
| Communication | kakaotalk |
| Research | reddit-readonly, naver-search, naver-shopping |
| Development | claude-team |

Each skill installs with interactive Q&A that fills `{{PLACEHOLDER}}` patterns in the prompt template.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                   Internet                    │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│           Cloudflare (FREE)                   │
│   DNS · CDN · Email Routing · R2 · Pages      │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│       Oracle Cloud ARM VM (FREE)              │
│   4 OCPU · 24GB RAM · 200GB Storage           │
│                                               │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │  MySQL   │  │ Nanobot  │  │Tailscale │   │
│   │  (DB)    │  │(AI Agent)│  │  (VPN)   │   │
│   └──────────┘  └──────────┘  └──────────┘   │
└───────────────────┬──────────────────────────┘
                    │ Tailscale Mesh VPN
          ┌─────────┼─────────┐
          │         │         │
       Laptop    Phone    Home Server
                             (GPU + Ollama)
```

### Free Tier Limits

| Service | Free Allocation |
|---------|----------------|
| **Cloudflare** | DNS, CDN, Email Routing, Pages, R2 (10GB), Workers |
| **Resend** | 3,000 emails/month |
| **Oracle Cloud** | ARM 4C/24GB + AMD x2 + 200GB + 10TB bandwidth |
| **Tailscale** | 3 users, 100 devices |
| **Neon** | 0.5GB serverless Postgres |

### Roles & Access Control

| Role | Level | Access |
|------|-------|--------|
| `ANON` | 0 | Public resources only |
| `TEAM` | 1 | All team resources |
| `GROUP` | 2 | Group-scoped management |
| `ADMIN` | 3 | Full access, user management |

---

## AI-Readable Manifest

freestack is designed for AI agents to operate:

```bash
freestack init --manifest   # Output structured JSON for AI consumption
```

The manifest includes: signup URLs, key formats, validation endpoints, setup instructions, and the complete command reference. An AI agent can read it and bootstrap the entire workspace autonomously.

---

## Requirements

- **Node.js** >= 18
- **macOS** or **Linux** (Windows via WSL)
- A domain name (optional but recommended)

## Install

```bash
npm install -g @ubermensch1218/freestack
```

## Philosophy

1. **$0 or nothing** — Every service must have a meaningful free tier
2. **One command** — `freestack init` does everything
3. **AI-first** — Designed for AI agents to read and operate
4. **Own your infra** — No vendor lock-in, self-hosted by default
5. **Security by default** — Tailscale VPN, no unnecessary public ports

## Contributing

PRs welcome. If you find a free tier we're not exploiting, open an issue.

## License

MIT
