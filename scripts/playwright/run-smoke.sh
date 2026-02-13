#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

run_local_smoke() {
  cd "$ROOT_DIR"
  npm run playwright:smoke:linux
}

if [ "$(uname -o 2>/dev/null || true)" = "Android" ] && command -v proot-distro >/dev/null 2>&1; then
  if proot-distro login debian -- true >/dev/null 2>&1; then
    proot-distro login debian -- sh -lc "cd '$ROOT_DIR' && npm run playwright:smoke:linux"
    exit 0
  fi

  echo "Playwright needs Linux on Android. Install one with: proot-distro install debian"
  exit 1
fi

run_local_smoke
