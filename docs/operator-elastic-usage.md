# Operator Elastic Usage — Slow Down, Don't Shut Down

**Status:** Planned, not implemented. **Tracking:** [Issue #3077](https://github.com/tmsteph/3dvr-portal/issues/3077).

## Problem
Hard provider limits interrupt work, lose momentum, and can make an assistant feel broken. Operator should keep work visible and recoverable even when inference is temporarily unavailable.

## Experience
1. Normal: immediate responses.
2. Constrained: route to an eligible smaller model with user-approved policies, or queue with honest status.
3. Throttled: persist request, honor provider `Retry-After`, show queued/paused and estimated time only when grounded.
4. Unavailable: preserve drafts and jobs, permit cancellation/reordering, resume after capacity returns.

## Architecture
- OVH-hosted durable job queue and persisted conversation context, independent of client connection.
- Fair scheduling, retry/backoff with jitter, provider circuit breakers, idempotency and no duplicate side effects.
- Policy-aware model router based on capability, privacy, cost, provider limits, and user consent.
- Optional provider failover only with permission; never bypass quotas or spend caps.
- Mobile-first queue UI: job state, pause reason, cancel, retry, reorder, usage/cost dashboard.
- Background completion notifications when supported.

## Milestones
1. Durable queue with restart recovery and no duplicate execution.
2. UI queue state and cancellation; test on mobile.
3. Provider rate-limit and budget integration.
4. Approved model routing and failover.
5. Metrics, estimates, fairness, and load tests.

## Acceptance
- Simulated 429 preserves work and correctly pauses/retries.
- Restart does not lose or duplicate jobs.
- Hard limits are honestly represented as paused until capacity returns, not guaranteed slow service.
- No unapproved charges or data transfers.

## Community signals to investigate
- Cursor discussions of slower queued responses after limits.
- Claude Code reports of 429 interruptions.
- ChatGPT complaints about hard usage caps and unclear visibility.

These are qualitative signals, not proof of universal demand. Validate through user interviews and a prototype.
