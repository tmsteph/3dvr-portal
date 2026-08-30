# Provider-neutral MCP gateway

## Goal

Give 3DVR one connector layer that can serve Claude, ChatGPT, Operator, CLI agents, and future models without rebuilding Gmail or GitHub integrations for each client.

The gateway belongs in `apps/agent` because it owns long-running server processes, secrets, and agent integrations. It should not depend on the public `3dvr-connect` experience.

## First useful version

Start with four capabilities:

1. Account registry for multiple named identities.
2. Gmail read, draft, and send tools.
3. GitHub repository and pull-request tools.
4. Approval and audit records for consequential actions.

Avoid building a general integration marketplace in v0.1.

## Client model

Expose the same underlying actions through a small internal tool API and an MCP transport.

```text
Claude ---------\
ChatGPT ---------+--> MCP / tool gateway --> provider adapters
3DVR Operator ---+                         |-> Google
CLI agents ------/                         |-> GitHub
                                          `-> future providers
```

Clients should identify themselves, but provider credentials remain owned by the gateway. A model never receives raw OAuth refresh tokens, GitHub app private keys, or other long-lived credentials.

## Account registry

A user may connect more than one Google account. Each connection gets a stable internal ID plus a human-readable alias.

Example:

```json
{
  "id": "acct_google_01",
  "provider": "google",
  "alias": "personal",
  "email": "user@example.com",
  "scopes": ["gmail.readonly", "gmail.compose"],
  "status": "connected"
}
```

Tools that can touch more than one identity must require an explicit `account_id` or alias. Never silently guess which mailbox should send a message.

OAuth tokens belong in encrypted server-side storage or a secret manager. Do not store tokens in Git, GunJS, browser local storage, logs, or MCP responses.

## Initial tool surface

### Identity

- `accounts.list`
- `accounts.get`

### Gmail

- `gmail.search`
- `gmail.read`
- `gmail.create_draft`
- `gmail.send_draft`
- `gmail.reply`

Every Gmail tool takes `account_id`. Searches and reads are non-consequential. Sending, replying, forwarding, deleting, and permission changes are consequential.

### GitHub

Prefer a GitHub App installation over long-lived personal access tokens.

- `github.list_repositories`
- `github.read_file`
- `github.search_code`
- `github.create_branch`
- `github.write_file`
- `github.open_pull_request`
- `github.merge_pull_request`

The first coding workflow should be branch -> edit -> test/check -> PR. Direct writes to protected/default branches should remain disabled unless a policy explicitly allows them.

## Approval policy

Use three action classes.

### Read

Examples: list accounts, read mail, inspect repositories.

Default: allowed when the connected user granted the provider scope.

### Prepare

Examples: draft an email, prepare a code patch, open a draft PR.

Default: allowed and fully audited.

### Commit

Examples: send email, merge a PR, delete data, change access, publish externally.

Default v0.1: require an explicit approval token or an existing narrowly-scoped policy. The audit record should show who/what approved the action.

Later, users can create policies such as:

- allow replies from a specific mailbox to existing CRM contacts;
- allow PR creation in selected repositories;
- allow auto-merge only after required checks pass.

## Audit record

Record every tool invocation with enough metadata to reconstruct what happened without storing provider secrets.

```json
{
  "id": "audit_...",
  "time": "2026-08-29T23:00:00Z",
  "actor": "claude",
  "user_id": "...",
  "tool": "gmail.send_draft",
  "account_id": "acct_google_01",
  "target": "message-or-resource-id",
  "approval": "explicit",
  "result": "success"
}
```

Do not log OAuth tokens, authorization headers, email bodies by default, or private repository contents unless a debugging policy explicitly enables safe redacted capture.

## Transport

Implement provider adapters independently from MCP. The MCP server should be a thin transport and authorization layer over those adapters so the same code can also power the portal and Operator.

Suggested internal shape:

```text
apps/agent/
  connectors/
    accounts/
    google/
    github/
    policy/
    audit/
  mcp/
    server.js
```

Do not lock business logic to Anthropic-specific connector APIs. MCP is one client protocol, not the source of truth.

## v0.1 acceptance criteria

- Two different Google accounts can be connected and listed at the same time.
- Gmail searches are scoped to an explicit account.
- A draft can be created for either account.
- Sending requires approval by default and produces an audit record.
- A GitHub repository can be read through the gateway.
- The gateway can create a branch and open a PR without exposing a GitHub credential to the model.
- Claude or another MCP client can discover and call the same tools.
- Provider adapters can be called without MCP so 3DVR Operator can reuse them.

## Build order

1. Account registry and encrypted credential references.
2. Google OAuth connection flow with multiple simultaneous accounts.
3. Gmail read + draft actions.
4. Approval + audit layer.
5. Gmail send action.
6. GitHub App adapter and PR workflow.
7. MCP transport and client registration instructions.

Keep the first release boring, inspectable, and reversible. The value is one dependable permissioned connector layer, not maximum autonomy on day one.
