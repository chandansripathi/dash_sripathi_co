#!/usr/bin/env python3
"""Nexus server agent. Standard library only; Linux and systemd friendly."""

import json, os, re, shutil, socket, sqlite3, subprocess, time, urllib.request
from pathlib import Path

VERSION = "3.0.0"
CONFIG = Path(os.getenv("NEXUS_AGENT_CONFIG", "/etc/nexus-agent/config.json"))

def read_config():
    data = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
    return {
        "url": os.getenv("NEXUS_ENDPOINT", data.get("url", "")).rstrip("/"),
        "agentId": os.getenv("NEXUS_AGENT_ID", data.get("agentId", "")),
        "agentToken": os.getenv("NEXUS_AGENT_TOKEN", data.get("agentToken", "")),
        "enrollmentToken": data.get("enrollmentToken", ""),
        "intervalMs": int(os.getenv("NEXUS_INTERVAL_MS", data.get("intervalMs", int(data.get("interval", 1)) * 1000))),
    }

def request_json(url, payload=None, token=None, timeout=12):
    headers = {"Content-Type": "application/json", "User-Agent": f"NexusAgent/{VERSION}"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=json.dumps(payload).encode() if payload is not None else None, headers=headers, method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode())

def enroll(config):
    if config["agentToken"]: return config
    result = request_json(f'{config["url"]}/api/agent/enroll', {"agentId": config["agentId"], "token": config["enrollmentToken"]})
    saved = {"url": config["url"], "agentId": config["agentId"], "agentToken": result["agentToken"], "intervalMs": config["intervalMs"]}
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps(saved, indent=2))
    os.chmod(CONFIG, 0o600)
    return read_config()

def cpu_percent():
    def sample():
        values = [int(x) for x in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
        return sum(values), values[3] + (values[4] if len(values) > 4 else 0)
    total1, idle1 = sample(); time.sleep(0.2); total2, idle2 = sample()
    return round(100 * (1 - (idle2-idle1) / max(1, total2-total1)), 2)

def memory_percent():
    info = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, value = line.split(":", 1); info[key] = int(value.strip().split()[0])
    return round(100 * (1 - info.get("MemAvailable", 0) / max(1, info["MemTotal"])), 2)

def temperature():
    readings = []
    for item in Path("/sys/class/thermal").glob("thermal_zone*/temp"):
        try:
            value = float(item.read_text().strip()); readings.append(value / 1000 if value > 500 else value)
        except Exception: pass
    return round(max(readings), 1) if readings else None

def disks():
    ignored = {"proc","sysfs","tmpfs","devtmpfs","devpts","overlay","squashfs","cgroup","cgroup2","pstore","securityfs","tracefs","debugfs","fusectl","mqueue"}
    found, output = set(), []
    for line in Path("/proc/mounts").read_text().splitlines():
        parts = line.split()
        if len(parts) < 3 or parts[2] in ignored or not parts[0].startswith("/dev/"): continue
        mount = parts[1].replace("\\040", " ")
        if mount in found: continue
        found.add(mount)
        try:
            usage = shutil.disk_usage(mount)
            output.append({"device": parts[0], "mount": mount, "total": usage.total, "used": usage.used, "free": usage.free, "percent": round(usage.used / max(1, usage.total) * 100, 1)})
        except OSError: pass
    return output

def local_ipv4():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: sock.connect(("1.1.1.1", 80)); return sock.getsockname()[0]
    except OSError: return None
    finally: sock.close()

def wan_ipv4():
    try:
        with urllib.request.urlopen("https://api.ipify.org?format=json", timeout=5) as response: return json.loads(response.read())["ip"]
    except Exception: return None

def command(args, timeout=8):
    try: return subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False).stdout
    except Exception: return ""

def scan_proxies():
    routes = []
    npm_db = Path("/opt/stacks/nginx-proxy-manager/data/database.sqlite")
    if npm_db.exists():
        try:
            db = sqlite3.connect(f"file:{npm_db}?mode=ro", uri=True)
            for names, host, port, scheme in db.execute("select domain_names,forward_host,forward_port,forward_scheme from proxy_host where enabled=1 and is_deleted=0"):
                for name in json.loads(names): routes.append({"source":"nginx-proxy-manager","domain":name,"target":f"{scheme}://{host}:{port}"})
            db.close()
        except Exception: pass
    for conf_dir, source in [("/etc/nginx", "nginx"), ("/etc/apache2", "apache")]:
        root = Path(conf_dir)
        if not root.exists(): continue
        for path in list(root.rglob("*.conf"))[:300]:
            try:
                text = path.read_text(errors="ignore")
                pattern = r"server_name\s+([^;]+)" if source == "nginx" else r"ServerName\s+([^\s#]+)"
                for match in re.findall(pattern, text):
                    for name in match.split(): routes.append({"source":source,"domain":name,"path":str(path)})
            except OSError: pass
    caddy = Path("/etc/caddy/Caddyfile")
    if caddy.exists():
        for match in re.findall(r"(?m)^([\w.*-]+\.[\w.-]+)(?::\d+)?\s*\{", caddy.read_text(errors="ignore")):
            routes.append({"source":"caddy","domain":match,"path":str(caddy)})
    docker_rows = command(["docker", "ps", "--format", "{{json .}}"])
    for line in docker_rows.splitlines():
        try:
            item = json.loads(line); routes.append({"source":"docker","service":item.get("Names"),"target":item.get("Ports"),"image":item.get("Image")})
        except Exception: pass
    unique = {json.dumps(item, sort_keys=True): item for item in routes}
    return list(unique.values())[:500]

def os_name():
    try:
        values = dict(line.split("=",1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
        return values.get("PRETTY_NAME", "Linux").strip('"')
    except Exception: return "Linux"

def payload(config, inventory):
    uptime = float(Path("/proc/uptime").read_text().split()[0])
    load = os.getloadavg()[0] if hasattr(os, "getloadavg") else None
    return {"agentId":config["agentId"],"agentVersion":VERSION,"cpu":cpu_percent(),"ram":memory_percent(),
        "temperature":temperature(),"uptimeSeconds":round(uptime),"load1":load,"disks":disks(),"ipv4":local_ipv4(),
        "wanIpv4":inventory.get("wanIpv4"),"os":os_name(),"network":{},"proxies":inventory.get("proxies", [])}

def main():
    config = enroll(read_config())
    inventory, inventory_at = {}, 0
    while True:
        started = time.monotonic()
        try:
            if time.monotonic() - inventory_at > 60:
                inventory = {"wanIpv4": wan_ipv4(), "proxies": scan_proxies()}
                inventory_at = time.monotonic()
            result = request_json(f'{config["url"]}/api/telemetry', payload(config, inventory), config["agentToken"])
            config["intervalMs"] = max(1000, min(300000, int(result.get("intervalMs", config["intervalMs"]))))
            print(result, flush=True)
        except Exception as error: print(f"Nexus telemetry error: {error}", flush=True)
        elapsed = (time.monotonic() - started) * 1000
        time.sleep(max(0.05, (config["intervalMs"] - elapsed) / 1000))

if __name__ == "__main__": main()
