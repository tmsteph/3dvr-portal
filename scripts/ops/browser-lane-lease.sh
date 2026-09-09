#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage:
  browser-lane-lease.sh acquire <lane> <owner> [ttl-seconds]
  browser-lane-lease.sh renew <lane> <token> [ttl-seconds]
  browser-lane-lease.sh release <lane> <token>
  browser-lane-lease.sh status [lane]

Lanes: general, encore, messaging, training
USAGE
  exit 64
}

state_dir="${THREEDVR_BROWSER_LEASE_DIR:-/run/lock/3dvr-browser-lanes}"
default_ttl="${THREEDVR_BROWSER_LEASE_TTL:-900}"
action="${1:-}"

valid_lane() {
  case "$1" in
    general|encore|messaging|training) return 0 ;;
    *) return 1 ;;
  esac
}

valid_uint() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

validate_field() {
  local value="$1"
  [ -n "$value" ] && [[ "$value" != *$'\n'* ]] && [[ "$value" != *$'\t'* ]]
}

prepare_state() {
  if ! mkdir -p "$state_dir" 2>/dev/null; then
    echo "Cannot create $state_dir; run through sudo or set THREEDVR_BROWSER_LEASE_DIR." >&2
    exit 73
  fi
  exec 9>>"$state_dir/.mutex"
  flock -x 9
}

read_lease() {
  current_owner=""
  current_token=""
  current_expires="0"
  [ -f "$lease_file" ] || return 1
  IFS=$'\t' read -r current_owner current_token current_expires < "$lease_file" || return 1
  valid_uint "$current_expires" || current_expires=0
  return 0
}

lease_is_live() {
  [ "$current_expires" -gt "$(date +%s)" ]
}

write_lease() {
  local owner="$1" token="$2" expires="$3" temp
  temp="$state_dir/.${lane}.$$.$RANDOM"
  printf '%s\t%s\t%s\n' "$owner" "$token" "$expires" > "$temp"
  chmod 600 "$temp"
  mv -f "$temp" "$lease_file"
}

new_token() {
  if [ -r /proc/sys/kernel/random/uuid ]; then
    cat /proc/sys/kernel/random/uuid
  else
    printf '%s-%s-%s\n' "$(date +%s%N)" "$$" "$RANDOM"
  fi
}

status_one() {
  lane="$1"
  lease_file="$state_dir/$lane.lease"
  if read_lease && lease_is_live; then
    local now remaining
    now="$(date +%s)"
    remaining=$((current_expires - now))
    printf 'lane=%s state=leased owner=%s expires=%s remaining=%ss\n' "$lane" "$current_owner" "$current_expires" "$remaining"
  else
    rm -f "$lease_file"
    printf 'lane=%s state=free\n' "$lane"
  fi
}

case "$action" in
  acquire)
    [ "$#" -ge 3 ] && [ "$#" -le 4 ] || usage
    lane="$2"; owner="$3"; ttl="${4:-$default_ttl}"
    valid_lane "$lane" && validate_field "$owner" && valid_uint "$ttl" || usage
    prepare_state
    lease_file="$state_dir/$lane.lease"
    if read_lease && lease_is_live && [ "$current_owner" != "$owner" ]; then
      echo "Browser lane '$lane' is busy: owner=$current_owner expires=$current_expires" >&2
      exit 75
    fi
    if [ "$current_owner" = "$owner" ] && lease_is_live; then
      token="$current_token"
    else
      token="$(new_token)"
    fi
    expires=$(($(date +%s) + ttl))
    write_lease "$owner" "$token" "$expires"
    printf '%s\n' "$token"
    ;;
  renew)
    [ "$#" -ge 3 ] && [ "$#" -le 4 ] || usage
    lane="$2"; token="$3"; ttl="${4:-$default_ttl}"
    valid_lane "$lane" && validate_field "$token" && valid_uint "$ttl" || usage
    prepare_state
    lease_file="$state_dir/$lane.lease"
    read_lease && lease_is_live || { echo "Browser lane '$lane' has no live lease." >&2; exit 76; }
    [ "$current_token" = "$token" ] || { echo "Browser lane '$lane' lease token does not match." >&2; exit 77; }
    expires=$(($(date +%s) + ttl))
    write_lease "$current_owner" "$current_token" "$expires"
    printf '%s\n' "$expires"
    ;;
  release)
    [ "$#" -eq 3 ] || usage
    lane="$2"; token="$3"
    valid_lane "$lane" && validate_field "$token" || usage
    prepare_state
    lease_file="$state_dir/$lane.lease"
    read_lease || exit 0
    [ "$current_token" = "$token" ] || { echo "Browser lane '$lane' lease token does not match." >&2; exit 77; }
    rm -f "$lease_file"
    ;;
  status)
    [ "$#" -le 2 ] || usage
    prepare_state
    if [ "$#" -eq 2 ]; then
      valid_lane "$2" || usage
      status_one "$2"
    else
      for item in general encore messaging training; do status_one "$item"; done
    fi
    ;;
  *) usage ;;
esac
