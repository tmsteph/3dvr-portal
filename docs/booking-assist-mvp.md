# 3DVR Booking Assist MVP

Updated: 2026-09-16

## Offer

**3DVR Booking Assist — $20/month founding beta**

Initial niche: Encore AV technicians who want to take higher-paying IATSE/hall or freelance work without repeatedly reconciling multiple scheduling systems.

Core workflow:

```text
Lighthouse → IATSE availability → Encore / UKG time-off request
```

The product is a managed scheduling bridge, not a job board.

## Customer promise

Connect the relevant work accounts once, set simple booking rules, and let 3DVR handle repetitive schedule reconciliation. The technician remains in control of which jobs they accept and any action that creates an unusual commitment or conflict.

The normal customer experience should **not** involve VNC, remote desktops, SSH, or understanding the worker infrastructure.

The target experience is:

```text
Pay → enter/connect credentials once → approve MFA when needed → 3DVR handles the repetitive work
```

## Founding plan

- $20/month recurring
- founding beta
- Lighthouse → IATSE → Encore workflow
- persistent connection health
- conflict detection
- setup support
- cancel anytime

Stripe product: `prod_VH0wsDQmFP3qTD`
Stripe monthly price: `price_1UGSuGGiUl5dM378brsk1rYP`
Stripe payment link: `plink_1UGSuVGiUl5dM378EfMK64Xx`
Public checkout: `https://buy.stripe.com/aFa9AT3PwdWr38H4g4c7u0r`

Landing page: `/booking-assist/`
Post-checkout onboarding: `/booking-assist/onboarding/`

## Product scope: phase 1

The first useful loop should do only five things well:

1. Read the technician's confirmed or relevant Lighthouse schedule state.
2. Compare those dates with IATSE availability.
3. Update IATSE availability when policy clearly permits it.
4. Compare protected hall/freelance dates with Encore/UKG scheduling state.
5. Prepare or submit the corresponding Encore time-off request according to the technician's approval policy, then track pending/approved/denied state.

Do not broaden the MVP into a general marketplace until this loop is dependable for multiple real technicians.

## Backend product principle

**VNC is a recovery tool, not the product.**

Customers should interact with a normal 3DVR web portal. Browser automation, persistent sessions, secret retrieval, and server execution stay behind that interface.

The preferred architecture is:

```text
3DVR Portal
   ↓ HTTPS
Secrets Broker / encrypted vault
   ↓ scoped lease
Per-customer browser worker
   ↓
Lighthouse · IATSE · Encore/UKG
```

The customer should normally see only connection status, schedule state, actions taken, and things that genuinely need their attention.

## Onboarding target

The desired customer experience is:

```text
Pay → create workspace → connect 3 accounts once → choose rules → done
```

Normal onboarding should require as little technical knowledge as possible.

### Step 1 — Identity and subscription

After Stripe checkout:

- resolve or create a stable `twin_id` / customer identity;
- associate the Stripe customer/subscription with that identity;
- create a Booking Assist workspace record;
- create connector records for `lighthouse`, `iatse`, and `encore_ukg`;
- initialize the default booking policy;
- show a single onboarding progress screen.

### Step 2 — Credential-first connection

The default UX should be connector cards inside the portal:

```text
Lighthouse     Connect
IATSE          Connect
Encore / UKG   Connect
```

When a connector requires username/password authentication, the user enters the credentials into a connector-specific secure form.

The form must:

- submit only over HTTPS;
- send the value directly to the secrets service/broker path;
- never place plaintext credentials in the ordinary application database;
- never echo credential values back to the browser after save;
- never emit credentials into analytics, logs, task payloads, error traces, or chat;
- clear sensitive browser form state after successful save;
- use connector-specific secret aliases scoped to the customer's `twin_id`.

After credentials are saved, a worker should establish and preserve a browser session automatically.

Where a provider supports a safer delegated login, OAuth, SSO, passkey, or direct browser login flow, prefer that over stored passwords.

### Step 3 — Human checkpoints without VNC

MFA, push approval, one-time codes, CAPTCHA, password resets, and device verification are expected human checkpoints.

The portal should surface these as a simple **Needs Me** action, for example:

```text
Encore needs verification
Enter the 6-digit code sent to your phone
[______] [Continue]
```

or:

```text
Approve the Encore sign-in on your phone.
[I've approved it]
```

The worker preserves all prior state while waiting so the customer only completes the missing checkpoint.

### Step 4 — Recovery fallback

Only when a provider presents a flow that cannot be safely represented through the portal should 3DVR expose a temporary remote-browser/VNC-style session.

Rules for remote recovery:

- never make it the default onboarding path;
- launch only the affected customer's isolated browser workspace;
- use a short-lived authenticated link;
- expire access automatically;
- return to headless/persistent automation immediately after the checkpoint;
- record that recovery occurred without recording secrets or sensitive screen content.

## Credential and session architecture

Reuse the existing 3DVR access stack rather than introducing a separate password store.

### Required properties

- secret values never enter Git history;
- secret values are never returned after storage;
- normal application tables store secret aliases, not plaintext values;
- audit events record aliases/actions, never secret values;
- one stable secret alias namespace per customer / `twin_id`;
- browser profiles are isolated per customer;
- browser workers receive only the capabilities required for the current connector;
- browser workers receive secrets through short-lived scoped access where practical;
- customer session/cookie data is stored on encrypted persistent storage with restrictive filesystem permissions;
- logs redact credentials, cookies, authorization headers, tokens, and sensitive form values;
- backups preserve encryption and tenant boundaries;
- account deletion removes connector secrets and browser state according to retention policy.

Example logical aliases:

```text
/twins/<twin_id>/lighthouse/username
/twins/<twin_id>/lighthouse/password
/twins/<twin_id>/iatse/username
/twins/<twin_id>/iatse/password
/twins/<twin_id>/encore/username
/twins/<twin_id>/encore/password
```

These are logical references only. The actual backend can remain Bitwarden Secrets Manager today and become backend-agnostic later.

## Customer-facing dashboard

The customer should not see infrastructure unless something is wrong.

The normal dashboard can stay extremely small:

```text
Booking Assist

Connections
✓ Lighthouse
✓ IATSE
✓ Encore

This week
3 availability updates
2 Encore time-off requests submitted
0 conflicts

Needs Me
Nothing right now

Recent activity
Sep 16 · Marked Sep 24 unavailable in IATSE
Sep 16 · Requested Sep 24 off in Encore
```

Primary customer surfaces:

- **Connections** — connected / needs attention / disconnected;
- **Protected dates** — dates 3DVR is keeping aligned;
- **Needs Me** — MFA, ambiguity, unusual conflicts, provider challenges;
- **Recent activity** — concise audit trail;
- **Rules** — standing authorization and booking preferences.

No customer should need to understand browser profiles, queues, leases, secrets aliases, workers, or server topology during normal use.

## Multi-user workspace model

Thomas's existing persistent profiles prove the workflow but must not be reused as the multi-user storage layout.

Target layout:

```text
workspace
  twin_id
  subscription_status
  booking_policy
  connector_registry
  browser_workspace_ids
  secret_aliases
  audit_stream
  task_queue
```

Each connector should have a state machine similar to:

```text
not_configured
→ credentials_saved
→ establishing_session
→ authenticated
→ healthy
→ needs_human_checkpoint
→ degraded
→ disconnected
```

The agent should check connector health before requesting login again.

## Worker lifecycle

Each managed technician gets logically isolated execution, but the $20 plan does not require a dedicated VPS per person.

A shared OVH worker pool can host multiple technicians if all of the following remain isolated by `twin_id`:

- secret namespaces;
- persistent browser profiles;
- connector configuration;
- task queue ownership;
- audit events;
- normalized schedule data;
- temporary files;
- remote-recovery sessions.

Higher tiers can later offer dedicated workers/instances if customers need stronger isolation, more concurrency, or specialized integrations.

## Reconciliation engine

Normalize schedule records from every source before applying changes.

Suggested normalized record:

```text
booking_id
source
source_record_id
start_at
end_at
role
status
location
pay_rate (optional)
confidence
last_seen_at
```

Then derive actions through policy rather than hard-coding browser behavior:

```text
Lighthouse confirmed booking
  → mark date unavailable in IATSE
  → protect date against Encore scheduling
  → if Encore time-off missing, queue request
```

Every proposed mutation should use an idempotency key so retries do not create duplicate time-off requests or repeated IATSE changes.

## Approval policy

Default beta policy:

### Can run automatically

- read schedules;
- compare dates;
- detect conflicts;
- update clearly equivalent availability states under standing policy;
- prepare time-off request details;
- retry failed reads or expired sessions;
- record evidence and status.

### Require customer checkpoint

- first-time MFA / CAPTCHA / device approval;
- ambiguous or conflicting dates;
- a time-off action outside the customer's standing rule;
- destructive availability changes;
- provider warnings that could affect employment status;
- unusual commitments or policy exceptions.

Customers can later opt into broader standing authorization for routine time-off submission.

## Backend work plan

### Milestone A — paid beta plumbing

- Stripe webhook for checkout/subscription lifecycle.
- Create/update `twin_id` and Booking Assist workspace.
- Subscription gating for managed workers.
- Onboarding progress endpoint and UI.
- Customer-specific connector registry.

### Milestone B — secure credential onboarding

- Tenant-aware Secrets Broker aliases and policies.
- Connector-specific encrypted credential forms.
- Direct portal → broker secret-write route.
- Ensure plaintext secrets bypass ordinary app persistence.
- Credential-field redaction tests for logs, analytics, traces, and task payloads.
- Tenant-aware isolated persistent browser profiles.
- Automated session establishment after credential save.
- Session-health checks for Lighthouse, IATSE, and UKG.

### Milestone C — human checkpoint UX

- `Needs Me` queue.
- one-time-code entry flow;
- push-approval acknowledgement flow;
- CAPTCHA/device-verification escalation;
- short-lived remote-browser recovery only when required;
- automatic return to background automation after recovery.

### Milestone D — schedule reconciliation

- Lighthouse schedule adapter.
- IATSE availability adapter.
- Encore/UKG schedule + time-off adapter.
- Normalized booking model.
- Idempotent reconciliation jobs.
- Conflict detection and evidence capture.

### Milestone E — simple customer controls

- Rules: automatic vs approval-required.
- Connection health.
- Upcoming protected dates.
- Pending Encore time-off requests.
- Needs Me queue.
- Action history.

### Milestone F — second technician proof

Onboard one technician who is not Thomas. Do not call the backend multi-user-ready until the second technician can:

- pay;
- enter/connect credentials without server access;
- remain isolated from Thomas's sessions/secrets;
- establish all three persistent sessions;
- complete a Lighthouse → IATSE → Encore reconciliation;
- recover MFA or an expired session through the portal without normal VNC use;
- cancel and have managed execution stop cleanly.

## Infrastructure

Keep OVH as the primary persistent control/browser node for the current deployment. Reuse the existing durable task queue and resource lanes. Browser jobs are lane-limited; inexpensive parsing and reconciliation work can run concurrently. If CPU/RAM pressure rises, queued work waits instead of destabilizing the host.

Do not require the customer's laptop to remain on. Laptop/phone nodes are optional checkpoints, not the production execution host.

## Security posture for the beta

This product handles credentials for employment and labor scheduling systems, so secure defaults matter more than convenience shortcuts.

Minimum beta rules:

- TLS/HTTPS everywhere outside the host;
- encrypted secret storage;
- strict tenant scoping;
- no secret values in application DB rows;
- no secret values in logs or observability;
- no admin page that casually reveals saved passwords;
- short-lived worker access to secrets where practical;
- session and credential rotation/revocation support;
- customer-visible connector disconnect/delete action;
- auditable automation actions;
- rate limiting and CSRF/session protections on credential endpoints;
- remote-browser recovery links must be short-lived and customer-scoped.

Before broad public rollout, add a focused security review specifically around tenant isolation, secret exfiltration, browser-profile access, recovery links, and employee/admin access boundaries.

## Metrics for the beta

Track:

- paid technicians;
- successful account connections;
- percent of onboarding completed without VNC/remote desktop;
- human checkpoints per technician per month;
- days of availability updated;
- Encore time-off requests prepared/submitted;
- conflicts prevented;
- connector recovery success rate;
- time spent manually supporting each customer;
- cancellations;
- technician-reported higher-paying bookings enabled/protected.

The most important product metric is whether the technician can stop thinking about repetitive availability management while still trusting the system.

## Expansion after the loop works

Only after the core workflow is reliable:

1. additional IATSE locals;
2. other AV staffing/freelance portals;
3. rate and role preferences;
4. inbound job matching;
5. acceptance / confirmation workflows;
6. crew building;
7. invoicing and payments;
8. broader AV booking marketplace.

The long-term product can become a booking operating system for AV professionals, but the wedge remains the scheduling pain Encore technicians experience today.
