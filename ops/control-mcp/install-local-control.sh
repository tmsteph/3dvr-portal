#!/usr/bin/env bash
set -euo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST=/opt/3dvr/local-control
NODE_BIN=${THREEDVR_NODE_BIN:-$(command -v node)}
NPM_BIN=${THREEDVR_NPM_BIN:-$(command -v npm)}

"$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22 || (a===22 && b>=13) ? 0 : 1)' \
  || { echo 'Node >=22.13 is required.' >&2; exit 3; }

getent group threedvr-agents >/dev/null || groupadd --system threedvr-agents
install -d -o root -g root -m 0755 "$DEST/mcp" "$DEST/connectors/control" "$DEST/connectors/audit" /usr/local/libexec
install -d -o root -g threedvr-agents -m 0770 /var/lib/3dvr/control-workspace
install -d -o root -g threedvr-agents -m 0770 /var/log/3dvr-control-mcp

install -o root -g root -m 0644 "$ROOT/apps/agent/mcp/local-control.js" "$DEST/mcp/local-control.js"
install -o root -g root -m 0644 "$ROOT/apps/agent/connectors/control/local-machine.js" "$DEST/connectors/control/local-machine.js"
install -o root -g root -m 0644 "$ROOT/apps/agent/connectors/audit/log.js" "$DEST/connectors/audit/log.js"
install -o root -g root -m 0755 "$ROOT/ops/control-mcp/3dvr-control-service" /usr/local/sbin/3dvr-control-service

cat > "$DEST/package.json" <<'JSON'
{"private":true,"dependencies":{"@modelcontextprotocol/sdk":"^1.30.0","zod":"^4.6.2"}}
JSON
"$NPM_BIN" --prefix "$DEST" install --omit=dev --no-audit --no-fund >/dev/null

cat > /usr/local/bin/3dvr-control-mcp-readonly <<EOF
#!/usr/bin/env bash
set -euo pipefail
unset THREEDVR_CONTROL_ENABLE_MUTATIONS
exec "$NODE_BIN" "$DEST/mcp/local-control.js"
EOF
chmod 0755 /usr/local/bin/3dvr-control-mcp-readonly

cat > /usr/local/libexec/3dvr-control-mcp-root <<EOF
#!/usr/bin/env bash
set -euo pipefail
export THREEDVR_CONTROL_ENABLE_MUTATIONS=true
export THREEDVR_CONTROL_FILE_ROOTS=/var/lib/3dvr/control-workspace,/var/log/3dvr-control-mcp
export THREEDVR_CONTROL_SERVICES=3dvr-personal-mcp.service,3dvr-secrets-broker.service,3dvr-self-host-portal.service,openbao.service
export THREEDVR_CONTROL_SERVICE_HELPER=/usr/local/sbin/3dvr-control-service
export THREEDVR_CONNECTOR_AUDIT_FILE=/var/log/3dvr-control-mcp/audit.ndjson
exec "$NODE_BIN" "$DEST/mcp/local-control.js"
EOF
chown root:root /usr/local/libexec/3dvr-control-mcp-root
chmod 0755 /usr/local/libexec/3dvr-control-mcp-root

cat > /etc/sudoers.d/3dvr-control-mcp <<'SUDOERS'
%threedvr-agents ALL=(root) NOPASSWD: /usr/local/libexec/3dvr-control-mcp-root
SUDOERS
chmod 0440 /etc/sudoers.d/3dvr-control-mcp
visudo -cf /etc/sudoers.d/3dvr-control-mcp >/dev/null

echo '3DVR local control MCP installed.'
echo 'Read-only: 3dvr-control-mcp-readonly'
echo 'Privileged policy: sudo -n /usr/local/libexec/3dvr-control-mcp-root'
