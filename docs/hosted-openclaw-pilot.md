# Hosted OpenClaw pilot — implementation contract

Tracks #3253. This is the **first delivery slice**, not an enabled production service.

## User outcome
An invited user opens 3DVR Portal on a phone, creates a private OpenClaw workspace, and completes a safe first mission without a terminal.

## Provisioning state machine
`requested → queued → provisioning → ready`; failure goes to `failed` with safe retry. Suspension and deletion are explicit operator/user actions. Every transition is idempotent and audit logged.

## Minimum API contract (proposed)
- `POST /api/hosted-agents`: authenticated invite-only request; idempotency key; returns workspace ID and state, never secrets.
- `GET /api/hosted-agents/:id`: owner-only status, capabilities, bounded usage, last error category.
- `POST /api/hosted-agents/:id/actions`: allowlisted start/stop/retry actions with ownership checks and CSRF protection.
- `DELETE /api/hosted-agents/:id`: explicit confirmation, revokes credentials, schedules retention-aware teardown.

No endpoints should be exposed until the backend isolation and authorization tests pass.

## Tenant isolation
- One gateway/runtime per customer; dedicated credentials, persistent volume, network policy, and bounded CPU/RAM.
- No Docker socket, host SSH keys, shared browser profile, or cross-tenant environment variables.
- Encryption at rest and in transit; redact logs; scoped, revocable connector tokens.
- Treat prompts, tools, fetched pages and attachments as untrusted; require user confirmation for outward communication, purchases, and destructive actions.

## Operator control
- Queue admission based on live Hetzner capacity; OVH remains control/recovery anchor.
- Rate limits, budget ceilings, watchdogs, restart policy, snapshots, and deletion/export procedures.
- Manual invite and operator kill switch before any self-service rollout.
- Avoid routine Desktop Commander operations.

## Vertical-slice verification
1. Create two test tenants; prove no filesystem, token, network or session access across tenants.
2. Provision one tenant twice with same idempotency key; verify only one instance.
3. Restart gateway and worker; preserve task and conversation history.
4. Trigger a failed provisioning step; verify retry and cleanup.
5. Verify unauthorized user cannot view, control, or delete another workspace.
6. Complete mobile signup → agent ready → first mission on real devices.
7. Measure time-to-ready, resource use, inference spend, and support interventions.

## Rollout gates
- **Gate 0:** architecture and threat-model review; confirm OpenClaw licensing and supported hosting topology.
- **Gate 1:** isolated internal test instance with no customer credentials.
- **Gate 2:** invite-only pilot after tests, monitoring, backups and budget controls pass.
- **Gate 3:** paid tiers only after measured unit economics.

## Non-goals for first slice
Public signup, unlimited inference, arbitrary shell/host access, marketplace, complex billing, and production migration.

## Next implementation task
Wire the existing Hosted Operator pilot's provisioner and task-store to the above lifecycle, reusing its worker and lock-recovery tests. Do not create a parallel orchestrator.
