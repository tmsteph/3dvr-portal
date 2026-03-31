# Decisions

## 2026-03-22
- Markdown files in `~/` are the main human-readable control plane for Codex in this workspace.
- `~/AGENTS.md` is the main standing instruction file for Codex under `/data/data/com.termux/files/home`.
- `/data/data/com.termux/files/AGENTS.md` is only a higher-level fallback for the broader Termux filesystem.
- The current core repo set is `3dvr-portal`, `3dvr-web`, and `tmsteph-redesign-2025`.
- If `tmsteph` is mentioned without more detail, assume it means `tmsteph-redesign-2025` in this workspace.
- `3dvr-portal` is the default repo for portal, billing, subscription, and production issues.
- `3dvr-web` and `3dvr-portal` must stay aligned for environment behavior and billing-link behavior.
- Live verification is required for billing, deployment, and customer-facing production issues.
- Codex should prefer proactive execution and durable systems over repeated clarifying loops.
- Core repos should carry mirrored copies of the control plane so the context follows across devices where `~/` may differ.
- Core repos should include a restore script so any one of them can seed `~/` on a new device.

## 2026-03-31
- For 3DVR, `Free`, `$5`, and `$20` are acquisition and bridge lanes; the main revenue engine is `Builder`, `Embedded`, and scoped one-time work.
- The best near-term profitability wedge is owner-led service businesses, professional services, and small support teams with lead-follow-up and operating-rhythm pain.
- Confused individuals remain an important acquisition audience, but the paid GTM center is small operators and teams with real revenue and coordination pain.
- Market-facing copy should lead with concrete outcomes like leads, follow-up, scheduling, payments, and weekly rhythm before introducing internal product names.
