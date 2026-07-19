# Reporting contract

Status is generated from mission state and evidence, not model recollection. Reports contain actions, observations, decisions, blockers, commands, tests, commit hashes, PR numbers, and unresolved risks. They do not contain hidden reasoning, secrets, tokens, cookies, authorization headers, email bodies, or private user text.

Worker results use:

```json
{
  "taskId": "...",
  "status": "completed",
  "artifacts": [],
  "changedFiles": [],
  "commandsRun": [],
  "testResults": [],
  "observations": [],
  "assumptions": [],
  "unresolvedRisks": [],
  "headSha": null,
  "pullRequest": null
}
```
