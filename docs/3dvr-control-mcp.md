# 3DVR Control MCP

## Status

Proposed canonical control boundary for 3DVR infrastructure.

## Decision

`3dvr-control-mcp` is kernel-adjacent, not kernel-entangled.

The 3DVR kernel defines stable capabilities and policy expectations. The control MCP is one replaceable implementation of those capabilities. This keeps the kernel portable while still giving ChatGPT, Astra, Codex, CLI clients, and future agents one first-party machine-control interface.

## Architecture

```text
ChatGPT / Astra / Codex / CLI
            |
       3DVR Control MCP
            |
   +--------+---------+
   |        |         |
 servers   files    browser
 SSH       Unix      CDP
 systemd   tools
            |
      Secrets Adapter
            |
         OpenBao
```

Desktop Commander and Bitwarden are compatibility tools, not control-plane dependencies.

## Kernel contract

The kernel should define capability families, not a concrete daemon:

- `host.status`
- `host.exec`
- `service.status`
- `service.start`
- `service.stop`
- `service.restart`
- `file.read`
- `file.write`
- `file.list`
- `browser.status`
- `browser.navigate`
- `secret.get`
- `secret.put`
- `secret.list`
- `secret.delete`
- `audit.list`

Each implementation must enforce policy, emit audit events, avoid returning secrets unless explicitly requested, and support least-privilege machine identities.

## Secrets

Do not build custom cryptography or a custom encrypted database.

Use OpenBao as the canonical machine secrets backend. The existing 3DVR secrets broker can become a compatibility/policy adapter during migration, then shrink or disappear once clients speak through the Control MCP.

Bitwarden remains suitable for human-managed passwords, recovery material, and personal vault use, but production/runtime automation should not depend on its UI or interactive authorization flow.

## Control transport

Prefer boring, inspectable primitives underneath the MCP:

- SSH for remote host access
- systemd for services and resource controls
- Unix sockets for local privileged boundaries
- standard filesystem operations for files
- CDP/WebDriver-compatible browser control where needed

The MCP server translates stable capability calls into those primitives.

## Security model

1. Control MCP runs as an unprivileged service account.
2. Privileged actions are delegated through narrow helpers or policy-controlled sudo rules.
3. Secrets are fetched just-in-time from OpenBao and are not written to logs.
4. Every mutating action emits an audit record.
5. Capability policy is independent of client UI.
6. Recovery access remains possible through plain SSH even if the MCP layer is unavailable.

## Migration

### Phase 1 — boundary

Introduce `3dvr-control-mcp` and route new automation through it.

### Phase 2 — secrets

Add an OpenBao-backed secrets adapter and migrate runtime secrets away from Bitwarden Secrets Manager.

### Phase 3 — machine control

Move recurring Desktop Commander-dependent operations to SSH/systemd/files/browser tools exposed by the MCP.

### Phase 4 — compatibility only

Keep Desktop Commander and Bitwarden integrations only where they are genuinely useful to humans or third-party clients.

## Principle

The kernel describes what a trusted agent may do. The Control MCP decides how to do it on a machine. The secrets backend protects credentials. None of those layers should require a GUI to stay operational.
