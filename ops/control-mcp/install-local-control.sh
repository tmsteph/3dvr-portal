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

cat > /usr/local/sbin/3dvr-secret-bootstrap <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'root required' >&2; exit 77; }
key=${1:-}
[[ "$key" == "OPENAI_ADMIN_KEY" ]] || { echo 'unsupported bootstrap secret' >&2; exit 64; }
exec /usr/bin/node -e '
const fs = require("fs");
const key = process.argv[1];
let value = fs.readFileSync(0, "utf8").trim();
if (key !== "OPENAI_ADMIN_KEY") process.exit(64);
if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(value)) process.exit(65);
const { OpenBaoBackend } = require("/opt/3dvr/secrets-broker/openbao.js");
const backend = new OpenBaoBackend();
backend.create({ key, value, sourceId: "human-handoff-bootstrap" });
value = "";
process.stdout.write(JSON.stringify({ ok: true, stored: true, key, backend: "openbao" }) + "\n");
' "$key"
EOF
chown root:root /usr/local/sbin/3dvr-secret-bootstrap
chmod 0750 /usr/local/sbin/3dvr-secret-bootstrap

cat > /usr/local/sbin/3dvr-secret-store <<EOF
#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'root required' >&2; exit 77; }
exec "$NODE_BIN" -e '
const fs = require("fs");
const text = (value, max = 1000) => String(value == null ? "" : value).trim().slice(0, max);
let raw = "";
try {
  raw = fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw || "{}");
  const key = text(payload.key, 500);
  let value = typeof payload.value === "string" ? payload.value : "";
  const sourceId = text(payload.sourceId || "secure-stdin", 500);
  if (!/^[A-Za-z][A-Za-z0-9_.:/-]{1,127}$/.test(key)) throw new Error("invalid secret key");
  if (!value || Buffer.byteLength(value, "utf8") > 64 * 1024) throw new Error("invalid secret value");
  const { OpenBaoBackend } = require("/opt/3dvr/secrets-broker/openbao.js");
  const backend = new OpenBaoBackend();
  if (!backend.ready()) throw new Error("OpenBao backend is not configured");
  const stored = backend.create({ key, value, sourceId });
  value = "";
  raw = "";
  process.stdout.write(JSON.stringify({ ok: true, stored: true, key: stored.key, id: stored.id, backend: stored.backend }) + "\\n");
} catch (error) {
  raw = "";
  process.stderr.write(JSON.stringify({ ok: false, error: text(error?.message || error, 500) }) + "\\n");
  process.exitCode = 1;
}
'
EOF
chown root:root /usr/local/sbin/3dvr-secret-store
chmod 0750 /usr/local/sbin/3dvr-secret-store

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
%threedvr-agents ALL=(root) NOPASSWD: /usr/local/sbin/3dvr-secret-bootstrap OPENAI_ADMIN_KEY
%threedvr-agents ALL=(root) NOPASSWD: /usr/local/sbin/3dvr-secret-store
SUDOERS
chmod 0440 /etc/sudoers.d/3dvr-control-mcp
visudo -cf /etc/sudoers.d/3dvr-control-mcp >/dev/null

echo '3DVR local control MCP installed.'
echo 'Read-only: 3dvr-control-mcp-readonly'
echo 'Privileged policy: sudo -n /usr/local/libexec/3dvr-control-mcp-root'
