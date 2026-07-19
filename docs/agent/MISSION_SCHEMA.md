# Mission definition schema v1

Mission files are JSON and contain `schemaVersion`, `missionId`, `repository`, `defaultBranch`, `objective`, `approvalPolicy`, and a dependency-aware `tasks` array. Task states and mission states are explicit. Each task declares its risk class, model tier, backend, worktree requirement, allowed files, commands, acceptance tests, evidence, retry policy, and optional approval gate.

Runtime state is not committed. The event log is append-only and authoritative; state snapshots are atomic caches. Unknown future schemas are never silently erased.
