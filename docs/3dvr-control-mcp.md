# 3DVR Control MCP

## Status

Implemented v0.3 local control boundary. Network-facing machine mutation is intentionally not part of v0.3.

## Decision

`3dvr-control-mcp` is kernel-adjacent, not kernel-entangled.

The 3DVR kernel defines stable capabilities and policy expectations. The control MCP is a replaceable implementation. This keeps the kernel portable while giving Astra, Codex, CLI clients, and future agents one first-party control interface.

## Architecture

```text
Astra / Codex / MCP client
          |
     MCP over stdio
          |
  3DVR Local Control MCP
          |
   Unix / systemd / files

remote machine: use SSH as the transport that launches stdio MCP

Secrets remain separate:
OpenBao / OpenBao Agent -> workload
```

Desktop Commander and Bitwarden are compatibility tools, not control-plane dependencies.

## Implemented in v0.3

- `apps/agent/mcp/local-control.js` — standards-based stdio MCP server.
- `apps/agent/connectors/control/local-machine.js` — reusable host, systemd, filesystem, and approved-command primitives.
- `apps/agent/test/control-local.test.js` — confinement and default-deny tests.
- `npm run mcp:local-control` — local entrypoint.

The MCP currently exposes read-only tools:

- `host_status`
- `service_status`
- `file_list`
- `file_read`

The underlying control module already has guarded mutation primitives (`serviceAction`, `fileWrite`, and policy-id command execution), but v0.3 does not expose them on the network-facing gateway. Mutations default off and require explicit policy.

## Remote transport

Do not invent another session service when SSH already solves authenticated transport.

A client that supports command/stdio MCP can launch the server on a remote node with an SSH command equivalent to:

```bash
ssh -T 3dvr-ovh 'cd /path/to/3dvr-portal/apps/agent && npm run mcp:local-control'
```

This keeps authentication, host keys, revocation, and break-glass access in standard SSH rather than a custom browser authorization flow.

## Kernel contract

The kernel capability vocabulary remains broader than the v0.3 exposure:

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

A specific MCP implementation may expose only a safe subset.

## Policy

`THREEDVR_CONTROL_FILE_ROOTS` is a comma-separated allowlist of filesystem roots.

`THREEDVR_CONTROL_SERVICES` is a comma-separated allowlist of systemd services.

`THREEDVR_CONTROL_ENABLE_MUTATIONS` defaults to false.

`THREEDVR_CONTROL_COMMANDS_FILE` points to a JSON map of approved command IDs. Commands are selected by ID; callers do not submit shell strings or executable paths.

## Secrets

Do not build custom cryptography or a custom encrypted database.

OpenBao is the canonical machine-secrets direction. The MCP should be secret-blind by default: secret values should flow from OpenBao/OpenBao Agent directly into workloads, not through an AI transcript. The current `connectors/secrets/openbao.js` is only a backend marker while that runtime integration is provisioned.

Bitwarden can remain a human recovery/password vault during migration, but runtime automation should stop depending on its UI or interactive authorization flow.

## Security rules

1. Prefer stdio MCP plus SSH over a new privileged internet-facing daemon.
2. Default deny mutation.
3. Resolve filesystem paths against explicit roots and real paths.
4. Allowlist systemd units.
5. Never accept arbitrary shell strings from an MCP caller.
6. Keep secret values out of MCP responses and audit logs.
7. Preserve plain SSH as break-glass access.

## Next milestones

1. Deploy/configure the local MCP on OVH, Hetzner, and DigitalOcean checkouts.
2. Add a client profile that launches each node over SSH stdio.
3. Provision OpenBao separately and migrate runtime secrets out of Bitwarden.
4. Use OpenBao Agent or narrow workload wrappers for secret injection without returning values to the model.
5. Promote selected mutation capabilities only after the local policy/helper path is verified.
6. Retire Desktop Commander as a control-plane dependency.

## Principle

The kernel describes what a trusted agent may do. The local Control MCP translates that vocabulary to boring Unix primitives. SSH transports it between machines. OpenBao protects credentials. None of these layers should require a GUI to keep working.
