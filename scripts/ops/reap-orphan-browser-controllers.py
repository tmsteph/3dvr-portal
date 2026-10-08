#!/usr/bin/env python3
"""Reap only day-old orphan browser controllers in Desktop Commander's cgroup."""
import argparse
import os
import signal
from pathlib import Path


def stale_controller(comm, parent, age, cgroup):
    return (comm == "agent-browser-l" and parent == 1 and age > 86400
            and any(line.split(":", 2)[-1].endswith("/desktop-commander-remote.service")
                    for line in cgroup.splitlines()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Send SIGTERM; otherwise inspect only")
    args = parser.parse_args()
    proc = Path("/proc")
    uptime = float((proc / "uptime").read_text().split()[0])
    ticks = os.sysconf("SC_CLK_TCK")
    count = 0
    for path in proc.iterdir():
        if not path.name.isdigit():
            continue
        try:
            raw = (path / "stat").read_text()
            fields = raw[raw.rfind(")") + 2:].split()
            comm = (path / "comm").read_text().strip()
            cgroup = (path / "cgroup").read_text()
            if not stale_controller(comm, int(fields[1]), uptime - int(fields[19]) / ticks, cgroup):
                continue
            # Re-read identity immediately before signalling to reduce PID reuse risk.
            if (path / "stat").read_text().split(")")[-1].split()[19] != fields[19]:
                continue
            if args.apply:
                os.kill(int(path.name), signal.SIGTERM)
            print(f"stale_controller pid={path.name} applied={args.apply}")
            count += 1
        except (OSError, ValueError, IndexError):
            continue
    print(f"stale_controller_count={count}")


if __name__ == "__main__":
    main()
