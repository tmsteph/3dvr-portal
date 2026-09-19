# Human Handoff Gateway

Human Handoff is the phone-first escape hatch for browser workflows that reach a step requiring the account owner: CAPTCHA, MFA, OAuth consent, identity confirmation, or an explicit sensitive approval.

## Runtime path

The canonical persistent browser stays on OVH. Human Handoff does not launch a replacement browser and does not expose VNC to the public Internet.

For the current browser lanes, the gateway attaches directly to the exact Chrome tab through the loopback-only Chrome DevTools Protocol endpoint. It captures that tab's viewport and forwards only scoped pointer, scroll, text, and limited key events from the short-lived phone session.

The first acceptance path is:

1. The existing `general` browser lane reaches Upwork human verification.
2. The gateway selects the already-open Upwork target on port 9222.
3. It acquires the `general` writer lease before enabling human control.
4. It creates an opaque five-minute handoff capability.
5. The Portal opens the same tab on the phone.
6. The user completes the human-only step and taps Done.
7. The gateway revokes the session and releases the lease.
8. Automation must acquire a fresh writer lease before it resumes.

## Lease invariant

Creation requires the matching browser lane to be writable by the gateway. While the handoff is active, the gateway owns and renews that lease. Other agents must treat the lane as unavailable.

Resolve, cancel, expiry, or lease loss removes interactive access. The current implementation releases the lease on resolve; resumed automation must explicitly reacquire it. This preserves the no-concurrent-writers invariant even before automatic resume is added.

## Capability lifecycle

The initial URL contains a random capability in the URL fragment, so it is not sent in ordinary HTTP request lines or referrers. The Portal exchanges it for a new random session capability when the user taps Continue. Only token hashes are retained in gateway memory.

Default lifetime is one hour. The browser-side session token is kept in session storage only to survive ordinary phone backgrounding/reconnects. Done, cancel, expiry, or service loss invalidates access.

## Guided step metadata

A handoff may include up to 12 ordered guide steps. Each step contains a short instruction and optional `targetText`. The metadata is persisted with the handoff so reconnects and gateway restarts keep the same guide.

When the phone activates a step, `POST /human-handoff/api/guide` asks the gateway to locate matching visible text in the already-open page and call `scrollIntoView` through CDP. This is navigation assistance only: it never clicks, checks, accepts, submits, or otherwise makes the human decision.

CLI callers can provide steps as JSON:

```bash
node human-handoff-gateway.js create \
  --lane general \
  --origin https://example.com \
  --service "Example application" \
  --reason "A few final human approvals are required." \
  --steps '[{"instruction":"Read the agreement","targetText":"Applicant Agreement"},{"instruction":"Confirm if you agree","targetText":"I acknowledge"},{"instruction":"Submit","targetText":"Submit Application"}]'
```

## Mobile pan/scroll contract

At zoom 1×, a drag scrolls the remote page. Above 1×, a drag first pans the locally enlarged frame. Once the local pan reaches its vertical boundary, continued drag emits bounded remote wheel events. This preserves pinch zoom while eliminating the dead-end feeling at the edge of the image.

## Privacy and logging

Do not log capability tokens, screenshots, page contents, passwords, MFA codes, CAPTCHA answers, cookies, or browser storage.

Audit records contain only lifecycle metadata: timestamp, handoff id, lane, service label, and state.

## Deployment

The gateway listens only on `127.0.0.1:4312`. Caddy routes only `/human-handoff*` to it; the rest of `portal.3dvr.tech` continues to the normal Portal service.

The systemd unit runs as `debian`. Browser-lane writes are coordinated through `sudo -n /usr/local/bin/3dvr-browser-lease <acquire|renew|release> ...`.

Current lanes remain:

- `general` → 9222
- `encore` → 9333
- `messaging` → 9444
- `training` → 9555
- `identity` → 9666

## Next integration

When `detectHumanChallenge()` returns a human challenge during an agent workflow, the caller should create a handoff for that workflow's existing browser lane and target origin, present the short-lived URL to the user, wait for a resolved state, reacquire the writer lease, and continue from the same tab.
