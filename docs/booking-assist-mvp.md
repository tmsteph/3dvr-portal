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

### Step 2 — Account connection

Preferred connection order:

1. **Direct session establishment** — launch the customer's isolated browser workspace and let the customer sign in directly to each provider. Preserve the authenticated browser profile where provider rules permit it.
2. **Brokered credential storage** — only when persistent credential fill is necessary, collect the secret through a secure connector-specific form that sends it over HTTPS directly to the OVH Secrets Broker / encrypted backend.
3. **Human checkpoints** — MFA, CAPTCHA, device approval, password reset, or provider challenges are explicit customer actions. Preserve all other state so the user performs only the missing checkpoint.

Never accept credentials through chat, email, GitHub issues, repository files, analytics events, or ordinary application logs.

## Credential and session architecture

Reuse the existing 3DVR access stack rather than introducing a new vault.

### Required properties

- secret values never enter Git history;
- secret values are never returned after storage;
- audit events record aliases/actions, never secret values;
- one stable secret alias namespace per customer / `twin_id`;
- browser profiles are isolated per customer;
- browser workers receive only the capabilities required for the current connector;
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
```

These are logical references only. The actual backend can remain Bitwarden Secrets Manager today and become backend-agnostic later.

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
→ awaiting_login
→ authenticated
→ healthy
→ needs_human_checkpoint
→ degraded
→ disconnected
```

The agent should check connector health before requesting login again.

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

- first login / MFA / CAPTCHA;
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

### Milestone B — secure multi-user access

- Tenant-aware Secrets Broker aliases and policies.
- Tenant-aware isolated persistent browser profiles.
- Connector-specific direct-login handoff.
- Redaction tests for logs/audit events.
- Session-health checks for Lighthouse, IATSE, and UKG.

### Milestone C — schedule reconciliation

- Lighthouse schedule adapter.
- IATSE availability adapter.
- Encore/UKG schedule + time-off adapter.
- Normalized booking model.
- Idempotent reconciliation jobs.
- Conflict detection and evidence capture.

### Milestone D — simple customer controls

- Rules: automatic vs approval-required.
- Connection health.
- Upcoming protected dates.
- Pending Encore time-off requests.
- Needs Me queue.
- Action history.

### Milestone E — second technician proof

Onboard one technician who is not Thomas. Do not call the backend multi-user-ready until the second technician can:

- pay;
- connect accounts without server access;
- remain isolated from Thomas's sessions/secrets;
- complete a Lighthouse → IATSE → Encore reconciliation;
- recover an expired session with a single human checkpoint;
- cancel and have managed execution stop cleanly.

## Infrastructure

Keep OVH as the primary persistent control/browser node for the current deployment. Reuse the existing durable task queue and resource lanes. Browser jobs are lane-limited; inexpensive parsing and reconciliation work can run concurrently. If CPU/RAM pressure rises, queued work waits instead of destabilizing the host.

Do not require the customer's laptop to remain on. Laptop/phone nodes are optional checkpoints, not the production execution host.

## Metrics for the beta

Track:

- paid technicians;
- successful account connections;
- days of availability updated;
- Encore time-off requests prepared/submitted;
- conflicts prevented;
- human checkpoints per technician per month;
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
