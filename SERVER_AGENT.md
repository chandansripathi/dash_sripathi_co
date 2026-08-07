# Nexus server agent

The included Python agent reports CPU, RAM, temperature, uptime, load, IP, and OS using only the Linux standard library. The provided Docker Compose stack runs it automatically for the Asgard host.

1. Copy `scripts/nexus_agent.py` to the server.
2. Set `NEXUS_ENDPOINT`, `NEXUS_AGENT_TOKEN`, `NEXUS_AGENT_ID`, `NEXUS_SERVER_NAME`, `NEXUS_SERVER_IP`, and optionally `NEXUS_SERVER_LOCATION`.
3. Run the script as a long-running service. It reports every minute by default.

Example service command:

```bash
NEXUS_ENDPOINT=https://dash.sripathi.co NEXUS_AGENT_TOKEN=change-me NEXUS_AGENT_ID=web-01 NEXUS_SERVER_NAME="Web 01" NEXUS_SERVER_IP=203.0.113.10 /usr/bin/python3 /opt/nexus_agent.py
```

Keep the agent token outside the script and never commit it to source control.
