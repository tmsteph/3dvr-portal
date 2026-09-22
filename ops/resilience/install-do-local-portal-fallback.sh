#!/usr/bin/env bash
set -euo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "root required" >&2; exit 77; }

archive="${1:-/tmp/3dvr-portal-do-fallback.tar.gz}"
sha="${2:-unknown}"
ref="${3:-main}"
base=/opt/3dvr-portal-production
releases="$base/releases"
release="$releases/$sha"
current="$base/current"
env_file=/root/.3dvr/config/portal.env
port=4320

[ -f "$archive" ] || { echo "archive missing: $archive" >&2; exit 2; }
install -d -m 0755 "$releases"
install -d -m 0700 /root/.3dvr/config

if [ ! -d "$release" ]; then
  tmp="$releases/.tmp-$sha-$$"
  rm -rf "$tmp"
  install -d -m 0755 "$tmp"
  tar -xzf "$archive" -C "$tmp"
  [ -d "$tmp/node_modules" ] || { echo "prebuilt node_modules missing" >&2; exit 3; }
  mv "$tmp" "$release"
fi

ln -sfn "$release" "$current"

upsert_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  if [ -f "$env_file" ]; then
    grep -v "^$key=" "$env_file" >"$tmp" || true
  fi
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  install -m 0600 "$tmp" "$env_file"
  rm -f "$tmp"
}

upsert_env PORT "$port"
upsert_env HOST 127.0.0.1
upsert_env PORTAL_ROOT "$current"
upsert_env PORTAL_RELEASE_REF "$ref"
upsert_env PORTAL_RELEASE_SHA "$sha"
upsert_env LEGACY_API_ORIGIN https://3dvr-portal.vercel.app

if ! systemctl list-unit-files 3dvr-portal.service --no-legend 2>/dev/null | grep -q .; then
  cat >/etc/systemd/system/3dvr-portal.service <<'UNIT'
[Unit]
Description=3DVR self-hosted portal
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/3dvr-portal-production/current
EnvironmentFile=-/root/.3dvr/config/env
EnvironmentFile=/root/.3dvr/config/portal.env
ExecStart=/usr/bin/env node /opt/3dvr-portal-production/current/scripts/self-host-server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
fi

systemctl daemon-reload
systemctl enable --now 3dvr-portal.service
systemctl restart 3dvr-portal.service

for _ in $(seq 1 30); do
  health="$(curl -fsS --max-time 5 http://127.0.0.1:$port/__3dvr-health 2>/dev/null || true)"
  if printf '%s' "$health" | grep -Fq "\"sha\":\"$sha\"" && printf '%s' "$health" | grep -Fq '"operatorApi":"native"'; then
    break
  fi
  sleep 1
done

health="$(curl -fsS --max-time 5 http://127.0.0.1:$port/__3dvr-health)"
printf '%s' "$health" | grep -Fq "\"sha\":\"$sha\""
printf '%s' "$health" | grep -Fq '"operatorApi":"native"'

mapfile -t old_releases < <(
  find "$releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk '{print $2}'
)
rollback_kept=0
for old_release in "${old_releases[@]}"; do
  [ "$old_release" = "$release" ] && continue
  if [ "$rollback_kept" -lt 1 ]; then
    rollback_kept=1
    continue
  fi
  rm -rf -- "$old_release"
done

echo "do_local_fallback_ready=true"
printf '%s\n' "$health"
