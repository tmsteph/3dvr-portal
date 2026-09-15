#!/data/data/com.termux/files/usr/bin/bash
set -u
DEST=${THREEDVR_DESKTOP_ROOT:-"$HOME/.3dvr/desktop"}
LOG_DIR="$HOME/.local/state/3dvr-desktop"
mkdir -p "$LOG_DIR"
sleep 12

termux-wake-lock >/dev/null 2>&1 || true

# Keep native SSH available so the reverse mesh has a local endpoint.
if command -v sshd >/dev/null 2>&1 && ! pgrep -x sshd >/dev/null 2>&1; then
  sshd >>"$LOG_DIR/sshd.log" 2>&1 || true
fi

# Supervise every previously enrolled 3DVR reverse-mesh tunnel. The generated
# tunnel script exits when connectivity drops; this wrapper brings it back
# without requiring Desktop Commander, a foreground Termux session, or Android
# to keep one long-lived ssh process perfectly healthy.
for tunnel in "$HOME"/.3dvr/bin/mesh-tunnel-*; do
  [ -x "$tunnel" ] || continue
  name=$(basename "$tunnel")
  supervisor="3dvr-mesh-supervisor-$name"
  if ! pgrep -f "$supervisor" >/dev/null 2>&1; then
    nohup bash -c '
      tunnel=$1
      while true; do
        "$tunnel" || true
        sleep 10
      done
    ' "$supervisor" "$tunnel" >>"$LOG_DIR/$name.log" 2>&1 &
  fi
done

# Desktop Commander remains an optional emergency fallback, not the primary
# machine-control path.
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
