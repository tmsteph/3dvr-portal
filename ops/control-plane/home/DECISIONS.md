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
