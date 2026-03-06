<p align="center">
  <img src="https://img.shields.io/badge/cost-$0%2Fmonth-brightgreen?style=for-the-badge" alt="Cost: $0/month" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-blue?style=for-the-badge" alt="Node >= 22" />
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey?style=for-the-badge" alt="macOS" />
</p>

<h1 align="center">freestack</h1>

<p align="center">
  <strong>Bootstrap your entire startup workspace for $0/month.</strong><br/>
  DNS, email, server, database, VPN, AI assistant, file sharing — all from free tiers.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> •
  <a href="#what-you-get">What You Get</a> •
  <a href="#commands">Commands</a> •
  <a href="#free-tier-stack">Free Tier Stack</a> •
  <a href="#ai-integration">AI Integration</a>
</p>

---

> **If this saved you from paying for Google Workspace, give it a ⭐**
>
> Seriously — star the repo. It helps other broke founders find this.

---

## What You Get

One CLI command sets up a complete workspace that would normally cost $50+/user/month:

| Feature | Paid Alternative | freestack (free) |
|---------|-----------------|------------------|
| Custom domain email | Google Workspace ($7/user/mo) | Cloudflare Email Routing + Resend |
| DNS + CDN + DDoS | Cloudflare Pro ($20/mo) | Cloudflare Free |
| Server (4 CPU, 24GB RAM) | AWS/GCP ($50+/mo) | Oracle Cloud Always Free |
| Database (MySQL/Postgres) | RDS ($15+/mo) | Self-hosted on Oracle VM |
| VPN for team | Tailscale Business ($6/user/mo) | Tailscale Personal (3 users) |
| AI Assistant | ChatGPT Team ($25/user/mo) | OpenClaw + Ollama (self-hosted) |
| File sharing (10GB) | Google Drive ($7/user/mo) | Cloudflare R2 |
| Auth / SSO | Auth0 ($23/mo) | Better Auth (self-hosted) |

**Total: $0/month** for up to 3 team members.

## Quickstart

```bash
# Install
npx freestack

# Or clone and link
git clone https://github.com/nomadlab/freestack.git
cd freestack && npm install && npm run build && npm link

# Run the wizard — installs tools, sets up services, deploys everything
freestack init
```

That's it. The wizard will:

1. **Check your machine** — install missing tools via `brew`
2. **Walk you through each service** — open signup pages, accept API keys, validate them
3. **Provision infrastructure** — create Oracle VM, install MySQL, configure DNS
4. **Deploy your stack** — OpenClaw AI, Tailscale VPN, email routing

## Commands

### Setup
```bash
freestack init              # Interactive setup wizard (does everything)
freestack doctor            # Check & install local tools (brew)
freestack doctor --install  # Auto-install all missing tools
freestack keys set          # Manage API keys interactively
freestack keys list         # Show stored keys
freestack keys export       # Export as .env format
freestack status            # Full dashboard
```

### DNS & Email
```bash
freestack dns setup         # Cloudflare DNS + Email Routing (one command)
freestack dns records       # List DNS records
freestack dns resend-verify # Auto-add Resend DNS records to Cloudflare
freestack mail send         # Send email (interactive or flags)
freestack mail inbox        # View sent emails
freestack mail read <id>    # Read email details
```

### Server & Database
```bash
freestack server list       # Oracle Cloud instances
freestack server info       # Free tier details
freestack team setup        # DB setup (MySQL / PostgreSQL / Neon)
freestack team add          # Add team member
freestack team list         # List members with roles
freestack team role <email> <ADMIN|GROUP|TEAM|ANON>
```

### Calendar & Files
```bash
freestack cal add           # Add event
freestack cal today         # Today's schedule
freestack cal list --week   # This week's events
freestack files setup       # Create R2 bucket
freestack files upload <path>  # Upload to R2 CDN
freestack files list        # List files with access roles
```

### AI Assistant (OpenClaw)
```bash
freestack openclaw deploy   # Deploy to Oracle VM (Docker)
freestack openclaw status   # Check if running
freestack openclaw logs     # View logs
freestack openclaw update   # Pull latest version
freestack openclaw stop     # Stop container
```

### VPN (Tailscale)
```bash
freestack vpn setup         # Install on local + server
freestack vpn status        # Network status
freestack vpn ssh           # SSH via VPN (no public port needed)
freestack vpn expose <port> # Tailscale Funnel (public HTTPS)
```

## Roles & Access Control

Built-in RBAC for team management and file access:

| Role | Level | Access |
|------|-------|--------|
| `ANON` | 0 | Public resources only |
| `TEAM` | 1 | All team resources |
| `GROUP` | 2 | Group-scoped management |
| `ADMIN` | 3 | Full access, user management |

## Free Tier Stack

```
┌─────────────────────────────────────────────┐
│                  Internet                    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│          Cloudflare (FREE)                   │
│  DNS · CDN · Email Routing · R2 · Pages      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│      Oracle Cloud ARM VM (FREE)              │
│  4 OCPU · 24GB RAM · 200GB Storage           │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │  MySQL   │ │ OpenClaw │ │Tailscale │     │
│  │  (DB)    │ │ (AI Bot) │ │  (VPN)   │     │
│  └──────────┘ └──────────┘ └──────────┘     │
└──────────────────┬──────────────────────────┘
                   │ Tailscale Mesh VPN
         ┌─────────┼─────────┐
         │         │         │
      Laptop     Phone    Other VMs
```

### Service Limits

| Service | Free Allocation |
|---------|----------------|
| **Cloudflare** | DNS, CDN, Email Routing, Pages, R2 (10GB), Workers |
| **Resend** | 3,000 emails/month |
| **Oracle Cloud** | ARM 4C/24GB + AMD×2 + 200GB + 10TB bandwidth |
| **OCI Email** | 3,000 emails/month |
| **OCI DB** | 2× Autonomous DB (1 OCPU + 20GB each) |
| **Tailscale** | 3 users, 100 devices |
| **Neon** | 0.5GB serverless Postgres |

## AI Integration

freestack is designed to be operated by AI agents:

```bash
# Output structured JSON manifest for AI consumption
freestack init --manifest

# AI agent can read this and automate the entire setup flow
```

The manifest includes signup URLs, key formats, validation endpoints, and setup instructions — everything an AI needs to bootstrap your workspace autonomously.

## Database Options

```
? DB engine:
  ❯ MySQL       — Install on Oracle VM (fast, simple)
    PostgreSQL  — Install on Oracle VM
    Neon        — Serverless Postgres (neon.tech, 0.5GB free)
```

freestack auto-installs your chosen DB on the Oracle VM and creates the schema.

## Requirements

- **macOS** (Linux support planned)
- **Node.js** ≥ 22
- **Homebrew** (for tool installation)
- A domain name (buy one or use a free one)

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
