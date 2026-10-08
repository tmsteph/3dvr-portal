# Operator Agent Extension Architecture

Status: proposal — 2026-10-08

## Goal
Build an open, provider-neutral extension system for 3DVR Operator, borrowing ideas from Claude Code Mods and Codex's skills, MCP, hooks, and SDK. Operator remains the primary interface; integrations should not force users into other apps.

## Extension layers
1. **Instructions and skills:** portable workflows and AGENTS.md-style project conventions.
2. **Tools and MCP:** capability discovery, scoped credentials, explicit tool schemas, and audit logging.
3. **Lifecycle hooks:** before/after model requests, tool execution, deployment, and session transitions.
4. **Policy middleware:** allow, deny, request approval, redact, retry, or route actions. Security must be enforced server-side, not solely by prompt instructions.
5. **UI contributions:** mobile-first Operator panels, status widgets, and chat actions, rendered from validated schemas.
6. **Provider adapters:** Codex, Claude, and local models expose their supported features through one Operator interface; unsupported features degrade gracefully.

## Design principles
- Server-first, open-source, self-hostable, provider-neutral.
- Least privilege, explicit consent, revocable capabilities, isolated execution for untrusted extensions.
- No arbitrary extension access to host shell, Docker socket, production credentials, or other tenants.
- Human approval for consequential operations, especially messaging clients and modifying production.
- Observable: extension ID, version, inputs/outputs (redacted), approvals, errors, and rollback.
- Extensions are versioned, testable, removable, and disabled by default until trusted.

## Proposed manifest
```json
{
  "id": "tech.3dvr.deploy-guardian",
  "version": "0.1.0",
  "runtime": "isolated-worker",
  "hooks": ["before_tool_call", "after_tool_call"],
  "capabilities": ["deploy:read", "deploy:request_approval"],
  "ui": ["deployment-status"]
}
```

## Initial proof of concept: Deployment Guardian
- Display self-hosted Portal deployment state in Operator.
- Detect stale main versus production and summarize validation failures.
- Require approval before promotion or rollback; never silently deploy.
- Test denial, expired authorization, replay, and extension failure paths.

## Roadmap
1. Inventory Codex/Claude extension APIs against current documentation and confirm actual hook/SDK capabilities; do not assume parity.
2. Define typed extension manifest and capability registry.
3. Implement sandboxed hook runner with deterministic ordering, timeouts, and audit logs.
4. Build one read-only Deployment Guardian extension and mobile UI panel.
5. Add policy approval flow and automated security tests.
6. Publish developer documentation and sample extensions.

## Research note
Claude Code Mods and Codex extension surfaces evolve rapidly. Treat feature comparisons as directional until verified against official current docs. The Operator extension API is a proposed 3DVR design, not an existing shipped feature.
