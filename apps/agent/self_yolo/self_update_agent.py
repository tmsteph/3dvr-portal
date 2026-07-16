#!/usr/bin/env python3
import subprocess
from pathlib import Path

REPO = Path.home() / "3dvr-agent"

def run(cmd):
    return subprocess.run(cmd, cwd=REPO, text=True, capture_output=True)

def main():
    print("[self-update-agent] syncing repo...", flush=True)
    run(["git", "add", "."])
    run(["git", "commit", "-m", "self-update-agent"],)
    print("[self-update-agent] pushing...", flush=True)
    push = run(["git", "push"])
    print(push.stdout or push.stderr, end="")
    print("[self-update-agent] reinstalling package...", flush=True)
    reinstall = subprocess.run(
        ["pip", "install", "--break-system-packages", "-e", str(REPO)],
        text=True,
        capture_output=True,
    )
    print(reinstall.stdout or reinstall.stderr, end="")
    print("[self-update-agent] done.", flush=True)

if __name__ == "__main__":
    main()
