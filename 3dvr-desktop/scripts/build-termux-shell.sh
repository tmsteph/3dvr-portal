#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SHELL_DIR="${THREEDVR_SHELL_DIR:-$HOME/3dvr-shell}"

mkdir -p "$SHELL_DIR"
cp "$ROOT/native/shell.c" "$SHELL_DIR/shell.c"
cp "$ROOT/native/style.css" "$SHELL_DIR/style.css"

clang -O2 "$SHELL_DIR/shell.c" -o "$SHELL_DIR/3dvr-shell" \
  $(pkg-config --cflags --libs gtk+-3.0 x11 xext)
chmod +x "$SHELL_DIR/3dvr-shell"
echo "Built $SHELL_DIR/3dvr-shell"
