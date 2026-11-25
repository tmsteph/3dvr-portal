# Wizard Mode development note · 2026-11-25

Tracking: https://github.com/tmsteph/3dvr-portal/issues/3888
Goal layer: https://github.com/tmsteph/3dvr-portal/issues/3685

## Scope
A new standalone project at `/wizard-mode/`. Existing Helm and Portal interfaces remain unchanged. Experiments have separate paths so they can evolve without replacing interfaces people already like.

## Implemented
CSS 3D project spaces, pointer joystick and keyboard movement, decision buttons, device-local intention save/reload, and optional browser speech entry with a text fallback. No third-party app dependencies or installs are needed for this page.

## Not implemented
Agent execution, authentication, shared goals, per-space saved idea collections, cross-device sync, or a replacement for existing Helm chat. One local intention is saved on this browser; it is not encrypted shared storage. Browser speech may use the browser vendor's remote service.

## Verification
The original local prototype passed headless mobile-viewport room/decision selection, save/reload, keyboard movement and recenter checks. Publication acceptance is tracked in the issue. Physical phone touch, microphone, and motion comfort remain unverified. A merge alone is not deployment proof.

## Operating defaults
Use public GitHub issues and public development notes for project requests, progress, results and remaining work. Keep credentials, personal history, household details, and private client data out of public artifacts. Do not copy private workspace memory into the repository.

## Preserve experiments without forcing a merge
A PR is a preserved proposal, not an obligation to replace the main app. Keep the source branch and PR history; retain independently runnable entrypoints and stable URLs for adopted experiments. This release adds only a new directory and development note. Its HTML can also be copied and served independently with no build system. Large numbers of future experiments should not require manual review or management by the user. Automated verification remains the agent's responsibility; a scalable branch-preview/fork catalog is future work, not delivered here.

Release-candidate checks passed on the fresh main-based branch: decision selection, intention save/reload, keyboard movement, pointer joystick, recenter, and zero page errors at 390×844. The repository visual-capture harness recorded four frames plus a two-second video with zero errors using existing Chrome/ffmpeg. These are desktop-automated mobile-viewport checks, not physical-phone verification.

Pre-existing production workflow acceptance failures are tracked separately in #3622. Do not interpret an artifact release as a fix for that unrelated Operator failure.

Portal monorepo is the preferred home for this era's apps. “Fork” means preserving independent experiments and runnable versions; separate repositories are not required. The source branch remains preserved after merge.
