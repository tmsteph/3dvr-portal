# Mission runner runbook

```sh
3dvr mission validate life-upgrade-v01
3dvr mission status life-upgrade-v01
3dvr mission run life-upgrade-v01
3dvr mission run life-upgrade-v01 --execute
3dvr mission run life-upgrade-v01 --simulate
3dvr mission resume life-upgrade-v01
3dvr mission events life-upgrade-v01
```

The default is inspect-only. `--execute` is required for worktree creation, checks, delegation, commits, pushes, or pull-request metadata writes. Simulation uses fixtures and never contacts GitHub or writes a remote. Every transition is recorded before the next action. A future state schema is preserved and refused rather than overwritten.

When a task fails, inspect its evidence, fix only the declared scope, and resume. When a task reaches an approval gate, the runner records `awaiting_approval` and stops. An approval is valid only for the recorded mission, task, action, target, and head SHA.
