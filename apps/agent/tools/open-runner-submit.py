#!/usr/bin/env python3
"""Submit a command to the 3DVR Open Runner queue without hand-writing JSON."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

DEFAULT_QUEUE = 'tmsteph/3dvr-terminal-bridge'
MESH_TARGETS = {'ovh', 'digitalocean', 'termux-phone', 'laptop'}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('target', choices=['hetzner', *sorted(MESH_TARGETS)])
    parser.add_argument('command', nargs=argparse.REMAINDER)
    parser.add_argument('--queue', default=DEFAULT_QUEUE)
    parser.add_argument('--timeout', type=int, default=1200)
    args = parser.parse_args()

    command = ' '.join(args.command).strip()
    if command.startswith('-- '):
        command = command[3:]
    if not command:
        parser.error('a command is required')

    task = {
        'action': 'shell' if args.target == 'hetzner' else 'mesh-shell',
        'device': 'hetzner',
        'command': command,
        'timeout': max(1, min(args.timeout, 7200)),
    }
    if args.target != 'hetzner':
        task['target'] = args.target

    title = f'Open Runner: {args.target}: {command[:70]}'
    proc = subprocess.run([
        'gh', 'issue', 'create', '--repo', args.queue,
        '--title', title, '--body', json.dumps(task, separators=(',', ':')),
    ], text=True)
    return proc.returncode


if __name__ == '__main__':
    raise SystemExit(main())
