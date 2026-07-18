# Mission Runner Runbook

## Start a mission

```sh
npm run agent:mission -- life-upgrade-v01
```

The default mode is inspect-only. It reads the mission, checks the current branch and worktree, selects the first unblocked task, and writes an evidence-backed status update. It does not edit product files, commit, push, merge, deploy, or send messages.

Use `--execute` only when the mission explicitly allows the selected task's declared commands. Use `--delegate codex` only when a human has authorized implementation delegation for that task.

```sh
npm run agent:mission -- life-upgrade-v01 --execute
npm run agent:mission -- life-upgrade-v01 --delegate codex
```

## Resume after interruption

The runner stores the minimum resumable state in `.agent-state/<mission>.json`, appends evidence to `MISSION_LOG.jsonl`, and refreshes `LIVE_STATUS.md`. Re-running the same command is idempotent for a task already recorded as complete.

If the worktree is dirty, the runner stops and reports the paths. Create or reuse a clean worktree before continuing; do not stash or overwrite another person's work automatically.

Create or reuse a mission worktree only with the explicit mutation flag:

```sh
npm run agent:worktree -- life-upgrade-v01
npm run agent:worktree -- life-upgrade-v01 --create
```

GitHub inspection is read-only:

```sh
npm run agent:github -- life-upgrade-v01
```

Draft publication is also opt-in. It verifies the branch and then uses `gh pr create --draft`; it cannot merge or deploy:

```sh
npm run agent:publish-draft -- life-upgrade-v01
npm run agent:publish-draft -- life-upgrade-v01 --publish
```

Codex delegation is opt-in per task. A mission must provide `delegatePrompt`; the runner will not invent a broader implementation request:

```sh
npm run agent:mission -- life-upgrade-v01 --delegate codex
```

## Evidence commands

- `validate-mission.mjs` validates mission structure and scope before execution.
- `compare-baseline.mjs` runs a declared command on the current checkout and a temporary clean checkout of `origin/main`, then reports the comparison. A failure is baseline only when both runs fail with the same command.

## Recovery

If a command fails, the task remains blocked with its command and exit evidence. Fix the declared issue or update the mission explicitly; do not mark it complete by hand without evidence. If an approval gate is reached, stop and report the exact gate.
