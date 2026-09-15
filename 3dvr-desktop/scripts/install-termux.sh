#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$ROOT/.." && pwd)
AGENT_INSTALL="$REPO_ROOT/apps/agent/install.sh"
DEST="$HOME/.3dvr/desktop"
TERMUX_PREFIX=${PREFIX:-/data/data/com.termux/files/usr}
BACKUP="$HOME/.local/state/3dvr-desktop-backups/$(date +%Y%m%d-%H%M%S)"

if [ "${THREEDVR_SKIP_PACKAGES:-0}" != "1" ]; then
  pkg update -y
  pkg install -y x11-repo
  pkg install -y openssh termux-x11-nightly xfce4 clang pkg-config gtk3 wmctrl xorg-xprop pulseaudio
fi

mkdir -p "$BACKUP" "$DEST" "$HOME/bin" "$HOME/.termux/boot"
[ -d "$HOME/3dvr-shell" ] && cp -a "$HOME/3dvr-shell" "$BACKUP/" || true
for f in "$ROOT/scripts/phone/"*; do
  name=$(basename "$f")
  [ -f "$HOME/bin/$name" ] && cp -a "$HOME/bin/$name" "$BACKUP/$name" || true
done

rm -rf "$DEST.new"
mkdir -p "$DEST.new"
cp -R "$ROOT/." "$DEST.new/"
rm -rf "$DEST"
mv "$DEST.new" "$DEST"

for f in "$DEST/scripts/phone/"*; do
  cp "$f" "$HOME/bin/$(basename "$f")"
  chmod +x "$HOME/bin/$(basename "$f")"
done
"$DEST/scripts/build-termux-shell.sh"
ln -sf "$DEST/bin/3dvr-desktop" "$TERMUX_PREFIX/bin/3dvr-desktop"

# Keep the general 3dvr CLI in lock-step with the checkout that installed the
# Termux desktop. Device mesh support lives in apps/agent, not 3dvr-desktop.
if [ -x "$AGENT_INSTALL" ]; then
  echo 'Refreshing 3dvr CLI from this checkout...'
  if command -v git >/dev/null 2>&1 && command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    THREEDVR_AGENT_DIR="$REPO_ROOT/apps/agent" "$AGENT_INSTALL"
  elif [ -x "$REPO_ROOT/apps/agent/thomas-agent/scripts/3dvr" ]; then
    ln -sf "$REPO_ROOT/apps/agent/thomas-agent/scripts/3dvr" "$TERMUX_PREFIX/bin/3dvr"
    echo 'Linked current 3dvr CLI; skipped agent dependency refresh because git/node/npm are incomplete.'
  fi
fi

cp "$DEST/scripts/termux-boot.sh" "$HOME/.termux/boot/02-3dvr-desktop"
chmod +x "$HOME/.termux/boot/02-3dvr-desktop"

echo '3DVR Desktop installed for native Termux:X11.'
echo "Backup: $BACKUP"
echo 'Termux:Boot will start it automatically after Android boots.'
