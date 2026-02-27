#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
sh "$ROOT_DIR/scripts/playwright/run-in-linux.sh" playwright:install:linux
