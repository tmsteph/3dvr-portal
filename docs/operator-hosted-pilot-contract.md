# Hosted Operator pilot: first executable contract

Status: implementation contract for issue #3172. Not proof of deployment.

## First vertical slice
An authenticated pilot user submits a **read-only repository status report** from a phone. The server queues it, executes on a bounded worker, persists its receipt, and exposes status and output after the phone disconnects.

## API (proposed)
- POST /api/operator/tasks: {kind:"repo-status",repository:"owner/repo",idempotencyKey:"..."} -> {taskId,status:"queued"}
- GET /api/operator/tasks/:taskId -> {taskId,status,createdAt,updatedAt,result?,error?,usage?}
- POST /api/operator/tasks/:taskId/cancel -> cancellation receipt
- All endpoints derive tenant identity from verified session, never request body.

## Task state
queued -> running -> completed | failed | waiting_approval | cancelled.
Persist every transition with tenant ID, attempt count, timestamps, worker lease, idempotency key, bounded output, and measured usage. Expired leases return to queue only if retry is safe. No automatic retry of external side effects.

## Security gate
- Default deny unrecognized task kinds, repositories, credentials, network destinations and filesystem access.
- Use a restricted worker identity, scoped read-only credentials, no Docker socket, no host secrets, hard CPU/memory/time/output limits.
- Verify tenant ownership on list/read/cancel/result and artifact routes; test cross-tenant 403/404 behavior.
- Keep credentials out of logs and receipts. Enforce concurrency, token and spend limits before execution.
- Require explicit approval for writes, publication, payments, and outbound messages.

## Acceptance tests
1. Same idempotency key creates only one task within tenant.
2. Two tenants cannot access each other's task or artifacts.
3. Worker restart preserves task and recovers a safe lease.
4. Quota exhaustion prevents execution.
5. Cancel stops pending work and terminates running work.
6. Phone disconnect/reconnect still returns result and measured cost.
7. Failure returns a useful sanitized error without secrets.
8. Read-only task cannot mutate repository or host.

## Release plan
Audit existing Operator auth/job/worker primitives before coding; implement smallest reusable slice. Test on 3DVR-controlled staging, record evidence and rollback procedure, then deploy after checks. Do not involve Tom/customer infrastructure. Do not claim public pilot activation until all gates pass.
