# Runx support action report

- **What changed:** 3DVR added an original architecture note explaining how Runx could provide a governed execution and receipt boundary beneath the existing 3DVR agent orchestrator.
- **Where it lives:** the human-readable note is published in the public `tmsteph/3dvr-portal` repository at `apps/agent/docs/runx-governed-execution.md`.
- **Discoverability:** the public `apps/agent/README.md` links directly to the note, so the support action is visible to normal repository readers rather than existing only as bounty evidence.
- **Specificity:** the note discusses Runx's portable `SKILL.md`, optional `X.yaml`, narrowed authority, execution-boundary credential delivery, sealed receipts, and the `admit -> resolve grant -> deliver credentials -> execute -> seal` model.
- **Why it is useful:** it gives 3DVR contributors a concrete boundary between orchestration/user context (which 3DVR should own) and governed execution/receipt infrastructure (which is a candidate for Runx), reducing pressure to rebuild generic security plumbing.
- **Why it is authentic support rather than link spam:** this is original technical documentation in the author's own open-source agent repository, tied to a real architecture question and a proposed bounded experiment; it links Runx because Runx is directly relevant to that design decision.
- **Source grounding:** the note links both https://runx.ai and https://github.com/runxhq/runx so readers can inspect the project directly.
