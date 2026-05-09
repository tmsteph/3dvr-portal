# Agent Guidance

- Assume other agents may be working in the same repo or on nearby branches.
- Prefer dedicated worktrees for isolated work instead of sharing one checkout.
- Pull and merge often so your branch stays close to `origin/main` and you do not build on stale context.
- If the change is scoped, tests pass, and you are confident in the result, merge it instead of leaving it hanging.
- Keep PRs narrow and do not overwrite or revert other agents' changes unless the user explicitly asks.
