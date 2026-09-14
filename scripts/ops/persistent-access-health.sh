#!/usr/bin/env bash
set -euo pipefail

host="${THREEDVR_CONTROL_HOST:-3dvr-ovh}"
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=8)

printf '3DVR persistent access health\n'
printf 'control_host=%s\n' "$host"

if ! ssh "${ssh_opts[@]}" "$host" 'true' >/dev/null 2>&1; then
  echo 'control_node=unreachable'
  exit 2
fi
echo 'control_node=reachable'

ssh "${ssh_opts[@]}" "$host" 'bash -s' <<'REMOTE'
set -u
check_cdp() {
  local lane="$1" port="$2"
  if curl -fsS --max-time 2 "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1; then
    printf 'browser_lane.%s=reachable\n' "$lane"
  else
    printf 'browser_lane.%s=down\n' "$lane"
  fi
}

check_cdp general 9222
check_cdp encore 9333
check_cdp messaging 9444
check_cdp training 9555

if tabs="$(curl -fsS --max-time 3 http://127.0.0.1:9222/json/list 2>/dev/null)"; then
  TABS_JSON="$tabs" python3 - <<'PY'
import json, os
pages=json.loads(os.environ.get('TABS_JSON','[]'))
def status(name, predicate, login_predicate=None):
    matches=[p for p in pages if predicate((p.get('url') or '').lower(), (p.get('title') or '').lower())]
    if not matches:
        print(f'tab.{name}=not_open')
        return
    if login_predicate and any(login_predicate((p.get('url') or '').lower(), (p.get('title') or '').lower()) for p in matches):
        print(f'tab.{name}=login_required')
    else:
        print(f'tab.{name}=present_verify_auth')
status('ukg', lambda u,t: 'ultipro.com' in u and 'ultiprotime.com' not in u,
       lambda u,t: 'login' in u or 'login' in t or 'sign in' in t)
status('lighthouse', lambda u,t: 'lighthouse2.psav.com' in u,
       lambda u,t: '/login' in u or 'login' in t or 'sign in' in t)
status('messages', lambda u,t: 'messages.google.com' in u,
       lambda u,t: 'pair' in u or 'pair' in t)
status('portal_calendar', lambda u,t: 'portal.3dvr.tech/calendar' in u)
print('tab.time_clock=' + ('present_do_not_use_for_timeoff' if any('ultiprotime.com' in (p.get('url') or '').lower() for p in pages) else 'not_open'))
PY
fi

if curl -fsS --max-time 2 --unix-socket /run/3dvr-secrets-broker/broker.sock http://localhost/health >/dev/null 2>&1; then
  echo 'secrets_broker=healthy'
else
  echo 'secrets_broker=unhealthy'
fi
REMOTE
