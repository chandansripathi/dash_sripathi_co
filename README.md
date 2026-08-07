# Nexus Infrastructure Dashboard

Self-hosted domain and server management with real authentication, PostgreSQL persistence, live agents, Cloudflare DNS viewing, Excel import/export, alerts, and configurable branding.

## Features

- First-run administrator setup and Admin / Operator / Viewer roles
- Secure password hashing, server-side sessions, audit trail, and encrypted API credentials
- Domain and subdomain CRUD, renewal tracking, Excel `.xlsx` / `.xlsm` import, and Excel export
- Multiple named Cloudflare API connections, live read-only DNS records, and subdomain sync
- One-time server enrollment commands and revocable per-server credentials
- CPU, RAM, temperature, all mounted disks, IPv4, WAN IPv4, uptime, Docker services, and Nginx/Apache/Caddy/NPM route discovery
- Email and generic webhook alerts for offline servers and domain renewals
- Light/dark mode plus editable name, colors, fonts, font size, logos, favicon, and login background

## Deploy with Docker Compose

```bash
cp .env.example .env
# Generate strong POSTGRES_PASSWORD and NEXUS_ENCRYPTION_KEY values.
docker compose up -d --build
```

Open port `3100`, or connect the `nexus-dashboard` container to your reverse proxy's external Docker network and proxy to `http://nexus-dashboard:3000`.

On the first visit, `/setup` creates the administrator. PostgreSQL migrations and the initial workbook-derived domain seed run automatically and idempotently.

## Cloudflare token scope

Create one or more API tokens with `Zone:Read` and `DNS:Read` for the required zones. Tokens are encrypted with `NEXUS_ENCRYPTION_KEY` and never returned to the browser after saving.

## Alerts

SMTP credentials are read from `.env`. The webhook field accepts services such as Pushcut, Pushover, ntfy, or an automation bridge that can launch an iOS Shortcut.

See [SERVER_AGENT.md](SERVER_AGENT.md) for agent behavior and security notes.
