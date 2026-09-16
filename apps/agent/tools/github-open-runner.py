#!/usr/bin/env python3
"""Open shell runner for the user's own Debian servers.

This intentionally executes arbitrary shell commands, but only from the
configured private GitHub issue queue, only for the configured device, and only
when the issue author is explicitly allowlisted. Every command and result stays
in the GitHub issue audit trail.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MAX_OUTPUT = 45000


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def run(argv: list[str], *, cwd: str | None = None, timeout: int = 120, check: bool = False) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        argv,
        cwd=cwd,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
        env=os.environ.copy(),
    )
    if check and proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout or f'command failed: {argv!r}')
    return proc


def gh_json(args: list[str]) -> Any:
    proc = run(['gh', *args], timeout=60, check=True)
    return json.loads(proc.stdout or 'null')


def gh(args: list[str]) -> None:
    run(['gh', *args], timeout=60, check=True)


def parse(body: str) -> dict[str, Any] | None:
    try:
        task = json.loads(body.strip())
    except Exception:
        return None
    return task if isinstance(task, dict) else None


def format_result(device: str, number: int, command: str, proc: subprocess.CompletedProcess[str], elapsed: float) -> str:
    output = ''
    if proc.stdout.strip():
        output += proc.stdout.rstrip()
    if proc.stderr.strip():
        if output:
            output += '\n\n'
        output += '[stderr]\n' + proc.stderr.rstrip()
    if not output:
        output = '(no output)'
    if len(output) > MAX_OUTPUT:
        output = output[:MAX_OUTPUT] + '\n[output truncated]'
    output = output.replace('```', '` ` `')
    status = 'success' if proc.returncode == 0 else 'error'
    return (
        f'## 3DVR Open Runner — {status}\n\n'
        f'- Device: `{device}`\n'
        f'- Issue: `#{number}`\n'
        f'- Exit: `{proc.returncode}`\n'
        f'- Elapsed: `{elapsed:.2f}s`\n'
        f'- Finished: `{now()}`\n\n'
        f'```text\n$ {command}\n\n{output}\n```'
    )


def process(config: dict[str, Any], issue: dict[str, Any]) -> None:
    device = str(config['device_id'])
    queue = str(config['queue_repo'])
    task = parse(str(issue.get('body') or ''))
    if not task or task.get('action') != 'shell':
        return
    if str(task.get('device', '')) not in {device, 'any'}:
        return
    author = ((issue.get('author') or {}).get('login') or '')
    allowed = set(str(x) for x in config.get('allowed_authors', []))
    if allowed and author not in allowed:
        return
    number = int(issue['number'])
    command = str(task.get('command') or '')
    if not command:
        return
    timeout = max(1, min(int(task.get('timeout', 1200)), 7200))
    cwd = task.get('cwd')
    if cwd is not None:
        cwd = os.path.abspath(os.path.expanduser(str(cwd)))
        if not os.path.isdir(cwd):
            gh(['issue', 'comment', str(number), '--repo', queue, '--body', f'3DVR Open Runner error: cwd does not exist: `{cwd}`'])
            gh(['issue', 'close', str(number), '--repo', queue, '--reason', 'completed'])
            return
    gh(['issue', 'comment', str(number), '--repo', queue, '--body', f'<!-- 3dvr-open-runner-claim:{device} -->\nClaimed by `{device}` at `{now()}`.'])
    started = time.monotonic()
    try:
        proc = run(['/bin/bash', '-lc', command], cwd=cwd, timeout=timeout)
        body = format_result(device, number, command, proc, time.monotonic() - started)
    except subprocess.TimeoutExpired:
        body = f'## 3DVR Open Runner — error\n\nCommand timed out after `{timeout}s`.\n\n```text\n$ {command}\n```'
    except Exception as exc:
        body = f'## 3DVR Open Runner — error\n\n`{type(exc).__name__}: {exc}`'
    gh(['issue', 'comment', str(number), '--repo', queue, '--body', body])
    gh(['issue', 'close', str(number), '--repo', queue, '--reason', 'completed'])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding='utf-8'))
    run(['gh', 'auth', 'status'], timeout=30, check=True)
    interval = max(15, int(config.get('poll_interval_seconds', 20)))
    print(f"3DVR Open Runner started: repo={config['queue_repo']} device={config['device_id']}", flush=True)
    while True:
        try:
            issues = gh_json(['issue', 'list', '--repo', str(config['queue_repo']), '--state', 'open', '--limit', '50', '--json', 'number,body,author'])
            for issue in sorted(issues if isinstance(issues, list) else [], key=lambda x: int(x['number'])):
                process(config, issue)
        except Exception as exc:
            print(f'poll error: {type(exc).__name__}: {exc}', file=sys.stderr, flush=True)
        if args.once:
            break
        time.sleep(interval)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
