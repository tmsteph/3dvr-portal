#!/bin/sh
set -eu

if ! git rev-parse HEAD^ >/dev/null 2>&1; then
  exit 1
fi

git diff --quiet HEAD^ HEAD -- .
