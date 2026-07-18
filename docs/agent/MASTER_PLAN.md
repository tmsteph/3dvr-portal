# 3DVR Autonomous Development Master Plan

## Objective

Build a safe, repo-native autonomous development system so OpenClaw can supervise Codex and advance 3DVR work without requiring Thomas to copy and paste a new instruction after every completed step.

The system turns a human-readable master plan into small, dependency-aware missions that can be resumed after interruption. The first proving mission is `life-upgrade-v01`.

## Operating loop

1. Read `AGENTS.md` and the mission definition.
2. Inspect the repository, branches, pull requests, checks, and worktrees.
3. Select the next unblocked task.
4. Create or reuse a clean worktree.
5. Give Codex one tightly scoped implementation task.
6. Run declared syntax checks, focused tests, baseline comparisons, and browser checks.
7. Review the diff for unexpected files or unsafe behavior.
8. Commit only when the mission authorizes it.
9. Push branches and open or update draft pull requests only when authorized.
10. Record evidence, decisions, failures, blockers, commit hashes, and PR numbers.
11. Update `.agent-state/LIVE_STATUS.md`.
12. Continue to the next safe task, or stop at an approval gate.

## Safety boundary

The runner may inspect repositories, create clean worktrees, edit scoped files, run tests, commit, push, and open draft PRs when a mission explicitly permits those actions. It must pause for human approval before merging, production deployment, billing or authentication changes, secret access, user-data deletion or migration, relay cleanup, or external communication.

The runner never labels a failure as baseline unless the same command reproduces against `origin/main` in the same environment. It never silently broadens file scope and never overwrites unrelated dirty work.

## Mission dependency chain

1. Daily Direction privacy PR #1169.
2. Life Upgrade v0.1 stacked draft PR #1170.
3. Rebase Life Upgrade onto `main` after #1169 merges.
4. Trusted browser validation.
5. Human approval to merge.
6. Human approval to deploy.
7. Later private-sync design.
8. Later optional AI guidance.

No merge or deployment is automatic while this objective is being established.
