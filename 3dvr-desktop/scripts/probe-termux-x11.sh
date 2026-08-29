#!/data/data/com.termux/files/usr/bin/bash
set -u
TERMUX_PREFIX=${PREFIX:-/data/data/com.termux/files/usr}
export PREFIX="$TERMUX_PREFIX"
export HOME=${HOME:-/data/data/com.termux/files/home}
export TMPDIR=${TMPDIR:-$TERMUX_PREFIX/tmp}
export PATH="$HOME/bin:$TERMUX_PREFIX/bin:/system/bin:${PATH:-}"

DISPLAY_NUM=${THREEDVR_PROBE_DISPLAY:-:99}
number=${DISPLAY_NUM#:}
socket="$TMPDIR/.X11-unix/X$number"
lock="$TMPDIR/.X${number}-lock"
state="$HOME/.local/state/3dvr-desktop"
log="$state/x11-probe.log"
mkdir -p "$state" "$TMPDIR/.X11-unix"
rm -f "$socket" "$lock"
: >"$log"

TERMUX_X11_DEBUG=1 termux-x11 "$DISPLAY_NUM" >>"$log" 2>&1 &
pid=$!
ready=0
for _ in $(seq 1 32); do
  if [ -S "$socket" ] && DISPLAY="$DISPLAY_NUM" xprop -root >/dev/null 2>&1; then
    ready=1
    break
  fi
  kill -0 "$pid" >/dev/null 2>&1 || break
  sleep 0.25
done
if [ "$ready" -eq 1 ]; then
  echo "ok   Termux:X11 created a working display on $DISPLAY_NUM"
  kill "$pid" >/dev/null 2>&1 || true
  wait "$pid" 2>/dev/null || true
  rm -f "$socket" "$lock"
  exit 0
fi

wait "$pid" 2>/dev/null
status=$?
echo "fail Termux:X11 did not create a display (exit $status)" >&2
echo "log  $log" >&2
[ -s "$log" ] && tail -80 "$log" >&2
rm -f "$socket" "$lock"
exit 1
