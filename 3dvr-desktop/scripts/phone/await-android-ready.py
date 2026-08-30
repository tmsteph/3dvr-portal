#!/data/data/com.termux/files/usr/bin/python3
import json
import os
import time
import urllib.error
import urllib.request

PAIRING = os.path.expanduser('~/.config/3dvr-terminal-bridge/companion.json')
TIMEOUT = int(os.environ.get('THREEDVR_UNLOCK_TIMEOUT_SECONDS', '900'))
POLL = 2


def request(base, token, path, method='GET', body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/json'}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=4) as response:
        return json.load(response)


def is_locked(payload):
    snap = payload.get('snapshot') or {}
    if not snap.get('available'):
        return None
    for node in snap.get('nodes') or []:
        values = (node.get('text'), node.get('contentDescription'))
        if any(str(value or '').strip().lower() == 'device locked' for value in values):
            return True
    return False


def main():
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        try:
            spec = json.load(open(PAIRING, encoding='utf-8'))
            base = str(spec['url']).rstrip('/')
            token = str(spec['token'])
            locked = is_locked(request(base, token, '/v1/ui/snapshot'))
            if locked is False:
                result = request(base, token, '/v1/open-app', 'POST', {'alias': 'termux'})
                if result.get('ok'):
                    # Newer Companion builds also expose Termux:X11 as a separate,
                    # allow-listed target. Older builds simply return ok=false here.
                    try:
                        request(base, token, '/v1/open-app', 'POST', {'alias': 'termux_x11'})
                    except urllib.error.URLError:
                        pass
                    print('Android unlocked; Termux handoff completed through 3DVR Companion.')
                    return 0
        except (OSError, KeyError, ValueError, urllib.error.URLError):
            pass
        time.sleep(POLL)
    print('Timed out waiting for Android unlock; continuing without foreground handoff.')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
