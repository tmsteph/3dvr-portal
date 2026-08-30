# 3DVR Autonomy Ladder

3DVR does not assume a model is perfectly reliable. Reliability comes from bounded capabilities, explicit policy, approvals, audit logs, rollback, tests, and measured trust.

Autonomy is granted **per capability**, not per agent. Reading a calendar, sending email, deploying code, spending money, and controlling a device are separate trust relationships.

## Levels

| Level | Name | Authority |
| --- | --- | --- |
| 0 | Observe | Read permitted state and report it. No mutations. |
| 1 | Suggest | Recommend actions. No mutations. |
| 2 | Draft | Prepare messages, code, forms, transactions, or changes without executing them. |
| 3 | Act with approval | Execute one bounded action after explicit approval. |
| 4 | Act + audit | Execute automatically inside defined scope with durable audit and recovery. |
| 5 | Fully autonomous | Repeatedly execute tightly bounded, monitored, reversible work without routine approval. |

Level 5 is never unrestricted authority.

## Risk caps

- Low: may reach level 5.
- Medium: may reach level 5 when bounded, monitored, reversible, and audited.
- High: capped at level 4 by default.
- Critical: capped at level 3; every execution requires explicit approval.

Critical examples include money movement, legal acceptance, credential/security changes, and destructive account actions.

## Execution contract

A missing or disabled policy fails closed. All actions require satisfied scope.

- Level 3 requires explicit approval.
- Level 4 requires a durable audit path before execution.
- Level 5 requires bounded scope, monitoring, reversibility/recovery, and audit.

No prompt, model output, UI toggle, or environment variable is itself a security boundary.

## Promotion

Promotion is explicit, reversible, per-capability, and one rung at a time. Initial defaults:

| Target | Successful | Reviewed | Max failure | Max rollback |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1 | 1 | 25% | 25% |
| 2 | 5 | 3 | 15% | 10% |
| 3 | 10 | 5 | 5% | 5% |
| 4 | 25 | 10 | 2% | 2% |
| 5 | 100 | 25 | 1% | 1% |

Unsafe attempts block promotion. Level 5 additionally requires explicit owner approval.

## Demotion

- policy violation or unsafe attempt -> level 0
- unbounded action or missing required audit -> at most level 2
- rollback-required incident or rejected execution -> drop one level

## Initial posture

- public research/read-only discovery: 0-1
- CRM/project drafts: 2
- outbound email/messages: 3
- calendar mutations: 3
- GitHub changes: 3-4
- production deployment: 3-4
- device mutations: 3
- outreach campaigns: 3-4
- payment/refund/money movement: 3
- simulation-only venture loop: 5 inside sandbox

## Architecture

```text
intent
  -> planner
  -> named capability
  -> autonomy policy lookup
  -> risk + scope evaluation
  -> approval gate when required
  -> executor/adapter
  -> external receipt
  -> durable audit event
  -> success/failure/rollback evidence
  -> promotion or demotion assessment
```

The canonical implementation lives in `apps/agent/thomas-agent/node/autonomy-policy.js` with tests in `apps/agent/test/autonomy-policy.test.js`.

Portal should expose an Autonomy Center showing level, risk, scope, evidence, approvals, audit receipts, per-capability revoke controls, and a global emergency stop.
