#!/data/data/com.termux/files/usr/bin/sh
set -u
DEST=${THREEDVR_DESKTOP_ROOT:-"$HOME/.3dvr/desktop"}
LOG_DIR="$HOME/.3dvr/logs"
mkdir -p "$LOG_DIR"

# Wait for Android to finish bringing networking and storage online.
sleep 20

if command -v desktop-commander >/dev/null 2>&1; then
  nohup desktop-commander remote >>"$LOG_DIR/desktop-commander-boot.log" 2>&1 &
elif command -v npx >/dev/null 2>&1; then
  nohup npx --yes @wonderwhy-er/desktop-commander@latest remote >>"$LOG_DIR/desktop-commander-boot.log" 2>&1 &
fi

if command -v 3dvr >/dev/null 2>&1; then
  nohup 3dvr agent start >>"$LOG_DIR/agent-boot.log" 2>&1 &
fi

if command -v 3dvr-desktop >/dev/null 2>&1; then
  nohup 3dvr-desktop start >>"$LOG_DIR/desktop-boot.log" 2>&1 &
fi

# Ask Android to bring the Termux UI forward after boot. Some Android versions
# may refuse background activity launches; the services above still start.
if command -v monkey >/dev/null 2>&1; then
  monkey -p com.termux -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
  sleep 2
  monkey -p com.termux.x11 -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
fi
