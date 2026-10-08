#!/usr/bin/env bash
set -euo pipefail

origin="${1:-https://portal.3dvr.tech}"
expected_sha="${2:-}"
path="${3:-/}"
marker="${4:-}"

origin="${origin%/}"
[[ "$path" == /* ]] || path="/$path"

health="$(curl -fsS --max-time 15 "$origin/__3dvr-health")"
actual_sha="$(printf '%s' "$health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);if(!x.ok)process.exit(2);process.stdout.write(String(x.sha||""))})')"

if [ -n "$expected_sha" ] && [ "$actual_sha" != "$expected_sha" ]; then
  echo "ERROR: canonical health SHA $actual_sha != expected $expected_sha" >&2
  exit 3
fi

headers="$(mktemp)"
body="$(mktemp)"
trap 'rm -f "$headers" "$body"' EXIT
curl -fsS --max-time 15 -D "$headers" "$origin$path" -o "$body"

server="$(awk 'BEGIN{IGNORECASE=1} /^server:/{sub(/^[^:]+:[[:space:]]*/,""); sub(/\r$/,""); print; exit}' "$headers")"
if [ -n "$marker" ] && ! grep -Fq -- "$marker" "$body"; then
  echo "ERROR: canonical $path does not contain expected marker: $marker" >&2
  exit 4
fi

printf 'CANONICAL_ORIGIN=%s\n' "$origin"
printf 'CANONICAL_SERVER=%s\n' "${server:-unknown}"
printf 'CANONICAL_HEALTH_SHA=%s\n' "$actual_sha"
printf 'CANONICAL_PATH=%s\n' "$path"
if [ -n "$marker" ]; then
  printf 'CANONICAL_MARKER=%s\n' "$marker"
fi
printf 'CANONICAL_VERIFY=ok\n'
