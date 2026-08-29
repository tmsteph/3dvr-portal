#!/data/data/com.termux/files/usr/bin/sh
set -eu
DEST=${THREEDVR_DESKTOP_ROOT:-"$HOME/.3dvr/desktop"}
DISPLAY_NUM=${THREEDVR_DISPLAY:-:0}
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-$TMPDIR}

if ! command -v termux-x11 >/dev/null 2>&1; then
  echo 'termux-x11 command not found. Run 3DVR Desktop install first.' >&2
  exit 1
fi

termux-x11 "$DISPLAY_NUM" -ac >/dev/null 2>&1 &
sleep 1

exec proot-distro login debian \
  --shared-tmp \
  --bind "$DEST:/opt/3dvr-desktop" \
  -- /bin/sh -lc "export DISPLAY='$DISPLAY_NUM'; exec dbus-run-session openbox-session"
