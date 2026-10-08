#!/usr/bin/env python3
"""Open remote command runner for 3DVR-owned machines.

The runner consumes commands from a private GitHub issue queue. Commands are
explicitly targeted to this runner's device id. It can execute locally or relay
the command to an allowlisted SSH-mesh target. GitHub is only a transport; the
execution contract is intentionally small and portable.
"""
from __future__ import annotations

import argparse
import inspect
import tempfile
import signal
import uuid
import shutil
import shlex
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



def terminate_group(proc):
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    time.sleep(0.2)
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def run(argv, *, cwd=None, timeout=120, check=False, input_text=None, output_limit=8_000_000):
    # Spool output to disk, then read a bounded amount into the recovery daemon.
    with tempfile.TemporaryFile() as stdout_file, tempfile.TemporaryFile() as stderr_file:
        proc = subprocess.Popen(argv, cwd=cwd, stdin=subprocess.PIPE if input_text is not None else None,
                                stdout=stdout_file, stderr=stderr_file, text=True,
                                start_new_session=True, env=os.environ.copy())
        try:
            proc.communicate(input=input_text, timeout=timeout)
        finally:
            terminate_group(proc)
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass
        streams = []
        for stream in (stdout_file, stderr_file):
            stream.seek(0)
            data = stream.read(output_limit + 1)
            streams.append(data[:output_limit].decode("utf-8", errors="replace")
                           + ("\n[output truncated]" if len(data) > output_limit else ""))
    result = subprocess.CompletedProcess(argv, proc.returncode, streams[0], streams[1])
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or f'command failed: {argv!r}')
    return result


def job_profile(role, task):
    recovery = task.get('priority') == 'recovery'
    defaults = {'ovh': (2048, 512, 2048), 'hetzner': (768, 512, 1024),
                'digitalocean': (128, 64, 128)}
    reserve, default, maximum = defaults.get(role, (256, 128, 512))
    memory = int(task.get('memory_mib', 128 if recovery else default))
    if memory < 32 or memory > (128 if recovery else maximum):
        raise ValueError('memory_mib is outside the safe budget for this target')
    return {'role': role, 'recovery': recovery, 'reserve_mib': reserve,
            'memory_mib': memory, 'cpu_percent': 50 if recovery else (50 if role == 'digitalocean' else 100)}


def admission_reason(profile, available_mib=None, memory_pressure=None):
    if profile['recovery']:
        return ''
    if available_mib is None:
        rows = {}
        for line in Path('/proc/meminfo').read_text().splitlines():
            parts = line.split()
            rows[parts[0].rstrip(':')] = int(parts[1])
        available_mib = rows['MemAvailable'] // 1024
    required = profile['reserve_mib'] + profile['memory_mib']
    if available_mib < required:
        return f"memory headroom: available={available_mib}MiB required={required}MiB"
    if memory_pressure is None:
        path = Path('/proc/pressure/memory')
        memory_pressure = 0.0
        if path.exists():
            for line in path.read_text().splitlines():
                if line.startswith('full '):
                    memory_pressure = float(dict(x.split('=') for x in line.split()[1:])['avg10'])
    if memory_pressure > 20:
        return f"memory stalls: full avg10={memory_pressure}%"
    return ''


def execute_job(command, *, profile, timeout, cwd=None, use_systemd=None):
    reason = admission_reason(profile)
    if reason:
        return subprocess.CompletedProcess([], 75, '', 'DEFERRED: ' + reason)
    argv = [shutil.which('bash') or '/bin/bash', '-lc', command]
    if use_systemd is None:
        use_systemd = profile['role'] in {'ovh', 'hetzner', 'digitalocean'}
    manager = ['--user'] if os.geteuid() != 0 else []
    unit = '3dvr-job-' + uuid.uuid4().hex
    if use_systemd:
        if not Path('/run/systemd/system').exists() or not shutil.which('systemd-run'):
            raise RuntimeError('Job isolation unavailable; refusing unbounded cloud execution')
        if manager:
            os.environ.setdefault('XDG_RUNTIME_DIR', f'/run/user/{os.geteuid()}')
            os.environ.setdefault('DBUS_SESSION_BUS_ADDRESS', f"unix:path={os.environ['XDG_RUNTIME_DIR']}/bus")
        argv = ['systemd-run', *manager, '--scope', '--quiet', '--unit=' + unit,
                '--slice=3dvr-jobs.slice', '-p', f'RuntimeMaxSec={timeout}',
                '-p', 'KillMode=control-group', '-p', f"MemoryMax={profile['memory_mib']}M",
                '-p', 'MemorySwapMax=128M', '-p', f"CPUQuota={profile['cpu_percent']}%",
                '-p', 'CPUWeight=25', '-p', 'IOWeight=25', '-p', 'TasksMax=256', '--', *argv]
    try:
        return run(argv, cwd=cwd, timeout=timeout, output_limit=45000)
    finally:
        if use_systemd:
            # Cgroup cleanup also catches children that deliberately detached from the process group.
            run(['systemctl', *manager, 'stop', unit + '.scope'], timeout=8)


def remote_program():
    imports = 'from __future__ import annotations\nimport os,sys,json,subprocess,time,signal,uuid,shutil,tempfile\nfrom pathlib import Path\n'
    functions = '\n'.join(inspect.getsource(fn) for fn in
                          (terminate_group, run, admission_reason, execute_job))
    main = """
payload = json.load(sys.stdin)
if payload.get('probe'):
    print(json.dumps({'reason': admission_reason(payload['profile'])}))
else:
    try:
        p = execute_job(payload['command'], profile=payload['profile'], timeout=payload['timeout'])
        sys.stdout.write(p.stdout)
        sys.stderr.write(p.stderr)
        sys.exit(p.returncode)
    except subprocess.TimeoutExpired:
        print('Remote job deadline exceeded; process group and cgroup cleaned up.', file=sys.stderr)
        sys.exit(124)
"""
    return imports + functions + main


def heartbeat(config, **status):
    path = config.get('_heartbeat_path')
    if not path:
        return
    payload = {'updated_at': time.time(), 'device': config['device_id'], **status}
    destination = Path(path)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload))
    temporary.replace(destination)


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


def already_claimed(queue: str, number: int, device: str) -> bool:
    marker = f'<!-- 3dvr-open-runner-claim:{device} -->'
    proc = run([
        'gh', 'issue', 'view', str(number), '--repo', queue,
        '--json', 'comments', '--jq', '.comments[].body',
    ], timeout=60)
    deferred = f'<!-- 3dvr-open-runner-deferred:{device} -->'
    return proc.returncode == 0 and proc.stdout.rfind(marker) > proc.stdout.rfind(deferred)


def result_body(
    device: str,
    number: int,
    action: str,
    target: str,
    command: str,
    proc: subprocess.CompletedProcess[str],
    elapsed: float,
) -> str:
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
    target_line = f'- Target: `{target}`\n' if target else ''
    return (
        f'## 3DVR Open Runner — {status}\n\n'
        f'- Device: `{device}`\n'
        f'{target_line}'
        f'- Action: `{action}`\n'
        f'- Issue: `#{number}`\n'
        f'- Exit: `{proc.returncode}`\n'
        f'- Elapsed: `{elapsed:.2f}s`\n'
        f'- Finished: `{now()}`\n\n'
        f'```text\n$ {command}\n\n{output}\n```'
    )


def close_with_error(queue: str, number: int, message: str) -> None:
    gh(['issue', 'comment', str(number), '--repo', queue, '--body', f'## 3DVR Open Runner — error\n\n{message}'])
    gh(['issue', 'close', str(number), '--repo', queue, '--reason', 'completed'])


def process(config: dict[str, Any], issue: dict[str, Any]) -> None:
    device = str(config['device_id'])
    queue = str(config['queue_repo'])
    task = parse(str(issue.get('body') or ''))
    if not task:
        return

    action = str(task.get('action') or '')
    if action not in {'shell', 'mesh-shell'}:
        return

    # Multi-runner fleets must target exactly one ingress runner. Broadcast
    # execution is intentionally unsupported because it can duplicate writes.
    if str(task.get('device') or '') != device:
        return

    author = ((issue.get('author') or {}).get('login') or '')
    allowed = set(str(x) for x in config.get('allowed_authors', []))
    if allowed and author not in allowed:
        return

    number = int(issue['number'])
    if already_claimed(queue, number, device):
        return

    command = str(task.get('command') or '').strip()
    if not command:
        close_with_error(queue, number, 'Missing `command`.')
        return

    try:
        timeout = max(1, min(int(task.get('timeout', 1200)), int(config.get('max_job_seconds', 1800))))
        role = str(task.get('target') or device) if action == 'mesh-shell' else device
        profile = job_profile(role, task)
    except (ValueError, TypeError) as exc:
        close_with_error(queue, number, str(exc))
        return
    cwd = task.get('cwd')
    target = ''

    if action == 'shell':
        if cwd is not None:
            cwd = os.path.abspath(os.path.expanduser(str(cwd)))
            if not os.path.isdir(cwd):
                close_with_error(queue, number, f'cwd does not exist: `{cwd}`')
                return
        argv = ['/bin/bash', '-lc', command]
        stdin = None
    else:
        target = str(task.get('target') or '')
        alias = (config.get('ssh_targets') or {}).get(target)
        if not alias:
            close_with_error(queue, number, f'Unknown or disallowed mesh target: `{target}`')
            return
        if cwd is not None:
            close_with_error(queue, number, '`cwd` is not supported for `mesh-shell`; include `cd` in the command.')
            return
        argv = [
            'ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
            '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
            str(alias), 'bash', '-s',
        ]
        stdin = command + '\n'

    if action == 'shell':
        reason = admission_reason(profile)
    else:
        remote_argv = argv[:-2] + ['python3', '-c', shlex.quote(remote_program())]
        probe = run(remote_argv, timeout=15, input_text=json.dumps({'profile': profile, 'probe': True}))
        if probe.returncode:
            close_with_error(queue, number, 'Remote capacity probe failed; no job was started.')
            return
        reason = json.loads(probe.stdout)['reason']
    if reason:
        deferred = config.setdefault('_deferred', {})
        if time.monotonic() - deferred.get(number, -9999) > 300:
            print(f'deferred issue={number}: {reason}', flush=True)
            deferred[number] = time.monotonic()
        return

    gh([
        'issue', 'comment', str(number), '--repo', queue, '--body',
        f'<!-- 3dvr-open-runner-claim:{device} -->\nClaimed by `{device}` at `{now()}`.',
    ])

    started = time.monotonic()
    heartbeat(config, state='running', issue=number, deadline=time.time() + timeout + 20)
    try:
        if action == 'shell':
            proc = execute_job(command, profile=profile, cwd=cwd, timeout=timeout)
        else:
            proc = run(remote_argv, timeout=timeout + 15, input_text=json.dumps({
                'command': command, 'profile': profile, 'timeout': timeout}))
        if proc.returncode == 75 and proc.stderr.startswith('DEFERRED:'):
            heartbeat(config, state='idle')
            gh(['issue', 'comment', str(number), '--repo', queue, '--body',
                f'<!-- 3dvr-open-runner-deferred:{device} -->\nQueued again before execution: {proc.stderr}'])
            return
        body = result_body(device, number, action, target, command, proc, time.monotonic() - started)
    except subprocess.TimeoutExpired:
        body = (
            '## 3DVR Open Runner — error\n\n'
            f'Command timed out after `{timeout}s`.\n\n```text\n$ {command}\n```'
        )
    except Exception as exc:
        body = f'## 3DVR Open Runner — error\n\n`{type(exc).__name__}: {exc}`'

    heartbeat(config, state='idle')
    gh(['issue', 'comment', str(number), '--repo', queue, '--body', body])
    gh(['issue', 'close', str(number), '--repo', queue, '--reason', 'completed'])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding='utf-8'))
    config['_heartbeat_path'] = str(args.config.with_name('open-runner-heartbeat.json'))
    run(['gh', 'auth', 'status'], timeout=30, check=True)
    interval = max(15, int(config.get('poll_interval_seconds', 20)))
    print(
        f"3DVR Open Runner started: repo={config['queue_repo']} device={config['device_id']}",
        flush=True,
    )
    while True:
        heartbeat(config, state='polling')
        poll_ok = True
        try:
            issues = gh_json([
                'issue', 'list', '--repo', str(config['queue_repo']), '--state', 'open',
                '--limit', '50', '--json', 'number,body,author',
            ])
            for issue in sorted(issues if isinstance(issues, list) else [], key=lambda x: int(x['number'])):
                process(config, issue)
        except Exception as exc:
            poll_ok = False
            print(f'poll error: {type(exc).__name__}: {exc}', file=sys.stderr, flush=True)
        heartbeat(config, state='idle' if poll_ok else 'error')
        if args.once:
            break
        time.sleep(interval)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
