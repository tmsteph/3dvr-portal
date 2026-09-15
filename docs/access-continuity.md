# 3DVR Access Continuity

Last reviewed: 2026-09-15

This is the canonical policy for keeping Thomas's connected systems usable across chats, agents, server restarts, and browser restarts. The default is persistence and recovery, not repeated manual login.

## Prime directive

Before asking Thomas to reconnect, re-pair, re-authorize, or re-enter credentials, an agent must try the existing access path in this order:

1. Reuse the native connector or persistent authenticated browser lane already recorded in `/abilities/`.
2. Run a read-only health check and distinguish process failure from expired authentication.
3. Recover the existing service/session without creating a replacement profile or printing secrets.
4. Try the documented fallback path.
5. Ask Thomas for a human checkpoint only when the provider actually requires login, MFA, CAPTCHA, device pairing, consent, or another non-delegable step.

A server restart, dead Chromium process, stale CDP bridge, or new chat is not by itself a reason to ask Thomas to sign in again.

## Access layers

### 1. Native connectors

Prefer durable API/connector access whenever available. Gmail, Google Calendar, Contacts, Drive, GitHub, Vercel, and other connected services should not be routed through a browser merely because a browser exists.

### 2. Persistent browser lanes

OVH holds authenticated browser state. Reuse the existing profiles and never create a fresh profile as a recovery shortcut.

| Lane | Purpose | CDP | Profile |
| --- | --- | ---: | --- |
| `general` | IATSE, SharePoint, Lighthouse, general authenticated web work | `9222` | `/home/debian/.config/google-chrome-for-testing` |
| `encore` | Encore / UKG / UltiPro work | `9333` | `/home/debian/.config/3dvr/browser-profiles/encore` |
| `messaging` | WhatsApp + Google Messages / SMS | `9444` | `/home/debian/.config/3dvr/browser-profiles/messaging` |
| `training` | Encore University / training | `9555` | `/home/debian/.config/3dvr/browser-profiles/training` |

The CDP bridge exposes these as `19222`, `19333`, `19444`, and `19555`. Any state-changing automation must hold the matching `/usr/local/bin/3dvr-browser-lease` writer lease. Read-only inspection may be concurrent.

### 3. Scoped secrets

Credentials belong behind the 3DVR secrets broker with Bitwarden as the backend. Agents should request scoped access from the broker instead of asking Thomas to paste passwords into chat. Browser profiles may hold provider cookies/session state; secrets and session cookies must never be printed into logs or documentation.

## Recovery ladder

For a browser-backed integration, classify the failure before escalating:

- **CDP down, profile intact:** restart/recover the existing lane process using the same durable profile, then re-test.
- **Bridge down:** recover `3dvr-cdp-bridge.service`, then re-test the lane.
- **Page logged out:** try the approved secret-broker/autofill path if policy allows it.
- **Provider requires MFA/CAPTCHA/device pairing:** request one explicit human checkpoint, then preserve the resulting session.
- **Profile missing or corrupt:** treat as infrastructure failure. Restore the durable profile or backup; do not silently create a new identity.

Every recovery should update the capability registry's verification date/status so the next agent starts from evidence rather than assumptions.

## Special workflows

### Therapy and schedule reconciliation

Therapy scheduling should reconcile Gmail + SMS/Google Messages + Google Calendar + the 3DVR Portal calendar + employer request-off systems. Google Calendar is the canonical personal calendar. Portal Calendar should consume/sync that event rather than maintaining an independent time-shifted duplicate.

### Encore / UKG / UltiPro

The `encore` lane is authorized for schedule and request-off workflows. `PostLogout.aspx` is an expired session, never an authenticated state; the login runner must recover through the real login page and verify `/default.aspx`. **Do not use the time-clock workflow unless Thomas explicitly asks for time-clock work.** Request-off operations should reuse the existing Encore/UKG session and preserve it after completion.

### Messaging

Google Messages/SMS and WhatsApp use the `messaging` lane. If the lane process is down, recover the same profile first. Re-pair the phone only when the web provider has invalidated the pairing and recovery proves the stored session is unusable.

### Lighthouse

Lighthouse recovery is **SharePoint first, then Lighthouse in the same `general` profile**. Establish the Encore Microsoft tenant session through `psav.sharepoint.com`, complete provider-enforced MFA if needed, keep the session signed in, then open Lighthouse and allow its SSO callback to complete. See [`docs/workforce-access-runbook.md`](./workforce-access-runbook.md) for the exact procedure.

Lighthouse access should be checked through the documented authenticated browser path. A redirect to `/login` means the live session is not authenticated; it does not mean the account or capability should be forgotten. Recover the session using the same profile and approved credential path.

## Health contract

`scripts/ops/access-continuity-health.sh` performs a read-only local check of the persistent browser ports, CDP bridge service, secrets broker, and lane leases. It intentionally does not log credentials or mutate browser state.

The desired steady state is automatic verification plus self-healing for process/service failures. Human reconnection should be the exception reserved for provider-enforced authentication events.

## Canonical references

- `/abilities/` — user-facing capability/status inventory.
- `abilities/abilities.json` — machine-readable capability registry.
- `docs/infrastructure-topology.md` — node roles, browser lanes, and CDP bridge topology.
- `docs/workforce-access-runbook.md` — exact IATSE, UKG, SharePoint, and Lighthouse login/recovery procedures and failure history.
- `AGENTS.md` — browser writer-lease rules.
- `scripts/ops/browser-lane-lease.sh` — cooperative single-writer implementation.
- `ops/secrets-broker/` — scoped credential access.

## Definition of done

An integration is considered durable only when its primary access path, durable state owner, health check, recovery path, fallback, and human checkpoint are documented. "Thomas can reconnect it manually" is not a recovery strategy.
