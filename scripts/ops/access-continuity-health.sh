#!/usr/bin/env bash
set -euo pipefail

failures=0
warn() { printf 'WARN %s\n' "$*"; failures=$((failures + 1)); }
ok() { printf 'OK   %s\n' "$*"; }

check_port() {
  local name="$1" port="$2"
  if curl -fsS --max-time 2 "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1; then
    ok "$name CDP :$port"
  else
    warn "$name CDP :$port unavailable"
  fi
}

check_service() {
  local name="$1"
  if systemctl is-active --quiet "$name"; then ok "$name active"; else warn "$name inactive"; fi
}

check_port general 9222
check_port encore 9333
check_port messaging 9444
check_port training 9555
check_service 3dvr-cdp-bridge.service
check_service 3dvr-secrets-broker.service

if command -v /usr/local/bin/3dvr-browser-lease >/dev/null 2>&1; then
  if [ "$(id -u)" -eq 0 ]; then
    /usr/local/bin/3dvr-browser-lease status || warn "browser lease status unavailable"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo -n /usr/local/bin/3dvr-browser-lease status || warn "browser lease status unavailable"
  else
    warn "browser lease status requires privileged read access"
  fi
else
  warn "browser lease helper missing"
fi

if (( failures > 0 )); then
  printf 'ACCESS_HEALTH=degraded failures=%d\n' "$failures"
  exit 1
fi
printf 'ACCESS_HEALTH=healthy\n'
