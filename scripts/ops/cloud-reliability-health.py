#!/usr/bin/env python3
"""Read-only host checks for process stalls, restart loops, and owned-runner liveness."""
import json
import urllib.request
import os
import subprocess
import time
from pathlib import Path


def check_host():
    problems = []
    hostname = os.uname().nodename
    units = ["caddy.service"]
    if hostname == "vps-2b6a0420":
        units += ["3dvr-portal.service", "3dvr-secrets-broker.service", "openbao.service"]
        peers = ["3dvr-hetzner", "3dvr-do"]
    elif hostname == "hetzner-openclaw":
        units += ["3dvr-open-runner.service", "3dvr-personal-mcp.service",
                  "3dvr-portal-standby.service", "3dvr-portal-do-standby-tunnel.service"]
        # Hetzner's standby is loopback-only and does not require Caddy.
        units.remove("caddy.service")
        peers = ["3dvr-ovh", "3dvr-do"]
    else:
        units += ["3dvr-open-runner.service", "3dvr-portal.service"]
        peers = ["3dvr-ovh", "3dvr-hetzner"]
    endpoints = {
        "vps-2b6a0420": [(4320, "operatorApi", "native")],
        "hetzner-openclaw": [(4322, "standby", True)],
        "debian-web": [(4320, "operatorApi", "native"), (14320, "operatorApi", "native"),
                       (14322, "standby", True)],
    }
    for port, field, expected in endpoints.get(hostname, []):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/__3dvr-health", timeout=3) as response:
                payload = json.load(response)
            if payload.get("ok") is not True or payload.get(field) != expected:
                problems.append(f"portal_health_invalid:{port}")
        except (OSError, ValueError):
            problems.append(f"portal_health_failed:{port}")
    for unit in units:
        result = subprocess.run(["systemctl", "show", unit, "-p", "ActiveState", "-p", "NRestarts"],
                                capture_output=True, text=True, timeout=5)
        fields = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
        if fields.get("ActiveState") != "active":
            problems.append(f"service_inactive:{unit}")
        if int(fields.get("NRestarts", 0)) >= 3:
            problems.append(f"restart_loop:{unit}")
    for peer in peers:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=3", peer, "true"],
                                capture_output=True, timeout=5)
        if result.returncode:
            problems.append(f"mesh_unreachable:{peer}")
    if hostname == "hetzner-openclaw":
        try:
            state = json.loads(Path("/root/.config/3dvr-server-bridge/open-runner-heartbeat.json").read_text())
            if state.get("state") == "running":
                stale = time.time() > state.get("deadline", 0)
            else:
                stale = time.time() - state.get("updated_at", 0) > 300
            if stale or state.get("state") == "error":
                problems.append("open_runner_heartbeat_failed")
        except (OSError, ValueError):
            problems.append("open_runner_heartbeat_missing")
    uptime = float(Path("/proc/uptime").read_text().split()[0])
    blocked = 0
    state_path = Path.home() / '.cache/3dvr/cloud-health-blocked.json'
    state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        previous = json.loads(state_path.read_text())
    except (OSError, ValueError):
        previous = {}
    current = {}
    for directory in Path("/proc").iterdir():
        if not directory.name.isdigit():
            continue
        try:
            raw = (directory / "stat").read_text()
            fields = raw[raw.rfind(")") + 2:].split()
            age = uptime - int(fields[19]) / os.sysconf("SC_CLK_TCK")
            if fields[0] == "D":
                identity = directory.name + ":" + fields[19]
                current[identity] = previous.get(identity, time.time())
                if time.time() - current[identity] > 300:
                    blocked += 1
        except (OSError, ValueError, IndexError):
            pass
    state_path.write_text(json.dumps(current))
    if blocked:
        problems.append(f"old_blocked_processes:{blocked}")
    return {"ok": not problems, "hostname": hostname, "problems": problems}


if __name__ == "__main__":
    try:
        result = check_host()
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        result = {"ok": False, "problems": [f"probe_error:{type(error).__name__}"]}
    print(json.dumps(result))
    raise SystemExit(0 if result["ok"] else 1)
