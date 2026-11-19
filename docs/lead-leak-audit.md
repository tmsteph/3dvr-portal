# Lead Leak Audit intake

Public intake: /lead-leak-audit/ (the request form at the bottom of the page).
Submissions POST to /api/lead-leak-audit, handled by src/lead-leak-audit/
(model, store, handler), following the automation funnel pattern in
docs/automation-funnel.md.

## Data and access

Requests are private server SQLite, outside immutable releases:
 /opt/3dvr-portal-production/state/lead-leak-audit/requests.sqlite
LEAD_LEAK_AUDIT_DB overrides it for tests or portable deployments. Node 22.13+ is required.
Each stored record holds the business, contact name, reply email, website,
phone, business type, note, self-check leaks, estimator inputs, and a
`notified` flag. Identical email + business + phone submissions deduplicate
to the first record. Records are never copied into public Gun nodes.

## Notification

Each new (non-duplicate) request also emails Thomas at 3dvrtech@gmail.com
(override with LEAD_LEAK_AUDIT_NOTIFY_EMAIL) using the portal Gmail transport
(GMAIL_USER / GMAIL_APP_PASSWORD), with Reply-To set to the submitter. The
stored record is authoritative: if email is unconfigured or fails, the
submission still succeeds and the record stays `notified: false` so the
request can be picked up from the database.

## Abuse controls

POST only, exact portal origin when an Origin header is present, a honeypot
`websiteTrap` field, and rate limits per IP (60/hour) and per email (5/hour),
mirroring the automation funnel handler.

## Verification

node --test tests/lead-leak-audit.test.js
For full API verification use scripts/self-host-server.mjs on an isolated
loopback port with LEAD_LEAK_AUDIT_DB pointing to a temporary directory.
Never seed test submissions into the production request queue.
