#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -n "${TERMUX_VERSION:-}" ] || [ -d /data/data/com.termux/files/usr ]; then
  exec "$ROOT/scripts/install-termux.sh"
fi

exec "$ROOT/scripts/install-debian.sh"
