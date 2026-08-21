# 3DVR Work Agent

A worker-owned freelance booking agent for AV technicians and stagehands.

## First useful loop

1. Worker signs in and connects their own email.
2. Worker gives the agent a resume, experience, home market, minimum rate, and job rules.
3. Agent reads availability from Google Calendar and employer schedule sources such as Encore.
4. Agent finds relevant production companies and freelance calls.
5. Agent drafts personalized outreach from the worker's own identity.
6. Worker approves sends by default.
7. Agent watches replies, summarizes opportunities, and prepares responses.
8. Worker explicitly approves accepting work unless they later enable rule-based booking.
9. Confirmed work becomes a busy block so the agent does not double-book.

## MVP surfaces

`/work-agent/` is the first onboarding shell. It currently supports:

- worker profile and rate preferences
- resume-file selection metadata
- Google mail OAuth initiation
- Google Calendar OAuth initiation
- conservative outbound and booking policy controls
- an Encore connector placeholder
- an activity/audit placeholder

The page intentionally stores only non-secret connection metadata in its own work-agent storage. It does not yet persist OAuth credentials for a background worker.

## Existing 3DVR pieces to reuse

- Portal OAuth already supports Google identity, mail, and calendar scopes.
- The 3DVR agent already contains Gmail transport, inbox monitoring, and outreach sending code.
- The agent architecture already defines tenant-scoped queues, task risk classes, approval gates, and dedicated handling for credential-heavy workloads.
- GunJS remains the portal source of truth for owner-scoped product state once this shell moves beyond local prototype state.

## Production boundary

Do **not** make background email automation depend on browser `localStorage` tokens.

Before a real worker can leave the page and have 3DVR continue acting for them, add a server-side credential connection layer that:

- binds credentials to `provider + provider subject`, not just email
- encrypts refresh tokens at rest
- never returns stored refresh tokens to normal portal JavaScript
- limits scopes to the exact connector capability
- supports revoke/reconnect
- writes an auditable connection record without secrets
- keeps credential tasks on an isolated or dedicated worker path

The existing portal OAuth response shape can bootstrap the UX, but long-lived worker credentials need a safer server-side storage flow.

## Suggested owner-scoped data shape

```text
workAgent/<tenantId>/profile
workAgent/<tenantId>/resume
workAgent/<tenantId>/rules
workAgent/<tenantId>/connections
workAgent/<tenantId>/availability/sources
workAgent/<tenantId>/availability/blocks
workAgent/<tenantId>/companies
workAgent/<tenantId>/outreach
workAgent/<tenantId>/threads
workAgent/<tenantId>/opportunities
workAgent/<tenantId>/approvals
workAgent/<tenantId>/activity
```

Example policy:

```json
{
  "outboundMode": "draft",
  "bookingMode": "ask",
  "minimumDayRate": 400,
  "markets": ["San Diego"],
  "blockedCompanies": [],
  "allowTravel": false
}
```

## Availability contract

Every connector should normalize into the same shape:

```json
{
  "source": "encore|google-calendar|manual|iatse",
  "externalId": "source-record-id",
  "startsAt": "2026-09-01T08:00:00-07:00",
  "endsAt": "2026-09-01T18:00:00-07:00",
  "status": "busy|tentative|available",
  "label": "Encore call",
  "updatedAt": 1780000000000
}
```

Outreach should only target days that remain open after all sources are merged.

## Outreach state machine

```text
lead
  -> drafted
  -> awaiting_approval
  -> sent
  -> replied
  -> negotiating
  -> awaiting_booking_approval
  -> booked | declined | closed
```

Each external action gets an activity record with actor, timestamp, target, source message, and approval reference.

## Encore connector

Treat Encore as an availability source, not the central account identity.

Near-term implementation can reuse the browser/session automation already proven for the founder workflow, but the product connector should eventually expose a small normalized interface:

```text
connect()
refreshSession()
listSchedule(start, end)
health()
disconnect()
```

Store session secrets outside GunJS and outside normal portal browser storage.

## Next build order

1. Secure server-side OAuth credential storage for one test user.
2. Resume upload + text extraction into an owner-scoped profile.
3. Google Calendar availability normalization.
4. Encore schedule normalization using the existing browser workflow.
5. Company/lead records and draft-only outreach queue.
6. Inbox reply watcher and opportunity extraction.
7. Approval screen for send/reply/book actions.
8. First end-to-end test: one worker, one open date, one company, one approved outreach email, one captured reply.

The first revenue proof is not a fully autonomous agent. It is one additional AV worker getting one legitimate freelance opportunity through this loop.
