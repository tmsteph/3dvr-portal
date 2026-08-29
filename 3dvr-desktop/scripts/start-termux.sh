#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
DEST=${THREEDVR_DESKTOP_ROOT:-"$HOME/.3dvr/desktop"}
DISPLAY_NUM=${THREEDVR_DISPLAY:-:0}
TERMUX_X11_ARGS=${TERMUX_X11_ARGS:--legacy-drawing}
STATE="$HOME/.local/state/3dvr-desktop"
mkdir -p "$STATE"

export DISPLAY="$DISPLAY_NUM"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/data/data/com.termux/files/usr/tmp}"
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

if ! pgrep -x termux-x11 >/dev/null 2>&1; then
  termux-x11 $TERMUX_X11_ARGS "$DISPLAY_NUM" >>"$STATE/x11.log" 2>&1 &
  sleep 1
fi
/system/bin/am start --user 0 -n com.termux.x11/com.termux.x11.MainActivity >/dev/null 2>&1 || true
sleep 1

exec "$DEST/scripts/phone/start-3dvr-shell-session"
