# Client Scope Discipline

## Rule
Explicitly authorized scope is a hard boundary. Keep the current engagement separate from the preferred end-state architecture, even when the future design is safer, cleaner, or already planned.

## Decision test
Before staging or applying a client change, answer these separately:

1. What is authorized **now**?
2. What is merely recommended **later**?
3. What existing behavior must remain unchanged in this stage?
4. What evidence will prove only the authorized change occurred?

If documentation, code, or inferred architecture conflicts with the current scope, re-check scope first. Do not resolve the conflict by silently expanding the work or by asking the client to approve an assumption that came from us.

## 2026-09-11 precedent — Tom / n8n Phase 2
We correctly recognized webhook-only public exposure as a stronger future architecture, but staged that path restriction one phase too early. Tom's Phase 2 authorization was narrower: rebind n8n from public `:5678` to `127.0.0.1:5678`, close the public port, and verify closure externally on IPv4 and IPv6 while preserving current Caddy proxy behavior.

The `/webhook/*` path restriction, editor exposure change, OAuth callback migration, and related secure-cookie work were deferred to a later engagement. The existing requirement that HTTPS `/` remain `200` was a scope signal we should have treated as authoritative.

## Operational consequence
For staged client work, compare the proposed diff against the authorized operations line by line. Any functional change not directly required by the authorized scope belongs in a separate proposal, stage, or engagement.

This incident is considered a successful safety catch because the staged-review process prevented an out-of-scope production change.