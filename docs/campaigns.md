# 3DVR Campaigns

3DVR Campaigns is a phone-first Gmail outreach beta at `/campaigns/`.

## Current MVP

- A user connects their own Google account through the portal OAuth flow.
- The existing `gmail-send` scope key requests Gmail send permission without Gmail read permission.
- Contacts can be pasted or imported from a basic CSV.
- Messages support `{{first_name}}`, `{{name}}`, and `{{email}}` personalization.
- Commercial sends require a sender/business name, postal address, legitimate-contact acknowledgement, and append a plain-language opt-out footer.
- A browser-local suppression list skips opted-out recipients.
- Successful sends are capped at 25 per browser/account/day in the beta and spaced out instead of burst-sent.
- Drafts, OAuth connection metadata/tokens, suppression entries, and recent send history are currently browser-local.

## Product path

Pako is the first intended beta user, but the UI is intentionally generic. A later multi-tenant release should replace browser-local token persistence with an encrypted server-side credential vault keyed by 3DVR account + Google provider account, move campaign/contact/history records to the shared datastore, and run queued sends in a worker with per-account quotas, bounce handling, unsubscribe endpoints, and audit logs.

The MVP intentionally does not include lead scraping, purchased-list import, or unrestricted high-volume sending.
