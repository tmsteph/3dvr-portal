#!/usr/bin/env bash
set -euo pipefail

printf 'host=%s\n' "$(hostname)"
printf 'user=%s\n' "$(id -un)"
printf 'python3=%s\n' "$(command -v python3 || true)"
printf 'gh=%s\n' "$(command -v gh || true)"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo 'gh_auth=ok'
else
  echo 'gh_auth=missing'
fi
printf 'git=%s\n' "$(command -v git || true)"
