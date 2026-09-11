#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run with sudo: sudo bash ops/secrets-broker/install.sh" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="$ROOT/apps/agent/thomas-agent/node"
ETC=/etc/3dvr/secrets-broker
OPT=/opt/3dvr/secrets-broker
PORTAL_TOKEN="$ETC/portal.token"
AGENT_TOKEN=/home/debian/.3dvr/secrets-broker/agent.token
AGENTS="$ETC/agents.json"

getent group threedvr-agents >/dev/null || groupadd --system threedvr-agents
getent group threedvr-secrets >/dev/null || groupadd --system threedvr-secrets
id threedvr-secrets >/dev/null 2>&1 || useradd --system --gid threedvr-secrets --groups threedvr-agents --home /nonexistent --shell /usr/sbin/nologin threedvr-secrets
usermod -a -G threedvr-agents threedvr-secrets
if id debian >/dev/null 2>&1; then usermod -a -G threedvr-agents debian; fi

install -d -o root -g threedvr-secrets -m 0750 "$ETC"
install -d -o root -g root -m 0755 "$OPT"
install -m 0755 "$SOURCE/secrets-broker-server.js" "$OPT/secrets-broker-server.js"
install -m 0755 "$SOURCE/secrets-broker-admin.js" "$OPT/secrets-broker-admin.js"
install -m 0644 "$SOURCE/secrets-broker.js" "$OPT/secrets-broker.js"
if [[ ! -f "$ETC/policy.json" ]]; then
  install -o root -g threedvr-secrets -m 0640 "$ROOT/ops/secrets-broker/policy.example.json" "$ETC/policy.json"
fi
node - "$ETC/policy.json" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
policy.backends ||= {};
policy.backends.bitwarden ||= { type: 'bitwarden-secrets-manager', binary: '/usr/local/bin/bws', timeoutMs: 15000 };
policy.secrets ||= {};
policy.secrets['bitwarden.writer'] ||= { backend: 'bitwarden', write: { projectName: '3dvr Agent', capability: 'secret.write', scopes: ['secrets:3dvr-agent'], approval: { mode: 'auto' } } };
fs.writeFileSync(file, `${JSON.stringify(policy, null, 2)}\n`);
NODE
chown root:threedvr-secrets "$ETC/policy.json"
chmod 0640 "$ETC/policy.json"
if [[ ! -f "$ETC/bitwarden.env" ]]; then
  printf '%s\n' '# BWS_ACCESS_TOKEN is handed off locally, never through chat or source control.' '# BWS_ACCESS_TOKEN=' > "$ETC/bitwarden.env"
  chown root:threedvr-secrets "$ETC/bitwarden.env"
  chmod 0640 "$ETC/bitwarden.env"
fi
if [[ ! -f "$AGENTS" ]]; then
  printf '{"version":1,"agents":{}}\n' > "$AGENTS"
  chown root:threedvr-secrets "$AGENTS"
  chmod 0640 "$AGENTS"
fi

ADMIN=(node "$OPT/secrets-broker-admin.js")
if [[ ! -f "$PORTAL_TOKEN" ]]; then
  "${ADMIN[@]}" provision portal-owner-ui --registry "$AGENTS" --token-file "$PORTAL_TOKEN" --capabilities broker.admin --scopes 'broker:*' --label '3DVR owner portal' >/dev/null
fi
node - "$AGENTS" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
const agent = registry.agents?.['portal-owner-ui'];
if (!agent) throw new Error('portal-owner-ui is missing');
agent.capabilities = [...new Set([...(agent.capabilities || []), 'broker.admin', 'secret.write'])];
agent.scopes = [...new Set([...(agent.scopes || []), 'broker:*', 'secrets:3dvr-agent'])];
fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);
NODE
chown root:root "$PORTAL_TOKEN"
chmod 0600 "$PORTAL_TOKEN"
chown root:threedvr-secrets "$AGENTS"
chmod 0640 "$AGENTS"

if id debian >/dev/null 2>&1 && [[ ! -f "$AGENT_TOKEN" ]]; then
  install -d -o debian -g debian -m 0700 "$(dirname "$AGENT_TOKEN")"
  "${ADMIN[@]}" provision ovh-orchestrator --registry "$AGENTS" --token-file "$AGENT_TOKEN" --capabilities broker.status --scopes broker:status --label 'OVH agent orchestrator' >/dev/null
  chown debian:debian "$AGENT_TOKEN"
  chmod 0600 "$AGENT_TOKEN"
  chown root:threedvr-secrets "$AGENTS"
  chmod 0640 "$AGENTS"
fi

BWS_SOURCE="${BWS_SOURCE:-}"
if [[ -z "$BWS_SOURCE" && -x /home/debian/.local/bin/bws ]]; then BWS_SOURCE=/home/debian/.local/bin/bws; fi
if [[ -n "$BWS_SOURCE" && -x "$BWS_SOURCE" ]]; then
  install -m 0755 "$BWS_SOURCE" /usr/local/bin/bws
fi

install -o root -g root -m 0644 "$ROOT/ops/secrets-broker/3dvr-secrets-broker.service" /etc/systemd/system/3dvr-secrets-broker.service
cat > "$ETC/portal.env" <<ENV
THREEDVR_SECRETS_BROKER_SOCKET=/run/3dvr-secrets-broker/broker.sock
THREEDVR_SECRETS_BROKER_TOKEN_FILE=$PORTAL_TOKEN
ENV
chown root:root "$ETC/portal.env"
chmod 0600 "$ETC/portal.env"

systemctl daemon-reload
systemctl enable 3dvr-secrets-broker.service >/dev/null
systemctl restart 3dvr-secrets-broker.service
for _ in $(seq 1 50); do
  [[ -S /run/3dvr-secrets-broker/broker.sock ]] && break
  sleep 0.1
done
[[ -S /run/3dvr-secrets-broker/broker.sock ]] || { echo "Secrets broker socket did not become ready." >&2; exit 1; }
systemctl --no-pager --full status 3dvr-secrets-broker.service | sed -n '1,16p'
echo "3DVR Secrets Broker installed. Bitwarden remains fail-closed until BWS_ACCESS_TOKEN is set locally."
