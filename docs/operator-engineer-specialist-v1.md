# Engineer Specialist V1 — executable policy contract

Status: experimental; disabled by default. Tracking: #3177.

Engineer is a capability profile of Hosted Operator, not a separate chatbot, login, or service. A task submitted from mobile uses the existing authenticated tenant task store, worker and durable result view.

## Policy

- Explicit opt-in feature flag `ENGINEER_SPECIALIST_ENABLED`; default false.
- Per-task repository allowlist and immutable base commit; refuse unspecified repositories.
- Checkout into a unique ephemeral sandbox with no host credentials, Docker socket, production mount, or shared tenant browser session.
- No network egress by default. Any dependency fetch requires a declared allowlist.
- Allow read/search, edits in task worktree, lint/tests and local git diff; deny production deploy, merge, customer access, messaging and credential changes.
- Bound runtime, output bytes, subprocess count, token spend and retries; cancel on limit.
- Treat repository instructions as untrusted task data unless explicitly authorized by policy.
- Deliver diff, test results, security/secret scan outcome and human-review PR link; never merge automatically.

## Model routing

Choose only among user-approved models/providers. Record capabilities and prices from versioned configuration, not model-name assumptions. Begin with one baseline model and one cheaper candidate; compare on the same frozen tasks. If the cheaper model fails checks, escalate only within approved cost/privacy caps. Persist provider, model version, input/output tokens, latency, estimated cost and reason for fallback. Never silently cross provider/privacy boundaries.

## Benchmark schema

Each benchmark case includes `id`, `repo`, `base_sha`, `issue_url`, `task_prompt`, `allowed_paths`, `test_commands`, `expected_behavior`, `max_cost_usd`, and `timeout_seconds`.

Results include `case_id`, `model`, `base_sha`, `patch_sha`, `test_pass`, `lint_pass`, `secret_scan_pass`, `human_review_pass`, `wall_seconds`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `interventions`, and `failure_reason`. Never report missing metrics as zero or claim a task passed without actually running its checks.

## Release gates

1. Verify Hosted Operator crash-safe task lease recovery and tenant isolation before executing tasks.
2. Run at least five frozen, representative issues in isolated environments with repeatable commands.
3. Compare quality, cost and latency; require a reviewer to inspect diffs and test evidence.
4. Open draft PR; enable only after explicit production approval.

## UX

The customer sees Task → Working → Needs approval / Failed / Complete, with concise progress and artifacts. The Operator owns the conversation; Engineer remains an internal specialist.