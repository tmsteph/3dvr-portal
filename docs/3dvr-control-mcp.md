# 3DVR Control MCP

## Status

Canonical control plane as of 2026-09-20.

- **Hetzner gateway:** `3dvr-control-gateway` v0.3.0, Streamable HTTP MCP on loopback.
- **OVH privileged boundary:** `3dvr-local-control` v0.6.0, stdio MCP launched on demand.
- **Transport between them:** ordinary SSH that launches the OVH stdio MCP.
- **Secrets:** OpenBao on OVH. Secret values are not returned by MCP tools.
- **Desktop Commander:** bootstrap/debug/break-glass fallback only.

## Decision

`3dvr-control-mcp` is the first-party canonical developer and operations interface.

The 3DVR kernel defines stable capabilities and policy expectations. MCP servers are replaceable adapters around those capabilities. Routine operations should use typed MCP tools before arbitrary shell, browser automation, Termux, or proprietary remote-desktop tooling.

## Architecture

```text
ChatGPT / Codex / MCP client
            |
     Streamable HTTP MCP
            |
  3DVR Control Gateway
       (Hetzner)
            |
       MCP over SSH
            |
   3DVR Local Control MCP
          (OVH)
       /           \
 systemd/files    OpenBao
                     |
                     +--> n8n API key
                     +--> other runtime secrets
```

The gateway does not receive a general-purpose remote shell. It launches the allowlisted OVH stdio MCP and calls named tools.

## Gateway surface

Default tools remain read-only and include account, Gmail, CRM, GitHub, and server health operations.

When `THREEDVR_MCP_ENABLE_PRIVILEGED=true`, the gateway additionally exposes:

- `secret_status` — existence check only; never returns secret values.
- `secret_handoff` — creates a one-time encrypted browser handoff for human-supplied credentials.
- `n8n_status` — health and API-authorization check.
- `n8n_workflows` — safe workflow metadata only; omits nodes, credentials, and pinned data.
- `n8n_executions` — execution metadata with execution data omitted.
- `service_status` — status for an explicit systemd allowlist.
- `service_restart` — restart for the same explicit allowlist.

The current n8n target registry contains `cvw` and maps its credential to `CVW_N8N_API_KEY` in OpenBao. Additional targets can be supplied through `THREEDVR_N8N_TARGETS_JSON`.

## Local OVH surface

The local stdio MCP exposes bounded host/file/service reads plus the n8n and secret-status tools above.

Mutations are disabled by default. The privileged wrapper enables only the local policy and uses:

- `THREEDVR_CONTROL_FILE_ROOTS`
- `THREEDVR_CONTROL_SERVICES`
- `THREEDVR_CONTROL_SERVICE_HELPER`
- `THREEDVR_CONNECTOR_AUDIT_FILE`

Service changes go through `/usr/local/sbin/3dvr-control-service`; arbitrary systemd units are rejected.

## Secrets

OpenBao is the canonical machine-secret store.

Rules:

1. Do not put secret values in chat, MCP responses, logs, GitHub, or public registry data.
2. Do not expose a ChatGPT-facing `secret_store(value)` tool. A plaintext value passed as an MCP argument would defeat the design.
3. Human-provided credentials should enter through `secret_handoff` / the signed `/access/` UI.
4. Internal bootstrap/migration code may use the root-only `3dvr-secret-store` stdin helper. It returns only a storage receipt and is not a routine control-plane surface.
5. Workloads and API adapters resolve secret values locally on OVH and return sanitized results.

Bitwarden remains a recovery/human vault where configured, not the preferred runtime dependency.

## n8n privacy boundary

Tom/CVW workflow data is treated as client-confidential.

The gateway intentionally returns only bounded metadata:

- workflow id/name/active/archive/timestamps/tags;
- execution id/workflow/status/mode/timestamps/retry metadata.

It does **not** return workflow node definitions, credentials, pinned data, execution payloads, or node data. Any future expansion of client-data access must be explicit and separately reviewed.

## Remote transport

Do not invent another privileged internet-facing daemon when SSH already provides authentication, host keys, revocation, and routing.

The Hetzner connector launches OVH with the equivalent of:

```bash
ssh -T 3dvr-ovh sudo -n /usr/local/libexec/3dvr-control-mcp-root
```

and then speaks MCP over that stdio channel.

Plain SSH remains the break-glass path. It is transport/recovery infrastructure, not the routine user-facing API.

## Security rules

1. Prefer typed MCP tools over arbitrary shell.
2. Default deny mutation.
3. Keep privileged execution on OVH.
4. Allowlist systemd services and filesystem roots.
5. Never accept arbitrary shell strings from MCP callers.
6. Keep secret values out of MCP arguments, responses, and audit logs wherever possible.
7. Use encrypted handoff for human secrets.
8. Sanitize client-system data before it leaves OVH.
9. Preserve SSH and Desktop Commander only as recovery/bootstrap paths.
10. Audit mutations.

## Deployment

- `.github/workflows/control-mcp.yml` deploys the Hetzner gateway.
- `.github/workflows/local-control-sync.yml` deploys the OVH local MCP.
- `ops/control-mcp/install-local-control.sh` installs the OVH wrappers, policy helpers, and sudo boundary.
- `apps/agent/connectors/control/ovh-mcp.js` is the typed gateway-to-OVH MCP bridge.

The gateway is safe-by-default: `THREEDVR_MCP_ENABLE_PRIVILEGED` must be explicitly enabled on the trusted deployment.

## Operator order

For server/developer work:

1. 3DVR Control MCP typed tool.
2. First-party Control Bus / Open Runner when the MCP does not yet cover the operation.
3. Direct SSH for deliberate low-level maintenance.
4. Desktop Commander only for bootstrap, debug, or recovery.
5. Human checkpoint only when an external provider genuinely requires user presence.

When a fallback is used successfully, promote the repeated operation into a typed MCP capability rather than normalizing the workaround.

## Principle

The kernel describes what a trusted agent may do. MCP translates that vocabulary into narrow tools. SSH transports MCP between trusted machines. OpenBao protects credentials. Portal/Operator provides the human-facing ceremony.

The result should feel like one control plane, not a collection of hacks.
