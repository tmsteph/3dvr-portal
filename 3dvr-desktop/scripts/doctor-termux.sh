#!/data/data/com.termux/files/usr/bin/bash
set -u
TERMUX_PREFIX=${PREFIX:-/data/data/com.termux/files/usr}
export PREFIX="$TERMUX_PREFIX"
export HOME=${HOME:-/data/data/com.termux/files/home}
export TMPDIR=${TMPDIR:-$TERMUX_PREFIX/tmp}
export PATH="$HOME/bin:$TERMUX_PREFIX/bin:/system/bin:${PATH:-}"

fail=0
ok() { printf 'ok   %s\n' "$1"; }
warn() { printf 'warn %s\n' "$1"; }
miss() { printf 'miss %s\n' "$1"; fail=1; }

for name in termux-x11 xfwm4 xfsettingsd wmctrl xprop clang pkg-config python3; do
  command -v "$name" >/dev/null 2>&1 && ok "$name" || miss "$name"
done

if [ -x "$HOME/3dvr-shell/3dvr-shell" ]; then
  ok '3dvr-shell'
else
  miss '3dvr-shell'
fi

if /system/bin/pm path com.termux.x11 >/dev/null 2>&1; then
  ok 'Termux:X11 Android app'
else
  miss 'Termux:X11 Android app'
fi
if /system/bin/pm path com.termux.boot >/dev/null 2>&1; then
  ok 'Termux:Boot Android app'
else
  warn 'Termux:Boot Android app not detected; reboot autostart will not run'
fi

shell_version=$(dpkg-query -W -f='${Version}' termux-x11-nightly 2>/dev/null || true)
[ -n "$shell_version" ] && ok "termux-x11 package $shell_version" || miss 'termux-x11 package'

boot="$HOME/.termux/boot/02-3dvr-desktop"
if [ -x "$boot" ]; then
  ok '3DVR boot entry'
else
  miss '3DVR boot entry'
fi

pairing="$HOME/.config/3dvr-terminal-bridge/companion.json"
if [ -s "$pairing" ]; then
  ok '3DVR Companion pairing'
  if python3 - "$pairing" <<'PY' >/dev/null 2>&1
import json, sys, urllib.request
spec=json.load(open(sys.argv[1], encoding='utf-8'))
req=urllib.request.Request(spec['url'].rstrip('/')+'/v1/health', headers={'Authorization':'Bearer '+spec['token']})
with urllib.request.urlopen(req, timeout=3) as response:
    assert json.load(response).get('ok') is True
PY
  then ok '3DVR Companion bridge'; else warn '3DVR Companion bridge unavailable'; fi
else
  warn '3DVR Companion is not paired; unlock handoff cannot foreground Termux'
fi
display=${THREEDVR_DISPLAY:-:0}
number=${display#:}
socket="$TMPDIR/.X11-unix/X$number"

if pgrep -x termux-x11 >/dev/null 2>&1; then
  ok 'Termux:X11 server process'
  if [ -S "$socket" ] && DISPLAY="$display" xprop -root >/dev/null 2>&1; then
    ok "X11 display $display"
  else
    warn "Termux:X11 process exists but $display is not responding"
  fi
else
  warn 'Termux:X11 server is not running'
  [ -e "$socket" ] && warn "stale X11 socket: $socket"
fi

if pgrep -x xfwm4 >/dev/null 2>&1; then
  ok 'XFWM4 session'
else
  warn 'XFWM4 session is not running'
fi

printf '\nUse `3dvr-desktop probe-x11` for an isolated X-server startup test.\n'
exit "$fail"
