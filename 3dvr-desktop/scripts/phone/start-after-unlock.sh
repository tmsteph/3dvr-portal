#!/data/data/com.termux/files/usr/bin/bash
set -u
DEST=${THREEDVR_DESKTOP_ROOT:-"$HOME/.3dvr/desktop"}
LOG_DIR="$HOME/.local/state/3dvr-desktop"
mkdir -p "$LOG_DIR"

"$DEST/scripts/phone/await-android-ready.py" >>"$LOG_DIR/android-ready.log" 2>&1 || true
sleep 1

if command -v 3dvr-desktop >/dev/null 2>&1 && ! pgrep -x xfwm4 >/dev/null 2>&1; then
  exec 3dvr-desktop start
fi
