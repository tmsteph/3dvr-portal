#!/bin/sh
set -eu
if [ -n "${DISPLAY:-}" ]; then
  exec dbus-run-session openbox-session
fi
exec startx
