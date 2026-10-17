# Operator Control Room — MVP contract

Issue: #3154

## Purpose
A single mobile-first place to review obligations, connected account health, and proposed actions. This is an additive, server-first feature; no account credentials or payment capability is implied.

## Canonical objects

```ts
type ActionRisk = "read" | "routine" | "external" | "financial" | "security";
type ActionState = "observed" | "drafted" | "awaiting_approval" | "approved" | "executing" | "completed" | "failed" | "cancelled";
type OperatorItem = {
  id: string;
  source: string;
  sourceRef?: string;
  title: string;
  summary?: string;
  risk: ActionRisk;
  state: ActionState;
  observedAt: string;
  dueAt?: string;
  dedupeKey: string;
  evidence?: string[];
  proposedAction?: { kind: string; payloadRef: string };
};
```

## Authorization
- Read-only connector checks can run on a schedule with scoped, revocable access.
- Routine internal changes require a documented grant and audit entry.
- Sending messages to personal contacts, transfers, purchases, and security/account changes require fresh, explicit approval for the exact action and destination.
- Approval is single-use, expires, and is bound to immutable action parameters. Re-check permissions and idempotency at execution time.
- No plaintext credentials, bypassed MFA, or direct Zelle automation.
- Never confuse a prepared action with a completed action.

## MVP views
1. Today: deduplicated obligations, priorities, and stale-source indicators.
2. Approvals: pending actions with recipient, amount (if any), consequences, and reject/approve controls.
3. Connections: scope, health, last verified source update, reconnect/revoke.
4. History: append-only action timeline and failures.

## First vertical slice
Implement a read-only adapter for connected-account health, with a mocked fallback for local development. Show Schwab transaction-sync failure as a connection warning, not a zero-transactions claim. No balances in logs. Follow with Gmail, Calendar, GitHub and OVH health adapters.

## Acceptance
- Responsive on narrow phone screens and inside Operator.
- Every item links to provenance; stale or missing data is labeled.
- Duplicate events collapse without losing audit history.
- Unapproved high-risk actions cannot execute, including on retries.
- Test approval expiration, replay, altered parameters, failed connectors, and idempotency.
- Existing Operator chat remains the primary interface; no forced navigation to external apps.
