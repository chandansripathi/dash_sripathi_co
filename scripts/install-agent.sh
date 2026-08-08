#!/bin/sh
set -eu

URL=""; AGENT_ID=""; TOKEN=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$URL" ] && [ -n "$AGENT_ID" ] && [ -n "$TOKEN" ] || { echo "Missing --url, --agent-id or --token" >&2; exit 2; }

command -v python3 >/dev/null 2>&1 || { apt-get update && apt-get install -y python3 ca-certificates; }
install -d -m 700 /etc/nexus-agent /opt/nexus-agent
curl -fsSL "$URL/api/agent/script" -o /opt/nexus-agent/nexus_agent.py
chmod 755 /opt/nexus-agent/nexus_agent.py
umask 077
printf '{"url":"%s","agentId":"%s","enrollmentToken":"%s","intervalMs":1000}\n' "$URL" "$AGENT_ID" "$TOKEN" > /etc/nexus-agent/config.json
cat > /etc/systemd/system/nexus-agent.service <<'EOF'
[Unit]
Description=Nexus infrastructure monitoring agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /opt/nexus-agent/nexus_agent.py
Restart=always
RestartSec=10
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now nexus-agent
echo "Nexus agent installed and started."
