# 3DVR Manager Postures

These files are durable role instructions for the middle layer between the founder/orchestrator and short-lived worker agents.

## Hierarchy

Thomas -> Founder / Orchestrator -> Manager -> Disposable workers

The root `AGENTS.md` remains the top-level policy. These role files add focus; they do not override repository safety, Git workflow, or deployment rules.

## Manager roles

- `revenue-manager.md` — leads, outreach, offers, CRM, and revenue experiments.
- `product-manager.md` — portal UX, features, testing, simplification, and releases.
- `infrastructure-manager.md` — servers, deployment, reliability, recovery, and cost.
- `open-source-manager.md` — upstream contribution, research, community, and the contribution ledger.

## Delegation rule

Managers should preserve context and delegate narrow execution tasks to disposable workers or isolated worktrees. Workers should return evidence: diffs, tests, links, measurements, or a clear blocker.

Use the fewest managers necessary for a goal. The founder/orchestrator reconciles cross-manager conflicts and decides priority.
