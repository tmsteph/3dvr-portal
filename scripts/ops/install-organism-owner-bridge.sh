#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" != 0 ]; then
  echo 'install-organism-owner-bridge.sh must run as root.' >&2
  exit 2
fi

portal_base="${THREEDVR_PORTAL_PRODUCTION_DIR:-/opt/3dvr-portal-production}"
portal_root="$portal_base/current"
portal_port="${THREEDVR_PORTAL_PORT:-4320}"
remote_script="${THREEDVR_ORGANISM_REMOTE_SCRIPT:-/home/debian/services/3dvr-portal-organism/apps/agent/thomas-agent/node/digital-organism-bridge.js}"

[ -f "$portal_root/scripts/self-host-server.mjs" ] || {
  echo "Portal release is missing the integrated Organism bridge: $portal_root" >&2
  exit 3
}

# The self-host Portal owns /recall and reaches OVH over the existing SSH mesh.
# Verify that private hop before publishing any public relay address.
ssh -o BatchMode=yes -o ConnectTimeout=8 3dvr-ovh node "$remote_script" health >/tmp/3dvr-organism-ovh-health.json
node -e 'const fs=require("node:fs"); const x=JSON.parse(fs.readFileSync("/tmp/3dvr-organism-ovh-health.json","utf8")); if(!x.ok) process.exit(1)'
rm -f /tmp/3dvr-organism-ovh-health.json

health="$(curl -fsS "http://127.0.0.1:$portal_port/__3dvr-health")"
printf '%s' "$health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);if(!x.ok||x.organismRecall!=="signed-owner")process.exit(1)})'

# Reuse the Portal's already-running Cloudflare quick tunnel. Starting a second
# account-less tunnel on every deploy caused Cloudflare HTTP 429 rate limits.
tunnel_log="$portal_base/state/tunnel.log"
bridge_url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$tunnel_log" 2>/dev/null | tail -n1 || true)"
if [ -z "$bridge_url" ]; then
  echo 'The Portal public tunnel URL is not available yet.' >&2
  tail -n 40 "$tunnel_log" >&2 2>/dev/null || true
  exit 5
fi

printf 'PORTAL_ORGANISM_BRIDGE_URL=%s\n' "$bridge_url"
