# 3DVR Campaigns

3DVR Campaigns is a phone-first Gmail outreach beta at `/campaigns/`.

## Current MVP

- A user connects their own Google account through the portal OAuth flow.
- The existing `gmail-send` scope key requests Gmail send permission without Gmail read permission.
- Campaign sends fail closed if the connected Gmail API cannot send; Campaigns never silently switches to the configured 3DVR SMTP mailbox.
- Contacts can be pasted or imported from a basic CSV.
- Messages support `{{first_name}}`, `{{name}}`, and `{{email}}` personalization.
- Commercial sends require a sender/business name, postal address, legitimate-contact acknowledgement, and append a plain-language opt-out footer.
- A browser-local suppression list skips opted-out recipients.
- Successful sends are capped at 25 per browser/account/day in the beta and spaced out instead of burst-sent.
- Drafts, OAuth connection metadata/tokens, suppression entries, and recent send history are currently browser-local.

## Product path

Pako is the first intended beta user, but the UI is intentionally generic. A later multi-tenant release should replace browser-local token persistence with an encrypted server-side credential vault keyed by 3DVR account + Google provider account, move campaign/contact/history records to the shared datastore, and run queued sends in a worker with per-account quotas, bounce handling, unsubscribe endpoints, and audit logs.

The MVP intentionally does not include lead scraping, purchased-list import, or unrestricted high-volume sending.

## AI lead discovery

Campaigns can take a broad ideal-customer description plus an optional location and ask the OpenAI Responses API to search the public web for matching businesses. The discovery path uses GPT-5.6 Luna by default and requires the web-search tool.

Discovery guardrails:

- return only public business emails with a public source URL;
- never infer or guess email-address patterns;
- omit candidates without a verified-looking public email;
- keep the source/evidence visible for human review before adding contacts;
- automatically mark imported AI discoveries as individually researched business contacts;
- keep manual paste/CSV import usable when API billing is unavailable.

The endpoint is multiplexed through `/api/openai-site?provider=lead-finder` so it does not add another Vercel serverless function. `OPENAI_API_KEY` funds the search; `OPENAI_LEAD_MODEL` can override the default model.

Lead discovery resolves AI credentials the same way as Operator: direct `OPENAI_API_KEY` first, then the Vercel AI Gateway via `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`. This avoids requiring a duplicate Vercel OpenAI secret when Operator is already using the shared provider path.
