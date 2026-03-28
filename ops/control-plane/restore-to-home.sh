#!/bin/sh
set -eu

CONTROL_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TARGET_HOME=${TARGET_HOME:-$HOME}
TARGET_ROOT=${TARGET_TERMUX_ROOT:-$(dirname "$TARGET_HOME")}

mkdir -p "$TARGET_HOME/RUNBOOKS"

for file in AGENTS.md ME.md BUSINESSES.md PRIORITIES.md TODAY.md DECISIONS.md; do
  cp "$CONTROL_DIR/home/$file" "$TARGET_HOME/$file"
done

for file in README.md daily-operator.md 3dvr-production.md; do
  cp "$CONTROL_DIR/home/RUNBOOKS/$file" "$TARGET_HOME/RUNBOOKS/$file"
done

cp "$CONTROL_DIR/termux-root/AGENTS.md" "$TARGET_ROOT/AGENTS.md"
