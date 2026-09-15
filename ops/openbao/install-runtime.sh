#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'Run with sudo.' >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
command -v bao >/dev/null || { echo 'OpenBao CLI is not installed.' >&2; exit 3; }
command -v jq >/dev/null || { echo 'jq is required.' >&2; exit 3; }

install -d -o openbao -g openbao -m 0750 /var/lib/openbao/raft
install -d -o root -g root -m 0755 /usr/local/lib/3dvr /opt/3dvr/secrets-broker
install -d -o root -g root -m 0755 /etc/openbao

if [[ -f /etc/openbao/openbao.hcl && ! -f /etc/openbao/openbao.hcl.pre-3dvr ]]; then
  cp -a /etc/openbao/openbao.hcl /etc/openbao/openbao.hcl.pre-3dvr
fi
install -o root -g openbao -m 0640 "$ROOT/ops/openbao/openbao.hcl" /etc/openbao/openbao.hcl
install -o root -g root -m 0755 "$ROOT/ops/openbao/bootstrap.sh" /usr/local/sbin/3dvr-openbao-bootstrap
install -o root -g root -m 0755 "$ROOT/ops/openbao/unseal.sh" /usr/local/sbin/3dvr-openbao-unseal
install -o root -g root -m 0755 "$ROOT/scripts/ops/migrate-bws-to-openbao.mjs" /usr/local/lib/3dvr/migrate-bws-to-openbao.mjs
install -o root -g root -m 0644 "$ROOT/ops/openbao/3dvr-openbao-unseal.service" /etc/systemd/system/3dvr-openbao-unseal.service

# Keep the installed broker self-contained; source-tree imports are not available under /opt.
install -o root -g root -m 0644 "$ROOT/apps/agent/connectors/secrets/openbao.js" /opt/3dvr/secrets-broker/openbao.js
install -o root -g root -m 0755 "$ROOT/apps/agent/thomas-agent/node/secrets-broker-server.js" /opt/3dvr/secrets-broker/secrets-broker-server.js

systemctl daemon-reload
systemctl enable openbao.service >/dev/null
systemctl enable 3dvr-openbao-unseal.service >/dev/null
if ! systemctl is-active --quiet openbao.service; then
  systemctl start openbao.service
fi
if systemctl is-active --quiet 3dvr-secrets-broker.service; then
  systemctl restart 3dvr-secrets-broker.service
fi

printf 'openbao_service='; systemctl is-active openbao.service
printf 'openbao_initialized='; BAO_ADDR=http://127.0.0.1:8200 bao status -format=json 2>/dev/null | jq -r '.initialized' || echo false
if [[ -S /run/3dvr-secrets-broker/broker.sock ]]; then
  printf 'broker_health='; curl -fsS --unix-socket /run/3dvr-secrets-broker/broker.sock http://localhost/health; echo
fi

echo 'Runtime installed. Run /usr/local/sbin/3dvr-openbao-bootstrap once to initialize, migrate, and switch the broker.'
