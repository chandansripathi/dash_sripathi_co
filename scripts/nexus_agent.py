#!/usr/bin/env python3
"""Tiny Linux monitoring agent for Nexus, using only the standard library."""

import json
import os
import platform
import socket
import time
import urllib.error
import urllib.request

PROC_ROOT = os.environ.get("NEXUS_PROC_ROOT", "/proc")
SYS_ROOT = os.environ.get("NEXUS_SYS_ROOT", "/sys")


def proc_file(name):
    return os.path.join(PROC_ROOT, name)


def cpu_percent():
    def sample():
        with open(proc_file("stat"), "r", encoding="utf-8") as handle:
            values = [int(value) for value in handle.readline().split()[1:]]
        return sum(values), values[3] + values[4]
    total_a, idle_a = sample()
    time.sleep(1)
    total_b, idle_b = sample()
    return round(100 * (1 - (idle_b - idle_a) / max(1, total_b - total_a)), 1)


def memory_percent():
    values = {}
    with open(proc_file("meminfo"), "r", encoding="utf-8") as handle:
        for line in handle:
            key, value = line.split(":", 1)
            values[key] = int(value.strip().split()[0])
    return round(100 * (1 - values.get("MemAvailable", 0) / values["MemTotal"]), 1)


def temperature():
    readings = []
    thermal_root = os.path.join(SYS_ROOT, "class", "thermal")
    for root, _, files in os.walk(thermal_root):
        for filename in files:
            if filename == "temp":
                try:
                    with open(os.path.join(root, filename), encoding="utf-8") as handle:
                        value = float(handle.read().strip())
                    readings.append(value / 1000 if value > 1000 else value)
                except (OSError, ValueError):
                    pass
    return round(max(readings), 1) if readings else 0


def payload():
    hostname = socket.gethostname()
    with open(proc_file("uptime"), encoding="utf-8") as handle:
        uptime_seconds = int(float(handle.read().split()[0]))
    with open(proc_file("loadavg"), encoding="utf-8") as handle:
        load1 = float(handle.read().split()[0])
    return {
        "agentId": os.environ.get("NEXUS_AGENT_ID", hostname),
        "name": os.environ.get("NEXUS_SERVER_NAME", hostname),
        "ip": os.environ.get("NEXUS_SERVER_IP", socket.gethostbyname(hostname)),
        "location": os.environ.get("NEXUS_SERVER_LOCATION", "Unknown"),
        "os": os.environ.get("NEXUS_SERVER_OS", f"{platform.system()} {platform.release()}"),
        "cpu": cpu_percent(), "ram": memory_percent(), "temperature": temperature(),
        "uptimeSeconds": uptime_seconds, "load1": load1,
    }


def send():
    endpoint = os.environ["NEXUS_ENDPOINT"].rstrip("/") + "/api/telemetry"
    request = urllib.request.Request(
        endpoint, data=json.dumps(payload()).encode(), method="POST",
        headers={"Authorization": f"Bearer {os.environ['NEXUS_AGENT_TOKEN']}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        print(response.read().decode(), flush=True)


if __name__ == "__main__":
    interval = max(15, int(os.environ.get("NEXUS_INTERVAL", "60")))
    while True:
        try:
            send()
        except (OSError, ValueError, urllib.error.URLError) as error:
            print(f"Nexus agent error: {error}", flush=True)
        time.sleep(interval)
