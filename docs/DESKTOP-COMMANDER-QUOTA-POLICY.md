# Server-first execution and Desktop Commander quota policy

Status: operating policy (2026-10-14).

## Execution order
1. Operator on OVH is the primary control plane. Execute routine server jobs via existing authorized server-side runners.
2. Use GitHub Actions for repository tests, CI and controlled deployments; use scoped SSH automation when appropriate.
3. Use Hetzner for isolated worker execution and backup/failover.
4. Reserve Desktop Commander Remote MCP for emergency recovery and exceptional access, not ordinary development, deployment, status polling or file inspection.

## Quota guardrails
- Track the Desktop Commander remote-call allowance independently from GitHub Actions and other providers.
- Notify at 80%, 90%, and 95% consumed; deduplicate notifications per threshold per usage period.
- At >=80% consumed, avoid routine remote calls; at >=90%, restrict to essential recovery; at >=95%, require explicit justification for each call.
- Current observed remaining allowance on 2026-10-14: 13%. The exact renewal date is not verified; do not assume calendar-month reset.
- If the provider offers only remaining-percent readings, derive consumed = 100 - remaining.
- Never poll Desktop Commander just to update a dashboard; prefer cached observations and infrequent checks.

## Reliability and safety
- Batch routine operations into bounded, logged server-side jobs.
- Apply least privilege, scoped credentials, timeouts, output limits, idempotency, health checks and rollback.
- Do not expose SSH credentials or enable broad remote shell access through a public endpoint.
- Preserve an independent recovery path if the primary control plane fails.
- Do not modify client infrastructure without the client's authorization.

## Implementation checklist
- [ ] Verify the existing GitHub-to-OVH deployment path and fix failing CI before enabling automatic production changes.
- [ ] Add an Operator quota status source with timestamp, provider, remaining percentage and reset date only when confirmed.
- [ ] Implement 80/90/95% threshold alerts with deduplication and test fixtures.
- [ ] Exercise a Desktop-Commander-free deployment and rollback in a safe environment.
- [ ] Verify emergency access works when routine channels are unavailable.

This document is policy and an implementation plan, not evidence that alerts or failover are already active.
