#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

TERMUX_PREFIX=${PREFIX:-/data/data/com.termux/files/usr}
export PREFIX="$TERMUX_PREFIX"
export HOME=${HOME:-/data/data/com.termux/files/home}
export TMPDIR=${TMPDIR:-$TERMUX_PREFIX/tmp}
export PATH="$HOME/bin:$TERMUX_PREFIX/bin:/system/bin:${PATH:-}"

DEST=${THREEDVR_DESKTOP_ROOT:-"$HOME/.3dvr/desktop"}
DISPLAY_NUM=${THREEDVR_DISPLAY:-:0}
TERMUX_X11_ARGS=${TERMUX_X11_ARGS:--legacy-drawing}
X11_WAIT_SECONDS=${THREEDVR_X11_WAIT_SECONDS:-8}
STATE="$HOME/.local/state/3dvr-desktop"
mkdir -p "$STATE" "$TMPDIR/.X11-unix"

export DISPLAY="$DISPLAY_NUM"
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-$TMPDIR}
export PULSE_SERVER=127.0.0.1

termux-x11-preference \
  clipboardEnable:true keepScreenOn:true showAdditionalKbd:true \
  additionalKbdVisible:true fullscreen:false displayResolutionMode:native \
  displayScale:100 showIMEWhileExternalConnected:true >/dev/null 2>&1 || true
if ! pulseaudio --check >/dev/null 2>&1; then
  pulseaudio --start \
    --load="module-native-protocol-tcp auth-ip-acl=127.0.0.1 auth-anonymous=1" \
    --exit-idle-time=-1 >/dev/null 2>&1 || true
fi

number=${DISPLAY_NUM#:}
socket="$TMPDIR/.X11-unix/X$number"
lock="$TMPDIR/.X${number}-lock"

if ! pgrep -x termux-x11 >/dev/null 2>&1; then
  rm -f "$socket" "$lock"
  : >"$STATE/x11.log"
  TERMUX_X11_DEBUG=${TERMUX_X11_DEBUG:-1} \
    termux-x11 $TERMUX_X11_ARGS "$DISPLAY_NUM" >>"$STATE/x11.log" 2>&1 &
fi

# Use Termux's Android compatibility launcher. Samsung may still defer the
# activity while the phone is locked; the boot supervisor waits for unlock.
am start --user 0 -n com.termux.x11/com.termux.x11.MainActivity >/dev/null 2>&1 || true

ready=0
for ((i=0; i<X11_WAIT_SECONDS*4; i++)); do
  if [ -S "$socket" ] && DISPLAY="$DISPLAY_NUM" xprop -root >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done
if [ "$ready" -ne 1 ]; then
  {
    echo "3DVR Desktop: Termux:X11 did not become ready on $DISPLAY_NUM."
    echo "The remote bridge and agent can keep running; the graphical session was not started."
    echo "Run: 3dvr-desktop doctor"
    echo "Log: $STATE/x11.log"
  } >&2
  exit 1
fi

exec "$DEST/scripts/phone/start-3dvr-shell-session"
