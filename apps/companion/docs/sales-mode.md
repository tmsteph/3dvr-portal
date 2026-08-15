# Companion Sales Mode

Sales Mode turns the permissioned Companion bridge into a bounded sales assistant without granting arbitrary phone control.

## v0.1 flow

1. Observe locally normalized notification metadata from apps the user has explicitly permitted.
2. Identify likely lead/customer conversations and attach them to a CRM lead id.
3. Draft a concise reply or next action.
4. Open the known conversation and prepare the draft when the local adapter supports it.
5. Require near-time user approval before any outbound send.
6. Record the result for CRM/audit history.

## Guardrails

- Never execute arbitrary remote Accessibility selectors.
- Never send to a suppressed contact.
- Expire stale sales tasks.
- Default to at most one outbound sales message per contact per UTC day.
- Never send an empty message.
- v0.1 outbound sends always require explicit approval.
- Drafting, triage, and CRM preparation can run without send authority.
- Every device-side request should retain an id, lead id, reason, expiration, and audit result.
- The user must be able to disable Companion, notification access, Accessibility, or the bridge independently.

## Capability mapping

- `sales.inbox.triage`: classify normalized notification metadata.
- `sales.conversation.open`: navigate to a locally known conversation without sending.
- `sales.message.prepare`: place an approved draft into a known UI without pressing send.
- `sales.message.send`: press/send only after explicit approval.

## Next Android slice

Wire generated Flutter Android boilerplate to Kotlin adapters for:

- `NotificationListenerService` -> normalized local sales-event metadata.
- allowlisted app/deep-link opening.
- one or two locally defined Accessibility actions for preparing a reply in a known app.
- an approval surface that issues a short-lived local token for `sales.message.send`.

Do not add generic remote tap coordinates, arbitrary selectors, or remote shell execution.
