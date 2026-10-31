# Managed Forge recovery

Operator research/drafting uses the private SQLite Codex worker. Code edits use the separately signed Forge edit queue. Verify both paths when reporting Operator health.

Run scripts/ops/operator-forge-supervisor.cjs on Hetzner against an immutable repository release. Required configuration:

- THREEDVR_FORGE_AGENT_ROOT: absolute release apps/agent path.
- THREEDVR_OPERATOR_PORTAL_REPO: an existing source Git repository; preserve unrelated dirty files. The managed executor fetches main and allocates a separate branch and worktree for every request.
- THREEDVR_OPERATOR_FORGE_STATE_DIR: private persistent execution receipts, outside releases.
- THREEDVR_OPERATOR_FORGE_WORKTREE_ROOT: persistent isolated workspaces, outside releases.
- THREEDVR_OPERATOR_FORGE_SIGNED_AFTER: explicit ISO admission cutoff; the authenticated proof issue time must satisfy it. Relay createdAt is only a selection hint.
- THREEDVR_OPERATOR_FORGE_ONLY_TASK_ID: optional exact-ID canary pin; the supervisor exits after that record is processed.

Use the existing Hetzner Codex and GitHub credentials in place. Run one supervisor with a host flock and systemd resource bounds; do not restart the legacy general queue, inbox, outreach or autopilot stack. Agent CI's old DigitalOcean deployment is manual and default-off because it activates that wider stack.

An atomic receipt is reserved before code execution. Pending/uncertain receipts cannot execute again. Final receipts are saved before relay delivery so an interrupted result update can be repaired without repeating code execution. Keep receipts and worktrees for inspection. Never delete a pending receipt just to retry.

The fixed browser safety sentence is excluded only from intent classification. It remains in the signed task passed to the executor. Actual deployment/destructive/credential requests remain blocked. A completed code task reports a result; it is not proof of a merge or production release.

Before enabling the continuous supervisor, run an exact-ID, signed, harmless code-edit canary. Verify the actual Git diff, focused checks, publication if requested, and the terminal relay result. Historical tasks outside the cutoff remain held.
