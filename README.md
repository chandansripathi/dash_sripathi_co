# Nexus Infrastructure Dashboard

Nexus is a self-hosted dashboard for domain renewals and live Linux server telemetry. It includes the domain portfolio imported from `Master_Domains_04-08-2026.xlsm`, a responsive web UI, persistent server metrics, and a dependency-free monitoring agent.

## Features

- Domain expiry, registrar, DNS, hosting, renewal cost, search, and alerts
- Live CPU, RAM, temperature, uptime, load, IP, OS, and server status
- Token-authenticated telemetry endpoint
- Persistent JSON storage mounted at `/data`
- Docker Compose stack suitable for Portainer
- Automatic Asgard host monitoring through the included agent container

## Deploy

```bash
cp .env.example .env
openssl rand -hex 32
# Put the generated value in .env as NEXUS_AGENT_TOKEN
docker compose up -d --build
```

The dashboard listens on host port `3100`. Point Nginx Proxy Manager at `169.58.96.10:3100` for `dash.sripathi.co`.

## Development

```bash
npm ci
npm run dev
npm run build
```

Never commit `.env`, server passwords, telemetry tokens, or the source Excel workbook.
