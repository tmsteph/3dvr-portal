#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${THREEDVR_AGENT_REPO:-https://github.com/tmsteph/3dvr-agent.git}"
INSTALL_HOME="${THREEDVR_HOME:-$HOME/.3dvr}"
INSTALL_DIR="${THREEDVR_AGENT_DIR:-$INSTALL_HOME/agent}"
CONFIG_DIR="$INSTALL_HOME/config"
CONFIG_FILE="$CONFIG_DIR/env"
SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" >/dev/null 2>&1 && pwd -P || pwd -P)"

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
    *) echo unknown ;;
  esac
}

default_bin_dir() {
  if [ "$(detect_platform)" = "termux" ] && [ -n "${PREFIX:-}" ] && [ -w "$PREFIX/bin" ]; then
    echo "$PREFIX/bin"
  else
    echo "$HOME/.local/bin"
  fi
}

BIN_DIR="${THREEDVR_BIN_DIR:-$(default_bin_dir)}"

log() {
  printf '%s\n' "$*"
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || {
    log "Missing required command: $1"
    log "Install it first, then rerun this installer."
    exit 1
  }
}

append_path_hint() {
  shell_file="$1"
  [ -f "$shell_file" ] || return 0
  grep -F "$BIN_DIR" "$shell_file" >/dev/null 2>&1 && return 0
  {
    printf '\n'
    printf '# 3dvr CLI\n'
    printf 'export PATH="%s:$PATH"\n' "$BIN_DIR"
  } >> "$shell_file"
}

install_repo() {
  if [ -f "$SCRIPT_DIR/package.json" ] && [ -x "$SCRIPT_DIR/thomas-agent/scripts/3dvr" ]; then
    script_root="$(cd "$SCRIPT_DIR" && pwd -P)"
    install_root="$([ -d "$INSTALL_DIR" ] && cd "$INSTALL_DIR" 2>/dev/null && pwd -P || true)"
    if [ "$script_root" = "$install_root" ]; then
      log "Using current checkout at $INSTALL_DIR"
      return 0
    fi
  fi

  if [ -d "$INSTALL_DIR/.git" ]; then
    log "Updating 3dvr-agent in $INSTALL_DIR"
    git -C "$INSTALL_DIR" pull --ff-only
    return 0
  fi

  if [ -e "$INSTALL_DIR" ]; then
    log "$INSTALL_DIR exists but is not a git checkout."
    log "Move it aside or set THREEDVR_AGENT_DIR to a different path."
    exit 1
  fi

  log "Cloning 3dvr-agent into $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO_URL" "$INSTALL_DIR"
}

install_node_deps() {
  need_command node
  need_command npm

  log "Installing Node dependencies"
  if [ -f "$INSTALL_DIR/package-lock.json" ]; then
    npm --prefix "$INSTALL_DIR" ci --omit=dev
  else
    npm --prefix "$INSTALL_DIR" install --omit=dev
  fi
}

write_default_config() {
  mkdir -p "$CONFIG_DIR"
  if [ -f "$CONFIG_FILE" ]; then
    log "Keeping existing config at $CONFIG_FILE"
    return 0
  fi

  log "Creating config at $CONFIG_FILE"
cat > "$CONFIG_FILE" <<'EOF'
# 3dvr-agent local config
THREEDVR_GUN_RELAY=https://gun-relay-3dvr.fly.dev/gun
THREEDVR_PORTAL_URL=https://portal.3dvr.tech
THREEDVR_GMAIL_AUTH=oauth-first
THREEDVR_OAUTH_FILE="${THREEDVR_HOME:-$HOME/.3dvr}/oauth.json"
EOF
}

link_cli() {
  mkdir -p "$BIN_DIR"
  chmod +x "$INSTALL_DIR/thomas-agent/scripts/"* 2>/dev/null || true
  ln -sf "$INSTALL_DIR/thomas-agent/scripts/3dvr" "$BIN_DIR/3dvr"
  log "Linked CLI: $BIN_DIR/3dvr"
}

maybe_update_shell_path() {
  case ":$PATH:" in
    *":$BIN_DIR:"*) return 0 ;;
  esac

  append_path_hint "$HOME/.bashrc"
  append_path_hint "$HOME/.zshrc"

  log ""
  log "$BIN_DIR is not on PATH in this shell."
  log "Restart your shell or run:"
  log "  export PATH=\"$BIN_DIR:\$PATH\""
}

main() {
  log "Installing 3dvr-agent"
  need_command git
  install_repo
  install_node_deps
  write_default_config
  link_cli
  maybe_update_shell_path

  log ""
  log "Done."
  log "Run:"
  log "  3dvr setup"
  log "  3dvr doctor"
  log "  3dvr connect"
}

main "$@"
