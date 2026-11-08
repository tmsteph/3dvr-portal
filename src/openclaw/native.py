"""Owner-only Codex chat over SSH; credentials stay on their existing host."""
import base64
import fcntl
import hashlib
import json
import os
import re
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
BACKUP_MODEL = 'gpt-5.6-sol'
MAX_LINE = 1024 * 1024
MAX_WIRE = 32 * 1024 * 1024
MAX_REPLY = 120000

# Human-scale activity lines for tool items, forwarded to the client as
# live progress while a turn runs (the handler stores the latest one on
# the turn's receipt as its preview activity). Only item kinds that mean
# "the agent is doing something" get a label; message and reasoning
# items stay silent, and the labels never include tool arguments or
# output, so nothing sensitive rides the progress channel.
ACTIVITY_LABELS = {'commandExecution': 'Running a command', 'fileChange': 'Editing files',
                   'webSearch': 'Searching the web', 'dynamicToolCall': 'Using a tool'}


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
    if binary:
        return binary
    # A stopped OpenClaw gateway must not hide its still-installed Codex package.
    installed = Path('/root/.openclaw-cloud/npm/projects').glob(
        '*/node_modules/@openai/codex-linux-x64/vendor/*/bin/codex')
    candidates = [path for path in installed if path.is_file() and os.access(path, os.X_OK)]
    if candidates:
        return str(max(candidates, key=lambda path: path.stat().st_mtime))
    raise RuntimeError('Codex is not installed')


def tools_enabled(request):
    # Agent posture is the owner engine's default, gated by the Portal's
    # HELM_CODEX_TOOLS flag. The bridge fails closed: tools require the
    # handler's explicit toolsEnabled, and Operator task mode and the backup
    # engine always stay in the original chat posture.
    if request.get('taskMode') is True or request.get('engine') == 'codex-backup':
        return False
    return request.get('toolsEnabled') is True


AGENT_INSTRUCTIONS = ('You are Helm\'s agent, working for its owner tmsteph in his private workspace. '
    'You have shell and file tools inside a dedicated git worktree of the 3dvr-portal repository, and that worktree is your whole world. '
    'Inspect and edit code there and run the relevant tests. For a code change, create a branch, commit with a clear message, push the branch, and open a pull request. '
    'You may merge a pull request yourself only when it is small, self-contained, and its checks pass; otherwise leave it open and say why. '
    'Never commit directly to main, never force-push, and never touch anything outside the worktree. '
    'Report what you actually did, with branch names, commit hashes, and pull request links; if you did not do something, say so plainly. '
    'Out of scope: sending messages or email, purchases or payments, account or credential changes, and anything on other machines.')


def command(binary, task_mode=False, tools=False):
    if tools:
        # Agent posture: the shell tool stays enabled and web search is live.
        args = [binary, 'app-server', '-c', 'web_search="live"']
    else:
        # The chat pilot does not inherit unrelated MCP integrations or shell tools.
        args = [binary, 'app-server', '--disable', 'shell_tool', '-c', 'web_search="live"' if task_mode else 'web_search="disabled"']
    config = HOME / 'config.toml'
    data = tomllib.loads(config.read_text()) if config.exists() else {}
    # MCP servers stay force-disabled in every posture: a Helm session never
    # inherits the config.toml MCP integrations.
    for name in data.get('mcp_servers', {}):
        if not re.fullmatch(r'[A-Za-z0-9_-]+', name):
            raise ValueError('Unsupported MCP configuration name')
        args.extend(['-c', 'mcp_servers.' + name + '.enabled=false'])
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


def run_turn(client, thread_id, request, on_delta, on_activity=None, model=MODEL):
    tools = tools_enabled(request)
    # Approvals stay 'never' in both postures: in agent posture the sandbox is
    # the wall, so workspace-internal commands run without a round-trip and
    # anything the sandbox would escalate fails instead of asking.
    policy = {'type': 'workspaceWrite', 'networkAccess': True} if tools else {'type': 'readOnly'}
    request_id = client.send('turn/start', {'threadId': thread_id,
        'input': [{'type': 'text', 'text': request['message']}], 'model': model,
        'effort': 'medium', 'approvalPolicy': 'never', 'sandboxPolicy': policy})
    turn_id = None
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
            if text:
                on_delta(text)
        elif method == 'item/started':
            kind = params.get('item', {}).get('type')
            # Tool items are expected in agent posture. MCP calls stay refused
            # in every posture, and in chat posture any tool item fails closed.
            if kind == 'mcpToolCall':
                raise RuntimeError('MCP tools are disabled in Helm')
            if not tools and kind in ['commandExecution', 'dynamicToolCall', 'fileChange']:
                raise RuntimeError('Tools unavailable in chat pilot')
            if on_activity and kind in ACTIVITY_LABELS:
                on_activity(ACTIVITY_LABELS[kind])
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
    backup = request.get('engine') == 'codex-backup'
    model = BACKUP_MODEL if backup else MODEL
    if backup:
        available = next(int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines()
                         if line.startswith('MemAvailable:'))
        if available < 256 * 1024:
            return {'ok': False, 'error': 'Backup server needs more free memory. Try again later.'}
    binary = find_binary()
    # Check configuration only; status never consumes a model turn or refreshes auth.
    auth = json.loads((HOME / 'auth.json').read_text())
    if auth.get('auth_mode') != 'chatgpt':
        return {'ok': False, 'error': 'Native Codex needs its existing server-side ChatGPT sign-in.'}
    if request['action'] == 'status':
        return {'ok': True, 'gateway': 'reachable', 'chatEnabled': True, 'engine': 'Codex',
                'host': 'DigitalOcean' if backup else 'Hetzner',
                'profile': 'native-agent' if tools_enabled(request) else 'native-chat', 'model': model}
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
        task_mode = request.get('taskMode') is True
        tools = tools_enabled(request)
        if tools:
            # The agent's whole world is a dedicated clean clone of the portal
            # repo (see helm/README.md for the deployment step). Its own .git
            # lives inside it, so sandbox writes never reach the server's
            # working checkout or the production release.
            worktree = STATE / 'portal-worktree'
            if not (worktree / '.git').exists():
                return {'ok': False, 'error': 'Helm agent worktree is not set up on this server. See the deployment step in helm/README.md.'}
            workspace = worktree
        client = Client(command(binary, task_mode, tools), str(workspace), time.monotonic() + (280 if tools else 85))
        try:
            client.rpc('initialize', {'clientInfo': {'name': '3dvr_helm', 'version': '0.1.0'}})
            client.send('initialized', {}, False)
            params = {'model': model, 'cwd': str(workspace), 'approvalPolicy': 'never',
                      'sandbox': 'workspace-write' if tools else 'read-only'}
            # A thread keeps the posture it was created in. Flipping the tools
            # flag starts a fresh conversation instead of resuming across postures.
            if state.get('threadId') and state.get('tools', False) == tools:
                params['threadId'] = state['threadId']
                params['excludeTurns'] = True
                result = client.rpc('thread/resume', params)
            else:
                params['developerInstructions'] = ('You are Helm\'s native Codex chat pilot. Provide conversation and code advice. '
                    'Do not use tools or claim to have executed work. This pilot does not provide OpenClaw integrations.')
                if task_mode:
                    params['developerInstructions'] = ('You execute private 3DVR Operator research and drafting tasks. '
                        'Use web search when current evidence is needed and return sources. '
                        'Shell, MCP, file changes, messaging, purchases and deployment are unavailable. '
                        'Return the completed result; state any unavailable capability honestly.')
                if tools:
                    params['developerInstructions'] = AGENT_INSTRUCTIONS
                result = client.rpc('thread/start', params)
            thread_id = result['thread']['id']
            if expired(request):
                return {'ok': False, 'stale': True, 'error': 'Message expired before dispatch.'}
            # A lost SSH session cannot allow the next request to unknowingly continue a pending turn.
            write_state(state_file, {'threadId': thread_id, 'pending': True, 'tools': tools})
            def on_delta(text):
                if request.get('stream'):
                    print(json.dumps({'type': 'delta', 'text': text}), flush=True)
            def on_activity(text):
                if request.get('stream'):
                    print(json.dumps({'type': 'activity', 'text': text}), flush=True)
            reply = run_turn(client, thread_id, request, on_delta, on_activity, model)
            write_state(state_file, {'threadId': thread_id, 'pending': False, 'tools': tools})
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
