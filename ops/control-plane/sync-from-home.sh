#!/bin/sh
set -eu

CONTROL_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LIVE_HOME=${LIVE_HOME:-/data/data/com.termux/files/home}
LIVE_ROOT=${LIVE_ROOT:-/data/data/com.termux/files}

mkdir -p "$CONTROL_DIR/home/RUNBOOKS" "$CONTROL_DIR/termux-root"

for file in AGENTS.md ME.md BUSINESSES.md PRIORITIES.md TODAY.md DECISIONS.md; do
  cp "$LIVE_HOME/$file" "$CONTROL_DIR/home/$file"
done

for file in README.md daily-operator.md 3dvr-production.md; do
  cp "$LIVE_HOME/RUNBOOKS/$file" "$CONTROL_DIR/home/RUNBOOKS/$file"
done

cp "$LIVE_ROOT/AGENTS.md" "$CONTROL_DIR/termux-root/AGENTS.md"
