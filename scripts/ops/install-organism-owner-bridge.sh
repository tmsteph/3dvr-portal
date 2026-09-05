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

# OVH is now the preferred portal/control host. When the Organism runtime is
# local, validate it directly; otherwise use the existing private SSH mesh.
if [ -f "$remote_script" ]; then
  node "$remote_script" health >/tmp/3dvr-organism-ovh-health.json
else
  ssh -o BatchMode=yes -o ConnectTimeout=8 3dvr-ovh node "$remote_script" health >/tmp/3dvr-organism-ovh-health.json
fi
node -e 'const fs=require("node:fs"); const x=JSON.parse(fs.readFileSync("/tmp/3dvr-organism-ovh-health.json","utf8")); if(!x.ok) process.exit(1)'
rm -f /tmp/3dvr-organism-ovh-health.json

health="$(curl -fsS "http://127.0.0.1:$portal_port/__3dvr-health")"
printf '%s' "$health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);if(!x.ok||x.organismRecall!=="signed-owner")process.exit(1)})'

# Keep one public quick tunnel alive across portal releases. Restarting an
# account-less tunnel on every deploy causes Cloudflare HTTP 429 rate limits.
tunnel_output="$(THREEDVR_PORTAL_PRODUCTION_DIR="$portal_base" THREEDVR_PORTAL_PORT="$portal_port" bash "$portal_root/scripts/ops/ensure-portal-public-tunnel.sh")"
printf '%s\n' "$tunnel_output"
bridge_url="$(printf '%s\n' "$tunnel_output" | sed -n 's/^PORTAL_ORGANISM_BRIDGE_URL=//p' | tail -n1)"
[ -n "$bridge_url" ] || { echo 'The persistent Portal public tunnel URL is unavailable.' >&2; exit 5; }
