# Reliability and Affordable Operation

Updated: October 2, 2026. Status: hardening plan and acceptance criteria; implementation and live verification remain separate work.

## Operating principle

The twin should retain work when intelligence is unavailable. Predictable automation can continue within its authorization; tasks requiring reasoning wait visibly for capacity.

An affordable setup must measure real usage. Neither an inexpensive subscription nor a self-hosted runtime guarantees unlimited inference.

## Persistent task record

Keep a durable task ID, owner, goal, authorized scope, current step, execution attempts, provider receipts, budget reservations, last checkpoint, and next recovery action.

Persist capability definitions outside conversation history. At the start of a run, load the permitted capabilities and their verification timestamps. Probe the relevant access path before execution; a saved entry alone is not evidence that it works.

Use the existing server-backed storage policy. Browser-local state can cache the display but must not be the sole record of committed external actions.

## Task states

Use queued, running, waiting for human, waiting for model capacity, reconciling, completed, failed, and canceled states. A restart returns an interrupted external action to reconciliation rather than blindly retrying it.

Human-facing status should explain what completed, what is waiting, and what will happen next. Avoid repeated alerts for the same unresolved condition.

## Cost policy

- Run predictable checks and data transformations without an LLM where possible.
- Use an inexpensive model for bounded routine decisions after validating its quality.
- Reserve stronger models for difficult reasoning and uncertain situations.
- Set explicit limits on turns, retries, elapsed time, context, and concurrency.
- Enforce the spending budget before launching work; provider billing alerts alone are insufficient.
- Separate subscription allowances from API billing.
- Record usage and remaining budget; queue work when estimates are too uncertain or capacity is exhausted.

Do not switch to another paid provider without an approved budget. Fallback behavior must be configured and tested for the installed runtime version.

Local inference is an option only after measuring hardware headroom, latency, and tool-use quality. Existing VPS capacity is limited; do not promise a capable large model at no marginal cost.

## Recovery scenarios

| Injected failure | Expected behavior | Evidence |
| --- | --- | --- |
| New conversation | Load capabilities and task checkpoint | Same task ID and recorded next step |
| Worker restart | Resume or reconcile interrupted action | No second external submission |
| Model throttling | Bound retries and queue reasoning work | Visible capacity state and retained checkpoint |
| Expired login | Recover the canonical session or request one handoff | Verified account after recovery |
| Broker unavailable | Wait without exposing or copying credentials | Redacted failure and safe retry |
| Lost response after submission | Inspect provider state before retry | Confirmation receipt or unresolved reconciliation |
| Two workers share a lane | Only the lease holder writes | Second worker waits |
| Revoked permission | Deny new execution | Policy denial with no service mutation |

Exactly-once completion cannot be assumed across arbitrary websites. Use provider idempotency keys when supported; otherwise reconcile receipts and observed state. Keep ambiguous outcomes visible.

## Smallest hardening sequence

1. Inventory existing runtime, broker backend, capabilities, and task storage. Record what was actually verified.
2. Choose one low-risk workflow and capture its normal completion evidence.
3. Add or repair durable checkpoints and action reconciliation on that path.
4. Inject the failures above in a controlled environment.
5. Fix the observed failures before widening permissions or adding more integrations.
6. Package the working setup with pinned versions, backup/restore instructions, and an upgrade rollback.
7. Repeat with a real owner-authorized workflow.

For an AV opportunity pilot, discovery and a draft reply are useful initial outcomes. Booking, sending, payments, and other commitments follow the owner's specific permissions.

## Release gate

A demonstration passes only when it survives a fresh conversation, restart, and model outage; preserves the correct account; avoids duplicate actions; exposes no secrets; and reports completion with evidence.

Measure completion rate, unnecessary human interventions, recovery time, duplicate actions, and cost per completed task. Publish observed results instead of declaring the whole twin reliable after one successful chat.

## Existing references

- [Data storage policy](/docs/data-storage-policy.md)
- [Persistent access contract](/docs/persistent-access-contract.md)
- [Human-visible outcome verification](/docs/human-visible-outcome-verification.md)
- [OpenClaw token use](https://docs.openclaw.ai/reference/token-use)
- [OpenClaw local models](https://docs.openclaw.ai/gateway/local-models)

## Related documents

- [Open package vision](/research/digital-twin-open-package/)
- [Secure access contract](/research/digital-twin-secure-access/)
