# Reporting Contract

Every mission run reports:

- mission id and selected task;
- current branch, worktree cleanliness, and repository path;
- dependency and approval-gate status;
- commands actually run, exit codes, and timestamps;
- changed-file scope and baseline comparison evidence;
- commit hashes, branch pushes, and PR numbers only when they actually occurred;
- blockers, unresolved risks, and the next safe task.

Human-readable state lives in `.agent-state/LIVE_STATUS.md`. Append-only machine evidence lives in `.agent-state/MISSION_LOG.jsonl`. Neither file may contain secrets or personal life content.
