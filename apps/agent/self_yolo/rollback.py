#!/usr/bin/env python3
import subprocess, sys
from pathlib import Path

def main():
    repo = Path.cwd()
    target = sys.argv[1] if len(sys.argv) > 1 else "HEAD~1"
    print(f"[rollback] resetting {repo} to {target}", flush=True)
    subprocess.run(["git", "reset", "--hard", target], cwd=repo, check=True)
    print("[rollback] done", flush=True)

if __name__ == "__main__":
    main()
