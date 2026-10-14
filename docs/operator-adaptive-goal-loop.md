# Operator adaptive goal loop

Status: implementation contract and first acceptance scenario; 2026-10-14.
This document specifies proposed runtime work. It does not establish that the loop or server acceptance test is deployed or passing.

## Outcome

A user states a goal in Operator. Operator defines success, assesses its actual limits, plans a bounded next action, executes through authorized capabilities, verifies the result, and repeats. When a capability is missing, it checks existing connections and healthy alternate paths before proposing a new connection. The goal and its evidence survive disconnects and worker restarts.

The ambition is broad problem solving. Completion always means a specific verified outcome; some goals are infeasible, unlawful, outside consent, or beyond the available budget.

## Reuse the system we have

- Operator remains the user interface, including progress, connection requests, results, and cancellation.
- Extend the existing Hosted Operator tenant task store, worker, and result view. Do not add a second queue or restart quarantined jobs to run this pilot.
- `apps/agent/thomas-agent/node/muse-goal-state.js` already models steps, evidence, pause/resume, and approval. It is a pure model, not a durable executor. Its final-step transition currently establishes step completion, so whole-goal verification needs a separate runtime gate.
- `abilities/abilities.json` is the seed registry. A listed ability is a candidate, not proof of live authentication or permission.
- Follow `docs/agent-access-map.md`: native connector when suitable; typed Control MCP for routine server work; Control Bus/Open Runner fallback; direct SSH for deliberate maintenance. Desktop Commander remains recovery only.
- OVH anchors production/control and persistent authenticated browser identity. Hetzner is the default worker service home, subject to live capacity. DigitalOcean is a lightweight fallback. Follow `docs/infrastructure-topology.md` and capacity admission checks.

## The loop

1. Define the requested outcome and observable acceptance checks. Resolve only ambiguities that materially change execution.
2. Assess knowledge, permissions, tools, authenticated connections, worker capacity, time, spend, and external constraints. Record evidence and timestamps.
3. Choose the smallest useful next action or experiment. Predict its result and reserve its maximum allowed cost before dispatch.
4. Authorize server-side against tenant, resource, operation, scope, expiry, and remaining budget. Existing authorization persists within scope; a model cannot grant access.
5. Execute with a bounded timeout, stable action ID, and durable receipt.
6. Verify against the predicted result and goal checks using actual output or a read-back. Queue acceptance, a model assertion, and a running browser alone are insufficient.
7. Reassess after each result. Continue, change approach, discover capability, wait for a specific checkpoint, or stop with an explicit reason.
8. Mark complete only when every acceptance check has supporting evidence. Preserve useful methods after validation for future goals.

## Durable goal record

Persist in the existing tenant-scoped server store:

| Field | Purpose |
| --- | --- |
| goalId, tenantId, ownerId | Stable identity and isolation |
| objective, acceptanceChecks | Requested outcome and verification rules |
| authorizedScope | Resources and operations already approved; references to authorization records |
| limits | Deadline, max spend, max actions, retries, runtime and resource limits |
| status, revision | Current state and optimistic concurrency |
| assessment | Observed limits with source and verification time |
| planVersion, nextAction | Current plan and bounded action |
| attempts | Action IDs, input hashes, receipts, outcome, costs, verification |
| connectionRequests | Required capability, minimal scope, reason, consent status |
| blockers | Exact missing condition, attempted routes, next recovery action |
| lease | Single executing worker and renewable expiry |
| checkpoint, result | Recovery position and evidence-backed outcome |

Secrets remain in the broker; records contain credential references only. Private goal data and receipts must not enter public GitHub issues or shared Gun nodes.

Suggested runtime states: assessing, planning, executing, verifying, discovering, waiting_for_authorization, waiting_for_capacity, paused, complete, failed, cancelled. Map these onto the existing task lifecycle rather than replacing it blindly.

## Capability discovery and ethical expansion

A capability candidate includes ID, input/output schema, provider, execution location, permission scope, health probe, estimated cost, resource class, effect type, idempotency support, and verification method.

Discovery proceeds from registered abilities and access-map fallbacks to approved plugin/API discovery. Inspect provenance, scopes, data sharing, costs, and a harmless probe before making a newly connected capability executable.

Connecting is separate from discovering and invoking. New credentials, provider consent, additional spending, and operations outside authorized scope require the appropriate owner checkpoint. Never buy a service, contact another person, accept terms, or broaden access merely because a planner chose it. Already authorized operations continue without repeated approval.

External pages, tool descriptions, and returned documents are untrusted data. They cannot change the goal, tenant, permission policy, or budget. A denied operation remains denied on every alternate transport; fallback may repair transport, never bypass authority.

## Iteration and recovery rules

- Bound every action and the total goal. Exhausted budget produces a checkpoint with remaining work; replanning cannot reset counters.
- Permit at most two retries per action and two alternate routes in the first pilot.
- Stop repeated no-progress attempts with a useful blocker explaining what changed or is needed.
- Acquire one worker lease; commit state and receipt before advancing. Cancellation is checked before dispatch and after tool return.
- Before retrying an interrupted action, reconcile its stable action ID with the provider receipt/read-back. An unknown write outcome requires reconciliation, not blind replay.
- Use provider idempotency where supported. Do not promise exactly-once external effects.
- Permissions are rechecked at dispatch. Revocation or expiry prevents the next action.
- Save reusable skills as versioned proposals with outcome evidence. Do not modify the running permission policy through learning.

## First real goal

**Produce a verified health report for the existing 3DVR execution paths while handling one unavailable preferred transport.**

Pilot limits: read-only existing infrastructure; ten minutes elapsed; maximum ten tool actions; two retries per action; two alternate routes; no new paid services, outbound messages, production changes, service restarts, or worker-quarantine changes. Use existing authorized model allocation and record actual model spend; do not provision extra capacity.

Run through the existing worker only after its current admission and unsafe-replay protections pass. A stopped unsafe worker is a prerequisite blocker to resolve independently, not an excuse to bypass quarantine.

Walkthrough:

1. Save the goal, acceptance checks and budgets.
2. Inspect registered paths and verify a harmless health action.
3. In an isolated test adapter, make the preferred transport unavailable. Do not break a live service to simulate failure.
4. Record the transport limitation and select an existing authorized fallback.
5. Dispatch the bounded health read through that fallback.
6. Verify command completion and sanitized output; distinguish transport, host, service, and provider authentication health.
7. Save the report and its receipts in the private goal record; return it inside Operator.
8. Repeat the availability probe later to confirm the goal can resume from a checkpoint.

Acceptance evidence must include the goal ID, attempted transports, reason for fallback, execution host, tool completion status, timestamped health observations, elapsed time, action count, spend, and result verification. An unavailable path is reported honestly; it does not imply the host is down.

This first scenario proves authorized fallback and verification. A second scenario will exercise a genuinely missing connection using a disposable account: discover it, present minimal scopes, pause for consent, verify connection, resume the same goal, and read back the result. Do not claim capability expansion is proven by the fallback scenario alone.

## Implementation sequence and required checks

1. Add assessment, budgets, checkpoint, and verification gate to the existing durable task model. Test restart recovery, concurrent leases, cancellation, budget exhaustion and false completion.
2. Add registry resolution and read-only adapter probes. Test unavailable transport, stale health, revoked access, and denial preserved across fallbacks.
3. Add checkpointed planner/executor/verifier coordination on the existing worker. Test repeated no-progress, uncertain write reconciliation and tenant isolation.
4. Run the real health-report goal with unavailable transport injected at the adapter boundary. Save private receipts and a sanitized acceptance summary.
5. Add connection request/resume in Operator. Test scoped consent, denial, expiry and revocation using a disposable provider account.

Definition of milestone complete: deployed coordinator on an admitted server worker, persistent goal visible in Operator, real fallback scenario passing, and restart/cancel/budget/authorization checks passing. A document or PR alone is not runtime completion.

## Related contracts

- [Capability platform](portal-capability-platform.md)
- [Agent access map](agent-access-map.md)
- [Infrastructure topology](infrastructure-topology.md)
- [Persistent access contract](persistent-access-contract.md)
