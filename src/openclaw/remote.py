"""Fixed owner bridge, invoked over SSH; never returns gateway credentials."""
import base64
import fcntl
import json
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request


def read_stream(response, on_delta):
    parts = []
    received = 0
    content_bytes = 0
    done = False
    while True:
        line = response.readline(1024 * 1024 + 1)
        if not line:
            break
        received += len(line)
        if len(line) > 1024 * 1024 or received > 32 * 1024 * 1024:
            raise ValueError('response limit')
        if not line.startswith(b'data:'):
            continue
        raw = line[5:].strip()
        if raw == b'[DONE]':
            done = True
            break
        event = json.loads(raw)
        if event.get('error'):
            raise ValueError('upstream error')
        for choice in event.get('choices', []):
            text = choice.get('delta', {}).get('content', '')
            if isinstance(text, str) and text:
                content_bytes += len(text.encode('utf-8'))
                if content_bytes > 120000:
                    raise ValueError('reply limit')
                parts.append(text)
                on_delta(text)
    if not done:
        raise ValueError('incomplete stream')
    return ''.join(parts)


def main():
    raw = sys.argv[1]
    request = json.loads(base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)))
    config = json.loads(Path('/root/.openclaw-cloud/openclaw.json').read_text())
    gateway = config.get('gateway', {})
    port = int(gateway.get('port', 18789))
    base = 'http://127.0.0.1:' + str(port)
    enabled = gateway.get('http', {}).get('endpoints', {}).get('chatCompletions', {}).get('enabled', False)
    if request['action'] == 'status':
        with urllib.request.urlopen(base + '/', timeout=6) as response:
            reachable = response.status == 200
        return {'ok': reachable, 'gateway': 'reachable' if reachable else 'unavailable',
                'chatEnabled': bool(enabled), 'host': 'Hetzner', 'profile': 'cloud'}
    if not enabled:
        return {'ok': False, 'error': 'OpenClaw HTTP chat is not enabled yet.'}
    lock = open('/root/.openclaw-cloud/helm-chat.lock', 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return {'ok': False, 'error': 'OpenClaw is handling another Helm message. Wait before sending.'}
    if request.get('expiresAt') is not None and time.time() * 1000 >= request['expiresAt']:
        return {'ok': False, 'stale': True, 'error': 'Message expired before dispatch. Kept in history.'}
    token = gateway.get('auth', {}).get('token', '')
    if not isinstance(token, str) or not token:
        return {'ok': False, 'error': 'Gateway authentication needs server-side setup.'}
    body = json.dumps({'model': 'openclaw:main', 'user': request['session'], 'stream': bool(request.get('stream')),
                       'messages': [{'role': 'user', 'content': request['message']}]}).encode()
    headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token}
    req = urllib.request.Request(base + '/v1/chat/completions', data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=85) as response:
        if request.get('stream'):
            reply = read_stream(response, lambda text: print(
                json.dumps({'type': 'delta', 'text': text}), flush=True))
        else:
            data = json.loads(response.read(128000))
            reply = data['choices'][0]['message']['content']
    if not isinstance(reply, str) or not reply.strip():
        return {'ok': False, 'error': 'OpenClaw returned an empty response. Check its session before resending.'}
    return {'ok': True, 'reply': reply, 'engine': 'OpenClaw', 'session': request['session']}


if __name__ == '__main__':
    try:
        print(json.dumps(main()), flush=True)
    except Exception:
        print(json.dumps({'ok': False, 'error': 'OpenClaw did not complete this request. Check its session before resending.'}), flush=True)
