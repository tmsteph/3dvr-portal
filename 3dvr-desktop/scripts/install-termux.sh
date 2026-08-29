#!/data/data/com.termux/files/usr/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEST="$HOME/.3dvr/desktop"

pkg update -y
pkg install -y x11-repo proot-distro
pkg install -y termux-x11-nightly || true

if ! proot-distro list | grep -qE '^ *debian '; then
  proot-distro install debian
fi

mkdir -p "$DEST" "$HOME/.local/bin"
cp -R "$ROOT/." "$DEST/"
ln -sf "$DEST/bin/3dvr-desktop" "$PREFIX/bin/3dvr-desktop"

proot-distro login debian \
  --bind "$DEST:/opt/3dvr-desktop" \
  -- /bin/sh -lc '/opt/3dvr-desktop/scripts/install-debian.sh'

echo '3DVR Desktop installed for Termux.'
echo 'Make sure the Termux:X11 Android app is installed, then run: 3dvr-desktop start'
