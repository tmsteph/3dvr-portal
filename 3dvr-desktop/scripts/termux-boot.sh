#!/data/data/com.termux/files/usr/bin/bash
set -u
LOG_DIR="$HOME/.local/state/3dvr-desktop"
mkdir -p "$LOG_DIR"
sleep 15

termux-wake-lock >/dev/null 2>&1 || true
/system/bin/am start --user 0 -n com.termux/.app.TermuxActivity >/dev/null 2>&1 || true

if ! pgrep -f 'desktop-commander.* remote' >/dev/null 2>&1; then
  if [ -x "$HOME/bin/start-desktop-commander-remote" ]; then
    "$HOME/bin/start-desktop-commander-remote" >/dev/null 2>&1 || true
  elif command -v desktop-commander >/dev/null 2>&1; then
    nohup desktop-commander remote >>"$LOG_DIR/desktop-commander.log" 2>&1 &
  fi
fi

if command -v 3dvr >/dev/null 2>&1; then
  nohup 3dvr agent start >>"$LOG_DIR/agent.log" 2>&1 &
fi

if command -v 3dvr-desktop >/dev/null 2>&1 && ! pgrep -x xfwm4 >/dev/null 2>&1; then
  nohup 3dvr-desktop start >>"$LOG_DIR/session.log" 2>&1 &
fi
