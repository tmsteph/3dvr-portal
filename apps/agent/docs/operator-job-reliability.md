# Operator background job reliability (proposal)

Tracks #3133.

## State machine
queued -> leased -> running -> succeeded | retry_wait | failed | awaiting_approval | cancelled.

Persist job ID, idempotency key, owner, timestamps, attempt count, lease expiry, checkpoint, bounded error summary, and approval policy. Single-writer leases must be renewable and expire after worker failure.

## Recovery contract
- Restart scans expired leases and requeues only idempotent or explicitly resumable work.
- Non-idempotent external actions require reconciliation before retry.
- Exponential backoff with jitter, retry ceilings, and dead-letter visibility.
- Secrets never appear in logs or the UI.
- Destructive, financial, messaging, and account-security actions retain explicit approval gates.

## Mobile dashboard
Expose job status, latest heartbeat, safe error summary, retry/stop actions, and audit history via server-backed APIs. Do not require the user's phone to stay online.

## Implementation milestones
- Audit current mission runner, leases, and status surfaces.
- Add crash/restart, duplicate execution, and lease expiry tests.
- Implement durable state transitions and bounded retries.
- Add read-only mobile status view before enabling controls.
- Exercise server restart and recovery on staging before rollout.
