# Operator as a continuous assistant

Operator should feel like one persistent presence, not a router to separate tools.

## Product rule

When Operator delegates work, the chat remains the source of truth.

- Say what is happening now.
- Show a runtime budget when one is known.
- Keep listening to the delegated task.
- Replace queued/running text with the terminal result.
- Surface needs-input, blocked, failed, and rejected states plainly.
- Keep task/workspace links available for depth, not as a requirement for status.

## Execution states

The user-facing flow is:

`thinking → queued → working → complete`

with side exits for `needs input`, `blocked`, and `failed`.

Code edits use Forge status, generic low-risk work uses Operator Runtime status, and server operations use the signed server-control request status.
## Interaction model

The homepage and full Operator share the same action-status plumbing.

A background watcher updates the assistant message that launched the work. If the user starts another message before the old task finishes, the old conversation entry is still updated in storage without hijacking the newer visible reply.

This keeps handoffs transparent while preserving a calm phone-first chat.

## Next layers

The same task-handle model can later cover email sends, calendar writes, browser jobs, deployments, and other durable workflows.

Those integrations should publish a stable id, status, concise result, and evidence/verification metadata so Operator can report progress without requiring the user to open another app.