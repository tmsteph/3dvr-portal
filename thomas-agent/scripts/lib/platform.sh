#!/usr/bin/env bash

detect_platform() {
  case "$(uname -s)" in
    Linux*)
      if command -v termux-info >/dev/null 2>&1; then
        echo termux
      elif grep -qi microsoft /proc/version 2>/dev/null; then
        echo wsl
      else
        echo linux
      fi
      ;;
    Darwin*) echo mac ;;
    CYGWIN*|MINGW*|MSYS*) echo windows ;;
    *) echo unknown ;;
  esac
}

open_url() {
  url="$1"
  if [ -n "${THREEDVR_OPEN_URL_LOG:-}" ]; then
    printf '%s\n' "$url" >> "$THREEDVR_OPEN_URL_LOG"
    return 0
  fi

  platform="$(detect_platform)"
  case "$platform" in
    termux)
      if command -v termux-open-url >/dev/null 2>&1; then
        termux-open-url "$url"
      elif command -v termux-open >/dev/null 2>&1; then
        termux-open "$url"
      else
        echo "Open manually: $url"
      fi
      ;;
    linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 &
      elif command -v gio >/dev/null 2>&1; then
        gio open "$url" >/dev/null 2>&1 &
      else
        echo "Open manually: $url"
      fi
      ;;
    wsl) command -v wslview >/dev/null 2>&1 && wslview "$url" >/dev/null 2>&1 & ;;
    mac) open "$url" ;;
    windows) start "$url" ;;
    *) echo "Open manually: $url" ;;
  esac
}

copy_text() {
  text="$1"
  if [ -n "${THREEDVR_CLIPBOARD_LOG:-}" ]; then
    printf '%s' "$text" > "$THREEDVR_CLIPBOARD_LOG"
    return 0
  fi

  platform="$(detect_platform)"
  case "$platform" in
    termux)
      if command -v termux-clipboard-set >/dev/null 2>&1; then
        printf '%s' "$text" | termux-clipboard-set
      else
        printf '%s\n' "$text"
      fi
      ;;
    mac)
      if command -v pbcopy >/dev/null 2>&1; then
        printf '%s' "$text" | pbcopy
      else
        printf '%s\n' "$text"
      fi
      ;;
    linux|wsl)
      if command -v wl-copy >/dev/null 2>&1; then
        printf '%s' "$text" | wl-copy
      elif command -v xclip >/dev/null 2>&1; then
        printf '%s' "$text" | xclip -selection clipboard
      elif command -v xsel >/dev/null 2>&1; then
        printf '%s' "$text" | xsel --clipboard --input
      else
        printf '%s\n' "$text"
      fi
      ;;
    *)
      printf '%s\n' "$text"
      ;;
  esac
}

url_encode() {
  value="$1"
  if command -v python3 >/dev/null 2>&1; then
    VALUE="$value" python3 - <<'PY'
import os
import urllib.parse
print(urllib.parse.quote(os.environ.get("VALUE", ""), safe=""))
PY
  elif command -v node >/dev/null 2>&1; then
    VALUE="$value" node -e 'process.stdout.write(encodeURIComponent(process.env.VALUE || ""))'
    printf '\n'
  else
    printf '%s' "$value" | sed 's/ /%20/g'
    printf '\n'
  fi
}

get_location() {
  platform="$(detect_platform)"
  case "$platform" in
    termux)
      if command -v termux-location >/dev/null 2>&1; then
        termux-location
      else
        echo ""
      fi
      ;;
    *)
      echo ""
      ;;
  esac
}
