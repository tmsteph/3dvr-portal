# Persistent Access Contract

Updated: 2026-09-15

3DVR should treat access as durable infrastructure, not something Thomas has to repeatedly reconstruct in chat. The default behavior is: preserve the authenticated path, verify it, recover it automatically when safe, and ask for human action only when the upstream service truly requires it.

## Core rule

**Never ask Thomas to reconnect a service merely because an agent cannot immediately see it.**

Before asking for login, pairing, MFA, or a fresh credential, the agent must check the capability registry, the canonical host, the expected session/profile, and the documented fallback. A human checkpoint is the final step, not the first troubleshooting step.

## Canonical homes

| Capability | Canonical path | Durable state |
| --- | --- | --- |
| Google Calendar | ChatGPT Google Calendar connector | OAuth connection managed by the connector |
| 3DVR Portal Calendar | `portal.3dvr.tech/calendar/` | Portal identity + calendar relay/import state |
| IATSE Local 122 | OVH persistent authenticated browser | General browser lane + broker-backed mirrored login |
| Encore / UKG / UltiPro | OVH persistent authenticated browser | Encore browser lane + broker-backed mirrored login |
| Encore SharePoint / Connect | OVH persistent authenticated browser | General browser lane + Microsoft/Encore tenant session |
| Lighthouse | OVH persistent authenticated browser | General browser lane; SharePoint-first Microsoft SSO is the canonical recovery path |
| Google Messages / SMS | OVH persistent authenticated browser | Messaging browser lane + phone pairing |
| WhatsApp Web | OVH persistent authenticated browser | Messaging browser lane + paired session |
| Credentials | Bitwarden / 3DVR Secrets Broker | Never copied into chat or ad-hoc files |

For exact workforce login/recovery procedures, see [`docs/workforce-access-runbook.md`](./workforce-access-runbook.md).

## Verification ladder

Use this order every time. Do not skip directly to reconnecting.

1. **Configured** — the capability exists in `/abilities/` and has a named primary path.
2. **Reachable** — the connector, remote host, browser/CDP lane, or service responds.
3. **Operational** — the target app loads and the expected workflow is present.
4. **Authenticated** — the app shows the signed-in account/session, not merely a login page.
5. **Writable when required** — the action can be performed with the proper approval/lease.

A failure at one level should be repaired at that level. Do not destroy a higher-level session to fix a lower-level process problem.

## Browser-session rules

- OVH is the only authority for persistent authenticated browser profiles.
- Reuse the named profile. Never launch a fresh temporary profile as a substitute for a missing authenticated lane.
- Before changing browser state, acquire the matching writer lease with `3dvr-browser-lease`.
- A dead browser process is **not** proof that pairing/login is lost. Restart the same profile first.
- A login page is evidence that authentication needs attention; process health alone is not enough.
- If the canonical profile directory or mount is missing, stop and repair the profile storage path before asking Thomas to sign in again.
- Never use the TouchBase/UltiPro time-clock surface for time-off work. Time-off requests belong in the UKG/UltiPro request-off workflow.

## Calendar + therapy workflow

The desired flow is one-way reliable and then reconciled:

1. Find confirmed therapy dates from authoritative sources such as Regain/FHCSD email, SMS, or the provider portal.
2. Create or update the event in Google Calendar without duplicates.
3. Confirm the same wall-clock time appears in the 3DVR Portal Calendar.
4. If the Portal copy differs, treat it as a sync/timezone bug and repair it; do not create a second appointment.
5. Check the work schedule and request the necessary time off through UKG/UltiPro.
6. Re-check after approval so Google Calendar, Portal Calendar, and work availability agree.

For the current known appointment, Google Calendar is authoritative: **2026-09-16 14:00–14:45 America/Los_Angeles**. A Portal display of 07:00–07:45 is a timezone/sync defect, not a separate event.

## Human checkpoints

Ask Thomas only when one of these is actually true:

- Google Messages explicitly requires phone re-pairing.
- UKG/Lighthouse explicitly requires login, MFA, or an owner-only challenge after the canonical saved session and broker-backed recovery path have been tested. For Lighthouse, establish the Encore SharePoint session first.
- Bitwarden requires an owner unlock/approval that the Secrets Broker cannot satisfy.
- A service presents CAPTCHA, identity attestation, legal acknowledgment, or another owner-only step.

When a checkpoint is needed, surface **one concrete action** and preserve all recovered state so Thomas does not repeat earlier steps.
