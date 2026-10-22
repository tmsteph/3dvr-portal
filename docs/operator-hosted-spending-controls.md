# Hosted Operator spending reservations

The pilot remains disabled. This change implements spending ceilings, not provider billing or measured usage.

## Atomic authority

The configured task store uses a private SQLite file at `HOSTED_OPERATOR_PILOT_STORE + ".sqlite"`.
Tasks and tenant reservations commit in the same transaction. Caller-supplied `remainingCents` and
request budget fields cannot fund or replenish an allowance. Repeating a tenant/idempotency key does
not reserve twice. Worker lease recovery holds the original reservation.

A completed task moves its full reservation to accounted spending once. Its receipt explicitly says
`costBasis: reserved_upper_bound`; this is a conservative ceiling, not measured provider cost.
Failed/uncertain execution retains its reservation, including after retry exhaustion. Operator
reconciliation and measured provider usage are release prerequisites; no automatic refunds for
uncertain execution are implemented.

## Provisioning and rollout

Use Node 22.13+ for the worker and accounting store. Node 20 fallback can load the API while the pilot
is disabled because its SQLite import is lazy.

Provision each authenticated tenant explicitly through the trusted operator CLI:

```sh
HOSTED_OPERATOR_PILOT_STORE=/private/tasks.json node scripts/hosted-operator-budget.mjs set sea:PUBLIC_KEY ALLOWANCE_CENTS
```

Updating an allowance preserves reserved and accounted spending and refuses a ceiling below existing
commitments. This command does not charge a customer, move funds or enable the pilot.

Submission requires both `HOSTED_OPERATOR_PILOT_ENABLED=true` and
`HOSTED_OPERATOR_PILOT_ACCOUNTING_READY=true`, plus a positive server-configured
`HOSTED_OPERATOR_PILOT_RESERVATION_CENTS`. None of these flags is enabled by this change.
Do not set accounting-ready until restrictions, conservative task ceilings, usage reconciliation,
real signed access boundaries, worker permissions and disconnect/reconnect acceptance are reviewed.

## Existing state

Nonempty JSON stores and unknown legacy locks fail closed and remain untouched. Stop old writers and
prepare an explicit offline migration/reconciliation before switching an existing store. Do not remove
locks based on age. A killed SQLite writer releases its kernel lock and rolls back unfinished changes.

The database is created with mode 0600 inside a private directory. Keep the configured directory
owned by the dedicated worker/broker account; existing directory permissions are not broadened.

## Verification

`node --test --test-concurrency=1 tests/operator-hosted*.test.js` covers exhaustion, idempotency,
restart persistence, isolated tenants, stale leases, four simultaneous writer processes, killed
writer rollback, unknown-cost failures and legacy cutover refusal. CI also checks that Node 20
can load the disabled API without importing SQLite. No customer systems are involved.
