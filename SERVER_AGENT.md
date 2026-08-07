# Nexus Agent v2

Add a server in Nexus and copy its generated installation command. The one-time enrollment token expires after 24 hours and is exchanged for a unique revocable agent credential.

The dependency-free Python agent reports every 30 seconds:

- CPU, RAM, temperature when exposed by the host, load, and uptime
- Local and WAN IPv4 addresses
- Every real mounted disk with used, free, total, and percentage values
- Docker containers and published ports
- Nginx, Apache, Caddy, and Nginx Proxy Manager routes when readable

It installs as `nexus-agent.service`, stores its `0600` configuration at `/etc/nexus-agent/config.json`, and runs with no inbound listener. The dashboard can rotate enrollment and agent credentials at any time.

Some routes are only discoverable when the service runs as root and configuration files are locally readable. Cloudflare can supply DNS records, but filesystem paths and local proxy targets must come from the agent or manual edits.
