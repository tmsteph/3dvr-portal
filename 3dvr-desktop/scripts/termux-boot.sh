#!/data/data/com.termux/files/usr/bin/bash
set -u
DEST=${THREEDVR_DESKTOP_ROOT:-"$HOME/.3dvr/desktop"}
LOG_DIR="$HOME/.local/state/3dvr-desktop"
mkdir -p "$LOG_DIR"
sleep 12

termux-wake-lock >/dev/null 2>&1 || true

# Remote access and the agent can start while the phone is still locked.
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

# Android does not surface X11 over the lock screen. Wait for the first normal
# unlock, then let Companion foreground Termux and start the graphical session.
if ! pgrep -f 'start-after-unlock\.sh' >/dev/null 2>&1; then
  nohup "$DEST/scripts/phone/start-after-unlock.sh" >>"$LOG_DIR/session.log" 2>&1 &
fi
