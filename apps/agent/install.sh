#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${THREEDVR_AGENT_REPO:-https://github.com/tmsteph/3dvr-portal.git}"
REPO_SUBDIR="apps/agent"
INSTALL_HOME="${THREEDVR_HOME:-$HOME/.3dvr}"
REPO_DIR="${THREEDVR_REPO_DIR:-$INSTALL_HOME/portal}"
INSTALL_DIR="${THREEDVR_AGENT_DIR:-$REPO_DIR/$REPO_SUBDIR}"
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
    if [ -z "${THREEDVR_AGENT_DIR:-}" ]; then
      INSTALL_DIR="$script_root"
      log "Using current checkout at $INSTALL_DIR"
      return 0
    fi
  fi

  if [ -n "${THREEDVR_AGENT_DIR:-}" ]; then
    if [ -f "$INSTALL_DIR/package.json" ] && [ -x "$INSTALL_DIR/thomas-agent/scripts/3dvr" ]; then
      log "Using agent source at $INSTALL_DIR"
      return 0
    fi
    log "THREEDVR_AGENT_DIR must point to an existing apps/agent directory."
    exit 1
  fi

  if [ -d "$REPO_DIR/.git" ]; then
    log "Updating 3dvr-portal in $REPO_DIR"
    git -C "$REPO_DIR" pull --ff-only
    if [ ! -f "$INSTALL_DIR/package.json" ]; then
      log "Agent package not found after update: $INSTALL_DIR"
      exit 1
    fi
    return 0
  fi

  if [ -e "$REPO_DIR" ]; then
    log "$REPO_DIR exists but is not a git checkout."
    log "Move it aside or set THREEDVR_REPO_DIR to a different path."
    exit 1
  fi

  log "Cloning 3dvr-portal into $REPO_DIR"
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone "$REPO_URL" "$REPO_DIR"
  if [ ! -f "$INSTALL_DIR/package.json" ]; then
    log "Agent package not found after clone: $INSTALL_DIR"
    exit 1
  fi
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
# Gmail SMTP defaults stay on 587/STARTTLS so common cloud hosts can reach Gmail reliably.
THREEDVR_GMAIL_SMTP_HOST=smtp.gmail.com
THREEDVR_GMAIL_SMTP_PORT=587
THREEDVR_GMAIL_SMTP_SECURE=false
THREEDVR_GMAIL_SMTP_REQUIRE_TLS=true
# Optional outreach defaults for form fills and direct replies.
THREEDVR_OUTREACH_PHONE=
THREEDVR_OUTREACH_POSTAL_ADDRESS=
GMAIL_APP_PASSWORD=
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
  log "Installing the 3dvr agent from the portal monorepo"
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
