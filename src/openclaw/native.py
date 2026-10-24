"""Owner-only Codex chat over the existing SSH bridge; credentials stay on Hetzner."""
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import select
import shutil
import signal
import subprocess
import sys
import time
import tomllib

HOME = Path('/root/.codex')
STATE = HOME / 'helm'
MODEL = 'gpt-6.1-sol'
MAX_LINE = 1024 * 1024
MAX_WIRE = 32 * 1024 * 1024
MAX_REPLY = 120000


def find_binary():
    # Reuse the installed executable, without depending on a generation-specific path.
    for path in Path('/proc').glob('[0-9]*/cmdline'):
        try:
            args = path.read_bytes().split(b'\0')
            if b'app-server' in args and b'codex' in args[0]:
                return os.readlink(path.parent / 'exe')
        except OSError:
            continue
    binary = shutil.which('codex')
    if not binary:
        raise RuntimeError('Codex is not installed')
    return binary


def command(binary):
    # The chat pilot does not inherit unrelated MCP integrations or shell tools.
    args = [binary, 'app-server', '--disable', 'shell_tool', '-c', 'web_search="disabled"']
    config = HOME / 'config.toml'
    data = tomllib.loads(config.read_text()) if config.exists() else {}
    for name in data.get('mcp_servers', {}):
        args.extend(['-c', 'mcp_servers.' + json.dumps(name) + '.enabled=false'])
    return args


class Client:
    def __init__(self, args, cwd, deadline):
        self.deadline = deadline
        self.buffer = b''
        self.received = 0
        self.sequence = 0
        self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, cwd=cwd,
                                        env={**os.environ, 'HOME': '/root', 'CODEX_HOME': str(HOME)},
                                        start_new_session=True)

    def send(self, method, params, request=True):
        self.sequence += 1
        message = {'method': method, 'params': params}
        if request:
            message['id'] = self.sequence
        self.write(message)
        return self.sequence

    def write(self, message):
        self.process.stdin.write(json.dumps(message).encode() + b'\n')
        self.process.stdin.flush()

    def read(self):
        while b'\n' not in self.buffer:
            remaining = self.deadline - time.monotonic()
            if remaining <= 0 or not select.select([self.process.stdout], [], [], remaining)[0]:
                raise TimeoutError('Codex deadline')
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk:
                raise RuntimeError('Codex stream ended')
            self.received += len(chunk)
            self.buffer += chunk
            if self.received > MAX_WIRE or (b'\n' not in self.buffer and len(self.buffer) > MAX_LINE):
                raise ValueError('Codex output limit')
        line, self.buffer = self.buffer.split(b'\n', 1)
        if len(line) > MAX_LINE:
            raise ValueError('Codex frame limit')
        message = json.loads(line)
        if 'method' in message and 'id' in message:
            # No approval, user-input, or dynamic tool request may silently succeed.
            self.write({'id': message['id'], 'error': {'code': -32601, 'message': 'Unavailable in Helm chat pilot'}})
            raise RuntimeError('Unsupported interactive request')
        return message

    def rpc(self, method, params):
        request_id = self.send(method, params)
        while True:
            message = self.read()
            if message.get('id') == request_id:
                if 'error' in message:
                    raise RuntimeError('Codex request failed')
                return message['result']

    def close(self):
        try:
            os.killpg(self.process.pid, signal.SIGTERM)
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(self.process.pid, signal.SIGKILL)
            self.process.wait(timeout=3)
        except ProcessLookupError:
            pass
        finally:
            self.process.stdin.close()
            self.process.stdout.close()


def write_state(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value))
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def expired(request):
    return request.get('expiresAt') is not None and time.time() * 1000 >= request['expiresAt']


def run_turn(client, thread_id, request, on_delta):
    request_id = client.send('turn/start', {'threadId': thread_id,
        'input': [{'type': 'text', 'text': request['message']}], 'model': MODEL,
        'effort': 'medium', 'approvalPolicy': 'never', 'sandboxPolicy': {'type': 'readOnly'}})
    turn_id = None
    parts = {}
    final = {}
    size = 0
    while True:
        event = client.read()
        params = event.get('params', {})
        if event.get('id') == request_id:
            if 'error' in event:
                raise RuntimeError('Turn rejected')
            turn_id = event['result']['turn']['id']
        method = event.get('method')
        if method is None:
            continue
        if params.get('threadId') != thread_id:
            continue
        if method == 'item/agentMessage/delta':
            text = params.get('delta', '')
            if not isinstance(text, str):
                raise ValueError('Invalid delta')
            size += len(text.encode())
            if size > MAX_REPLY:
                raise ValueError('Reply limit')
            parts[params['itemId']] = parts.get(params['itemId'], '') + text
            if text:
                on_delta(text)
        elif method == 'item/started':
            if params.get('item', {}).get('type') in ['commandExecution', 'mcpToolCall', 'dynamicToolCall', 'fileChange']:
                raise RuntimeError('Tools unavailable in chat pilot')
        elif method == 'item/completed':
            item = params.get('item', {})
            if item.get('type') == 'agentMessage' and item.get('phase') in [None, 'final_answer']:
                text = item.get('text', '')
                if not isinstance(text, str) or len(text.encode()) > MAX_REPLY:
                    raise ValueError('Reply limit')
                final[item['id']] = text
        elif method == 'turn/completed':
            turn = params['turn']
            if not turn_id or turn.get('id') != turn_id or turn.get('status') != 'completed':
                raise RuntimeError('Turn did not complete')
            reply = '\n\n'.join(final.values())
            if not reply.strip() or len(reply.encode()) > MAX_REPLY:
                raise ValueError('Empty or oversized final reply')
            return reply


def main(request):
    os.umask(0o077)
    binary = find_binary()
    # Check configuration only; status never consumes a model turn or refreshes auth.
    auth = json.loads((HOME / 'auth.json').read_text())
    if auth.get('auth_mode') != 'chatgpt':
        return {'ok': False, 'error': 'Native Codex needs its existing server-side ChatGPT sign-in.'}
    if request['action'] == 'status':
        return {'ok': True, 'gateway': 'reachable', 'chatEnabled': True, 'engine': 'Codex',
                'host': 'Hetzner', 'profile': 'native-chat', 'model': MODEL}
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / 'chat.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'ok': False, 'error': 'Native Codex is busy. Check History before sending again.'}
        if expired(request):
            return {'ok': False, 'stale': True, 'error': 'Message expired before dispatch.'}
        key = hashlib.sha256(request['session'].encode()).hexdigest()
        state_file = STATE / (key + '.json')
        state = json.loads(state_file.read_text()) if state_file.exists() else {}
        if state.get('pending'):
            return {'ok': False, 'error': 'A prior turn is uncertain. Check History and start a new chat.'}
        workspace = STATE / 'workspace'
        workspace.mkdir(mode=0o700, exist_ok=True)
        client = Client(command(binary), str(workspace), time.monotonic() + 85)
        try:
            client.rpc('initialize', {'clientInfo': {'name': '3dvr_helm', 'version': '0.1.0'}})
            client.send('initialized', {}, False)
            params = {'model': MODEL, 'cwd': str(workspace), 'approvalPolicy': 'never', 'sandbox': 'read-only'}
            if state.get('threadId'):
                params['threadId'] = state['threadId']
                params['excludeTurns'] = True
                result = client.rpc('thread/resume', params)
            else:
                params['developerInstructions'] = ('You are Helm\'s native Codex chat pilot. Provide conversation and code advice. '
                    'Do not use tools or claim to have executed work. This pilot does not provide OpenClaw integrations.')
                result = client.rpc('thread/start', params)
            thread_id = result['thread']['id']
            if expired(request):
                return {'ok': False, 'stale': True, 'error': 'Message expired before dispatch.'}
            # A lost SSH session cannot allow the next request to unknowingly continue a pending turn.
            write_state(state_file, {'threadId': thread_id, 'pending': True})
            def on_delta(text):
                if request.get('stream'):
                    print(json.dumps({'type': 'delta', 'text': text}), flush=True)
            reply = run_turn(client, thread_id, request, on_delta)
            write_state(state_file, {'threadId': thread_id, 'pending': False})
            return {'ok': True, 'reply': reply, 'engine': 'Codex', 'session': request['session']}
        finally:
            client.close()


def interrupted(_signum, _frame):
    raise TimeoutError('Bridge interrupted')


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        raw = sys.argv[1]
        request = json.loads(base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)))
        print(json.dumps(main(request)), flush=True)
    except Exception:
        print(json.dumps({'ok': False, 'error': 'Native Codex did not complete this request. Check History before resending; use New chat after an uncertain turn.'}), flush=True)
