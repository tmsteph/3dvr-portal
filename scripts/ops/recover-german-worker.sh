#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ]; then
  for candidate in /opt/3dvr "$HOME/3dvr-portal" "$HOME/3dvr"; do
    if [ -d "$candidate/.git" ]; then
      root="$candidate"
      break
    fi
  done
fi

if [ -z "$root" ] || [ ! -d "$root/.git" ]; then
  echo "Could not locate the 3dvr-portal checkout. Expected /opt/3dvr or a current git checkout." >&2
  exit 2
fi

cd "$root"

echo "3DVR root: $root"
echo "Host: $(hostname)"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to overwrite a dirty server checkout." >&2
  git status --short >&2 || true
  exit 3
fi

echo "Updating main..."
git fetch origin main
git checkout main
git pull --ff-only origin main

npm --prefix apps/agent ci

scripts_dir="$root/apps/agent/thomas-agent/scripts"
worker="$scripts_dir/ask-agent-worker-daemon"
router="$scripts_dir/ask-context-task-router-daemon"
inbox="$scripts_dir/ask-inbox-daemon"
autopilot="$scripts_dir/ask-autopilot-daemon"
heartbeat="$scripts_dir/ask-agent-heartbeat-daemon"
openclaw="$scripts_dir/ask-openclaw-health"

echo "Restarting 3DVR worker stack..."
"$worker" stop || true
"$router" stop || true
"$inbox" stop || true
"$autopilot" stop || true
"$heartbeat" stop || true

"$worker" start
"$router" start
"$inbox" start
"$autopilot" start
"$heartbeat" start

# Do not wait for the normal polling interval: consume one pending task now.
"$worker" run-once || true

echo
echo "Worker status:"
"$worker" status || true

echo
echo "Router status:"
"$router" status || true

echo
echo "Inbox status:"
"$inbox" status || true

echo
echo "Autopilot status:"
"$autopilot" status || true

echo
echo "Heartbeat status:"
"$heartbeat" status || true

echo
echo "OpenClaw health:"
"$openclaw" || true

echo
echo "Recent worker logs:"
"$worker" logs || true

echo
echo "German worker recovery pass complete."
