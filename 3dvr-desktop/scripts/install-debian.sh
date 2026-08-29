#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEST=${THREEDVR_DESKTOP_ROOT:-"$HOME/.3dvr/desktop"}

if command -v sudo >/dev/null 2>&1; then
  SUDO=sudo
elif [ "$(id -u)" -eq 0 ]; then
  SUDO=
else
  echo '3DVR Desktop needs sudo or root to install Debian packages.' >&2
  exit 1
fi

$SUDO apt-get update
$SUDO apt-get install -y xorg openbox tint2 rofi xterm pcmanfm dbus-x11

mkdir -p "$DEST" "$HOME/.config/openbox" "$HOME/.config/tint2" \
  "$HOME/.local/share/applications" "$HOME/.local/bin"
cp -R "$ROOT/." "$DEST/"
cp "$DEST/config/openbox/autostart" "$HOME/.config/openbox/autostart"
cp "$DEST/config/tint2/tint2rc" "$HOME/.config/tint2/tint2rc"
cp "$DEST/config/applications/"*.desktop "$HOME/.local/share/applications/"
ln -sf "$DEST/bin/3dvr-desktop" "$HOME/.local/bin/3dvr-desktop"

cat > "$HOME/.xinitrc" <<'XINIT'
#!/bin/sh
exec dbus-run-session openbox-session
XINIT
chmod +x "$HOME/.xinitrc"

echo '3DVR Desktop installed. Run: 3dvr-desktop start'
