# Automation buyer funnel
Public intake: /automation-help/
Owner pipeline: /growth-desk/funnel.html, searchable inside Operator as Automation pipeline.

Target nationwide buyers who actively request automation help and have an approved budget.
The $200 diagnostic reviews one workflow within two hours; findings and a separate quote are the deliverable.
No automatic messages, invoices, charges or marketing subscriptions are created.

## Data and access
The funnel queue is private server SQLite, outside immutable releases:
 /opt/3dvr-portal-production/state/automation-funnel/leads.sqlite
AUTOMATION_FUNNEL_DB overrides it for tests or portable deployments. Node 22.13+ is required.
This bounded intake/qualification queue is authoritative for funnel state; it does not copy private inquiries into public Gun CRM nodes.
Gun is used only to reuse Portal identity. Private reads/writes require owner SEA proof, exact origin,
signed action/data, short expiry, single-use request ID, and optimistic record version.
Public intake returns only a receipt. Budget/authority are self-reported until confirmed.
Paid stages require a recorded payment reference; these are operator bookkeeping, not payment-provider verification.

Score: intent, budget, problem/impact, authority, readiness, each 0–2.
Qualified requires score >=8 and explicit intent, approved budget >=$200, and budget authority.
Unknown evidence stays unknown. Self-hosting is a fit signal rather than a financial proxy.
Research feed records have unconfirmed budget and authority; read the source before outreach.

## Daily acquisition
scripts/growth/collect-automation-buyers.mjs reads the public n8n Jobs RSS feed,
selects buyer-like requests from the last 30 days, caps at 20, and deduplicates by source.
It filters obvious seller posts but does not certify every post as a buyer.
Collector failures leave prior records intact and return a failed process.
Owner can also collect on demand. Upwork remains a manual source; no authenticated scraping added.
Review leads, qualify, prepare a draft, then use the verified source channel.
Record the contact and follow-up date after an authorized message is sent.

## Backup and recovery
Use Python sqlite3.Connection.backup against the live database, not a raw copy of WAL files.
Store backups outside public releases with mode 600; daily backups retain 14 copies.
Restore only while the collector and portal are stopped, after taking a current backup.
Pipeline export is also available to the owner; exports contain private buyer details.
The shared database path preserves records across Portal releases and restarts.

## Verification
node --test tests/automation-funnel.test.js
Start npm run dev as required for API changes; it is a static dev server.
For full API verification use scripts/self-host-server.mjs on an isolated loopback port
and AUTOMATION_FUNNEL_DB pointing to a temporary directory.
Test anonymous submission, unauthorized list rejection, real signed owner access,
record updates, dedupe, persistence after reopening, and mobile/desktop rendering.
Never seed test submissions into the production lead queue.

Scheduled units: 3dvr-automation-buyers.timer at 08:00 Pacific daily and 3dvr-automation-funnel-backup.timer at 08:10 Pacific. Both persist missed runs. Service failures are visible through systemd status/journal; this version does not send alerts.
The public job feed is international; qualify US/remote service fit from the original post before outreach.
