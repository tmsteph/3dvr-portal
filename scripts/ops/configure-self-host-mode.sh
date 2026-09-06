#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
config_dir="${THREEDVR_CONFIG_DIR:-$HOME/.3dvr/config}"
settings_env="$config_dir/portal-settings.env"

case "$mode" in
  shadow)
    legacy_origin='https://3dvr-portal.vercel.app'
    ;;
  independent)
    legacy_origin=''
    ;;
  *)
    echo 'Usage: configure-self-host-mode.sh <shadow|independent>' >&2
    exit 2
    ;;
esac

mkdir -p "$config_dir"
chmod 700 "$config_dir" 2>/dev/null || true
umask 077
next="$(mktemp)"
trap 'rm -f "$next"' EXIT
if [ -f "$settings_env" ]; then
  grep -v '^THREEDVR_LEGACY_API_ORIGIN=' "$settings_env" > "$next" || true
fi
printf 'THREEDVR_LEGACY_API_ORIGIN=%s\n' "$legacy_origin" >> "$next"
mv "$next" "$settings_env"
chmod 600 "$settings_env"
printf 'Self-host mode configured: %s\n' "$mode"
printf 'Redeploy the intended release, then run check-self-host-readiness.mjs before any DNS change.\n'
