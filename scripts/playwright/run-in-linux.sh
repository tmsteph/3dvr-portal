#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <npm-script-name>"
  exit 1
fi

TARGET_SCRIPT=$1
case "$TARGET_SCRIPT" in
  *[!A-Za-z0-9:_-]*)
    echo "Invalid npm script name: $TARGET_SCRIPT"
    exit 1
    ;;
esac

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

run_local() {
  cd "$ROOT_DIR"
  npm run "$TARGET_SCRIPT"
}

is_android=false
if [ "$(uname -o 2>/dev/null || true)" = "Android" ]; then
  is_android=true
fi
if [ "${TERMUX_VERSION:-}" != "" ]; then
  is_android=true
fi

if [ "$is_android" = "true" ]; then
  if ! command -v proot-distro >/dev/null 2>&1; then
    echo "Termux detected: install proot support first with `pkg install proot-distro`."
    exit 1
  fi

  if ! proot-distro login debian -- true >/dev/null 2>&1; then
    echo "Playwright needs Linux userland on Android. Install one with: proot-distro install debian"
    exit 1
  fi

  PLAYWRIGHT_BROWSER_VALUE=${PLAYWRIGHT_BROWSER:-firefox}
  proot-distro login debian -- sh -lc "cd '$ROOT_DIR' && PLAYWRIGHT_BROWSER='$PLAYWRIGHT_BROWSER_VALUE' npm run $TARGET_SCRIPT"
  exit 0
fi

run_local
