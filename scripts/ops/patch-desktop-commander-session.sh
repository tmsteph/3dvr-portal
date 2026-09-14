#!/usr/bin/env bash
set -euo pipefail

marker='3DVR_SESSION_PERSIST_WORKAROUND'

find_pkg_root() {
  local candidate
  if [ -n "${DESKTOP_COMMANDER_PKG_ROOT:-}" ]; then
    printf '%s\n' "$DESKTOP_COMMANDER_PKG_ROOT"
    return 0
  fi
  for candidate in \
    /usr/local/lib/node_modules/@wonderwhy-er/desktop-commander \
    /home/tmsteph/.local/lib/node_modules/@wonderwhy-er/desktop-commander \
    /root/.local/lib/node_modules/@wonderwhy-er/desktop-commander; do
    if [ -f "$candidate/dist/remote-device/device.js" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  if command -v npm >/dev/null 2>&1; then
    candidate="$(npm root -g 2>/dev/null || true)/@wonderwhy-er/desktop-commander"
    if [ -f "$candidate/dist/remote-device/device.js" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi
  return 1
}

pkg_root="$(find_pkg_root || true)"
[ -n "$pkg_root" ] || { echo 'Desktop Commander global package could not be located.' >&2; exit 1; }
device_js="$pkg_root/dist/remote-device/device.js"

if grep -q "$marker" "$device_js"; then
  echo 'Desktop Commander session persistence workaround already installed.'
  exit 0
fi

backup="$device_js.3dvr-original"
[ -f "$backup" ] || cp -a "$device_js" "$backup"

python3 - "$device_js" "$marker" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
marker = sys.argv[2]
text = path.read_text()
needle = "            this.remoteChannel.startHeartbeat(this.deviceId);"
if needle not in text:
    raise SystemExit("Desktop Commander runtime changed: heartbeat insertion point not found")

patch = f'''{needle}\n\n            // {marker}\n            // Supabase rotates refresh tokens. Current Desktop Commander releases\n            // update the in-memory session after refresh but do not rewrite\n            // device.json, so a later service restart replays a consumed token.\n            // Persist only when a live refresh token exists; never overwrite a\n            // valid file with an empty session.\n            this.__3dvrSessionPersistTimer = setInterval(async () => {{\n                try {{\n                    const current = await this.remoteChannel.getSession();\n                    if (current?.data?.session?.refresh_token) {{\n                        await this.savePersistedConfig();\n                    }}\n                }} catch (error) {{\n                    console.warn('⚠️ Could not persist refreshed remote session:', error?.message || error);\n                }}\n            }}, 5 * 60 * 1000);\n            this.__3dvrSessionPersistTimer.unref?.();'''

path.write_text(text.replace(needle, patch, 1))
PY

node_bin="${DESKTOP_COMMANDER_NODE_BIN:-}"
if [ -z "$node_bin" ] || [ ! -x "$node_bin" ]; then
  node_bin="$(command -v node)"
fi
"$node_bin" --check "$device_js"

echo "Installed Desktop Commander refresh-session persistence workaround in $device_js"
