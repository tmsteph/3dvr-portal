# Operator durable goal checkpoint slice

Status: opt-in persistence and verification primitives. The adaptive planner,
capability discovery, budget ledger, and Operator UI wiring are subsequent work.

Goals use the existing SQLite task row (`record.goal`), owner scope, and worker
claim. No additional queue, database, service, or provider dependency is added.

From a trusted worker that has claimed the task:

1. Call `initializeTaskGoal(taskId, claimToken, definition, options)` once.
   The definition requires nonempty `acceptanceChecks` alongside title and steps.
2. Call `transitionTaskGoal(taskId, claimToken, expectedRevision, event, options)`
   for each transition. Pass the explicit owner alias and existing queue DB.
3. Persist tool receipts before advancing; `complete_step` requires evidence.
4. Once steps finish, the goal enters `verifying`. A trusted verifier performs
   real outcome checks and records each with `verify_check`, `checkId`,
   `passed`, and nonempty evidence.
5. `complete_goal` succeeds only when every acceptance check passes.
6. Finalize the task through `finishTask`; it rejects a successful finish when
   the stored goal is incomplete or its claim has expired, and preserves the
   latest checkpoint even if the worker's task snapshot is stale.

Reads reopen the existing database. A replacement worker obtains the normal
expired-claim takeover, reads `record.goal`, and continues from its checkpoint
and revision. It must reconcile an interrupted external action before retrying;
checkpoint persistence alone does not supply external idempotency.

Each transition runs in a SQLite immediate transaction and requires the active,
unexpired claim. Wrong owner/token, stale revision, cancelled task, and duplicate
initialization fail without updating the goal.

This is a trusted server API, not an authorization boundary for model-generated
events. Do not expose `approve` or `verify_check` directly to a model or public
client. The future coordinator must validate authorization and verification
evidence, reserve budgets, and handle cancellation before dispatch. Existing
legacy single-action goals retain their current completion behavior; initialized
durable task goals always require outcome checks.

Do not attach these goals to the legacy automatic worker until its coordinator
uses the checkpoint APIs and handles a false `finishTask` result. Live task
activation remains disabled for this slice. Generic administrative queue writes
are trusted operations and are not a substitute for checkpoint transitions.

## Verification

Run on a server with Node's SQLite support:

```sh
node --test apps/agent/test/operator-goal-progress.test.js apps/agent/thomas-agent/node/muse-goal-state.test.js apps/agent/test/agent-task-queue-sqlite-store.test.js
```

The focused tests exercise a new process reopening the same database, expired
claim takeover, stale worker snapshots, failed/missing verification, revision
conflicts, owner isolation, pause/resume, cancellation, and legacy compatibility.

Hosted activation additionally requires a private tenant-enforcing API/store.
The owner-alias SQLite sidecar and shared Gun mirror are transitional and do
not establish hosted customer privacy. Disable shared mirroring of private goal
records and verify cross-tenant read/write isolation before activation.
