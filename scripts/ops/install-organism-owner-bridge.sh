#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" != 0 ]; then
  echo 'install-organism-owner-bridge.sh must run as root.' >&2
  exit 2
fi

portal_root="${THREEDVR_PORTAL_PRODUCTION_DIR:-/opt/3dvr-portal-production}/current"
bridge_port="${THREEDVR_ORGANISM_BRIDGE_PORT:-4321}"
bridge_host=127.0.0.1
remote_script="${THREEDVR_ORGANISM_REMOTE_SCRIPT:-/home/debian/services/3dvr-portal-organism/apps/agent/thomas-agent/node/digital-organism-bridge.js}"
state_dir=/var/lib/3dvr
log_file="$state_dir/organism-bridge-tunnel.log"

[ -f "$portal_root/scripts/organism-bridge-server.mjs" ] || {
  echo "Portal release is missing Organism bridge server: $portal_root" >&2
  exit 3
}

cloudflared="$(command -v cloudflared || true)"
[ -n "$cloudflared" ] || { echo 'cloudflared is required for the private Organism bridge.' >&2; exit 4; }

mkdir -p "$state_dir"
touch "$log_file"
chmod 600 "$log_file"

ssh -o BatchMode=yes -o ConnectTimeout=8 3dvr-ovh node "$remote_script" health >/tmp/3dvr-organism-ovh-health.json
node -e 'const fs=require("node:fs"); const x=JSON.parse(fs.readFileSync("/tmp/3dvr-organism-ovh-health.json","utf8")); if(!x.ok) process.exit(1)'
rm -f /tmp/3dvr-organism-ovh-health.json

cat > /etc/systemd/system/3dvr-organism-owner-bridge.service <<EOF
[Unit]
Description=3DVR Digital Organism owner bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$portal_root
Environment=NODE_ENV=production
Environment=THREEDVR_ORGANISM_BRIDGE_HOST=$bridge_host
Environment=THREEDVR_ORGANISM_BRIDGE_PORT=$bridge_port
Environment=THREEDVR_ORGANISM_SSH_HOST=3dvr-ovh
Environment=THREEDVR_ORGANISM_REMOTE_SCRIPT=$remote_script
ExecStart=/usr/bin/env node $portal_root/scripts/organism-bridge-server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/3dvr-organism-owner-bridge-tunnel.service <<EOF
[Unit]
Description=Cloudflare quick tunnel for 3DVR Digital Organism owner bridge
After=3dvr-organism-owner-bridge.service
Requires=3dvr-organism-owner-bridge.service

[Service]
Type=simple
ExecStart=$cloudflared tunnel --no-autoupdate --url http://$bridge_host:$bridge_port
Restart=always
RestartSec=5
StandardOutput=append:$log_file
StandardError=append:$log_file
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now 3dvr-organism-owner-bridge.service
systemctl restart 3dvr-organism-owner-bridge.service

for _ in $(seq 1 20); do
  if curl -fsS "http://$bridge_host:$bridge_port/health" >/tmp/3dvr-organism-bridge-health.json 2>/dev/null; then
    break
  fi
  sleep 0.5
done
node -e 'const fs=require("node:fs"); const x=JSON.parse(fs.readFileSync("/tmp/3dvr-organism-bridge-health.json","utf8")); if(!x.ok) process.exit(1)'
rm -f /tmp/3dvr-organism-bridge-health.json

: > "$log_file"
systemctl enable --now 3dvr-organism-owner-bridge-tunnel.service
systemctl restart 3dvr-organism-owner-bridge-tunnel.service

bridge_url=''
for _ in $(seq 1 80); do
  bridge_url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$log_file" | tail -n1 || true)"
  if [ -n "$bridge_url" ] && curl -fsS --retry 2 --retry-delay 1 "$bridge_url/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if [ -z "$bridge_url" ]; then
  echo 'Cloudflare did not publish an Organism bridge URL.' >&2
  tail -n 80 "$log_file" >&2 || true
  exit 5
fi

curl -fsS --retry 4 --retry-delay 1 "$bridge_url/health" >/dev/null
printf 'PORTAL_ORGANISM_BRIDGE_URL=%s\n' "$bridge_url"
