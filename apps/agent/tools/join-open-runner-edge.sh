#!/usr/bin/env bash
set -euo pipefail

[ "$#" -ge 1 ] || { echo "Usage: $0 DEVICE_NAME [REVERSE_PORT]" >&2; exit 2; }
NAME="$1"
PORT="${2:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MESH="$ROOT/thomas-agent/scripts/ask-device"

[ -x "$MESH" ] || chmod +x "$MESH"
if [ -n "$PORT" ]; then
  "$MESH" mesh --name "$NAME" --reverse-port "$PORT"
else
  "$MESH" mesh --name "$NAME"
fi

printf '\nMesh status:\n'
"$MESH" mesh-status || true

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo
  echo "GitHub is authenticated. Optional direct edge runner can be installed with:"
  echo "$ROOT/tools/install-open-runner-edge.sh $NAME tmsteph/3dvr-terminal-bridge tmsteph"
else
  echo
  echo "GitHub is not authenticated on this edge. That is OK: the cloud Open Runner can reach it through the SSH mesh when online."
fi
