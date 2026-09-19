#!/usr/bin/env bash
set -euo pipefail

threshold="${THREEDVR_HETZNER_DISK_CLEAN_THRESHOLD:-80}"
critical="${THREEDVR_HETZNER_DISK_CRITICAL_THRESHOLD:-90}"

usage_pct() {
  df -P / | tail -1 | awk '{gsub(/%/,"",$5); print $5}'
}

is_path_live() {
  local target="$1"
  ps -eo args= 2>/dev/null | grep -F -- "$target" | grep -v -F -- "grep -F" >/dev/null 2>&1 && return 0
  local link
  for link in /proc/[0-9]*/cwd; do
    [ -L "$link" ] || continue
    case "$(readlink "$link" 2>/dev/null || true)" in
      "$target"|"$target"/*) return 0 ;;
    esac
  done
  return 1
}

prune_git_worktree_dir() {
  local root="$1"
  [ -d "$root" ] || return 0
  local p dirty
  for p in "$root"/*; do
    [ -d "$p" ] || continue
    git -C "$p" rev-parse --is-inside-work-tree >/dev/null 2>&1 || continue
    is_path_live "$p" && { echo "KEEP live $p"; continue; }
    dirty="$(git -C "$p" status --porcelain 2>/dev/null | wc -l)"
    [ "$dirty" -eq 0 ] || { echo "KEEP dirty $p"; continue; }
    git -C "$p" merge-base --is-ancestor HEAD origin/main >/dev/null 2>&1       || { echo "KEEP unmerged $p"; continue; }
    echo "PRUNE clean merged worktree $p"
    rm -rf -- "$p"
  done
}

before="$(usage_pct)"
echo "hetzner_disk_before=${before}%"

if [ "$before" -lt "$threshold" ]; then
  echo "disk below cleanup threshold; no action"
  exit 0
fi

journalctl --vacuum-size=200M >/dev/null 2>&1 || true
apt-get clean >/dev/null 2>&1 || true

if ! is_path_live /root/.cache/ms-playwright; then
  rm -rf /root/.cache/ms-playwright
fi
if ! is_path_live /root/.cache/chromium-headless; then
  rm -rf /root/.cache/chromium-headless
fi
if ! is_path_live /root/.cache/node-gyp; then
  rm -rf /root/.cache/node-gyp
fi

# npx caches are reproducible but may contain a currently-running agent-browser binary.
if [ -d /root/.npm/_npx ]; then
  for p in /root/.npm/_npx/*; do
    [ -d "$p" ] || continue
    is_path_live "$p" && { echo "KEEP active npx $p"; continue; }
    find "$p" -maxdepth 0 -mtime +2 -print -quit | grep -q . || continue
    echo "PRUNE stale npx $p"
    rm -rf -- "$p"
  done
fi

# Temporary repair/diagnostic trees older than one day.
for pattern in '/tmp/3dvr-*' '/tmp/bitwarden-*' '/tmp/lighthouse-*' '/tmp/ukg-*' '/tmp/money-evidence-*'; do
  for p in $pattern; do
    [ -e "$p" ] || continue
    is_path_live "$p" && { echo "KEEP live temp $p"; continue; }
    find "$p" -maxdepth 0 -mtime +1 -print -quit | grep -q . || continue
    echo "PRUNE stale temp $p"
    rm -rf -- "$p"
  done
done

# Only directories explicitly designated as worktree scratch space are auto-pruned.
prune_git_worktree_dir /root/worktrees
prune_git_worktree_dir /root/.3dvr/worktrees

for repo in /root/.3dvr/portal /root/.3dvr/managed-worker; do
  [ -d "$repo" ] && git -C "$repo" worktree prune --expire now 2>/dev/null || true
done

sync
after="$(usage_pct)"
echo "hetzner_disk_after=${after}%"

if [ "$after" -ge "$critical" ]; then
  echo "Hetzner disk remains critically full at ${after}%" >&2
  exit 2
fi
