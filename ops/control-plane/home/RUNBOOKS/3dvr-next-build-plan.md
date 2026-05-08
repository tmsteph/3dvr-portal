# 3DVR Next Build Plan

This plan is written for smaller agents. Keep tasks narrow, verify each change, and avoid turning the platform vision into a rewrite.

Primary rule: `Sell first. Build second. Keep it simple.`

## North Star

3DVR is open personal computing: a browser-first, repairable operating layer for notes, tasks, meetings, contacts, agents, devices, and automation.

The near-term product is not a website. It is a practical operating system centered on `portal.3dvr.tech`, backed by `api.3dvr.tech`, a DigitalOcean hub, and device helpers.

## Target Architecture

```text
Phone / Desktop / Browser
  -> PWA or app shell
  -> portal.3dvr.tech
  -> api.3dvr.tech
  -> DigitalOcean hub
  -> services, AI, realtime, automation
```

Suggested server layout:

```text
/opt/3dvr/
  portal/
  api/
  agent/
  ai/
  relay/
  logs/
```

Core services:

| Service | Purpose |
| --- | --- |
| portal | frontend and installed PWA |
| api | auth, data, notifications, device pairing |
| relay | realtime presence and control events |
| agent | outreach, automation, scheduled jobs |
| ai | local model gateway |
| caddy or nginx | routing and SSL |

## Phase 1: DigitalOcean Hub

Goal: make the DO server a boring, secure deployment target.

Agent task cards:

1. Inventory current server state.
   - Repo target: new doc in `RUNBOOKS/` or `3dvr-portal/ops/`.
   - Commands to gather: OS version, open ports, installed Docker, Node, PM2, Caddy/Nginx, UFW, Fail2ban.
   - Acceptance: a server inventory doc exists with unknowns clearly marked.

2. Create bootstrap script.
   - Install Docker, Docker Compose plugin, Git, Node LTS, PM2, Caddy or Nginx, UFW, Fail2ban.
   - Do not embed secrets.
   - Acceptance: script is idempotent enough to rerun safely and prints next manual steps.

3. Define `/opt/3dvr` layout.
   - Create folders for `portal`, `api`, `agent`, `ai`, `relay`, `logs`.
   - Add `.gitkeep` only where needed.
   - Acceptance: layout doc and setup script agree.

4. Add server health checks.
   - Minimum: disk, memory, Docker daemon, reverse proxy, open ports.
   - Acceptance: one command produces a readable health summary.

## Phase 2: Unified API

Goal: create `api.3dvr.tech` as the brainstem.

Start simple. Use Fastify or Express. Prefer Fastify if starting fresh.

Required endpoints:

```text
GET  /health
POST /auth/session
GET  /notes
GET  /tasks
GET  /contacts
POST /chat
POST /agent/run
POST /device/pair
POST /deploy/request
```

Agent task cards:

1. Create `3dvr-api` or add `api/` if the chosen repo already owns backend code.
   - Acceptance: `npm test` and `npm run dev` work.

2. Add `/health`.
   - Return service version, uptime, and dependency status placeholders.
   - Acceptance: `curl /health` returns JSON and test coverage exists.

3. Add typed route stubs.
   - Do not build full data models yet.
   - Acceptance: each route returns a stable response shape and is covered by tests.

4. Add deployment notes for `api.3dvr.tech`.
   - Include env vars, reverse proxy expectations, and local dev command.
   - Acceptance: a new agent can boot the API locally from the README.

## Phase 3: Identity

Goal: one account everywhere.

Start with the simplest reliable option. Supabase Auth is acceptable. Auth.js is acceptable if the portal is already moving that way. Keycloak is later, not first.

Agent task cards:

1. Audit current portal auth.
   - Repo target: `3dvr-portal`.
   - Acceptance: doc lists current auth entrypoints, storage keys, Gun identity paths, and billing assumptions.

2. Choose first unified session boundary.
   - Keep existing users working.
   - Acceptance: decision doc says what owns login and what still depends on legacy Gun identity.

3. Add session status endpoint or portal session bridge.
   - Acceptance: portal can ask `api.3dvr.tech` who the user is without breaking guest mode.

## Phase 4: Data And Realtime

Goal: stop relying on one sync mechanism for every job.

Recommended split:

| Need | Tool |
| --- | --- |
| persistent data | Postgres or Supabase |
| realtime presence | WebSocket or Gun |
| offline cache | IndexedDB |
| local-first behavior | service worker |

Agent task cards:

1. Map current Gun nodes.
   - Repo target: `3dvr-portal`.
   - Acceptance: doc lists node paths for notes, meetings, contacts, CRM, billing hints, and video control.

2. Pick one data model to migrate first.
   - Recommended: notifications or device pairing, not billing.
   - Acceptance: migration plan includes old path, new table/API shape, and fallback behavior.

3. Add IndexedDB cache wrapper.
   - Use it for one feature only.
   - Acceptance: feature still works offline and syncs when online.

## Phase 5: PWA And Notifications

Goal: make the portal useful from the phone without pretending PWA push is perfect.

Notification layers:

| Layer | Scope |
| --- | --- |
| in-app notification center | always available inside portal |
| Web Push | Android, desktop, iOS Home Screen installs |
| helper fallback | Android helper, desktop helper, email, SMS, Telegram, WhatsApp |

Agent task cards:

1. Build notification center UI.
   - Repo target: `3dvr-portal`.
   - Acceptance: user can see unread items in-app without enabling push.

2. Add push subscription API.
   - Repo target: API.
   - Store browser subscriptions server-side.
   - Acceptance: subscription can be created, listed for current user, and revoked.

3. Add service worker push handler.
   - Include notification click behavior.
   - Acceptance: test covers service worker source and manual browser test is documented.

4. Add fallback policy.
   - Hub decides: in-app first, push if available, helper/email/SMS if needed.
   - Acceptance: policy is encoded in code or a runbook, not just chat.

## Phase 6: Device Layer

Goal: make phones and desktops become paired computing nodes.

Android goal:

```text
3dvr app or PWA
  -> Termux
  -> proot Debian
  -> SSH
  -> local models
  -> storage and USB devices
```

iPhone goal:

```text
PWA
  -> push where supported
  -> cloud AI
  -> remote terminal/control
```

Desktop goal:

```text
Creator Mode
  -> OBS, Blender, coding, Docker, AI, media production
```

Agent task cards:

1. Device pairing spec.
   - Define pairing token, device name, platform, capabilities, last seen.
   - Acceptance: API contract and portal UI sketch exist.

2. Android helper prototype.
   - First version may be Termux script, not native app.
   - Acceptance: paired device can report battery/platform/time and receive a test notification.

3. Desktop helper prototype.
   - First version may be Node CLI.
   - Acceptance: paired desktop can report hostname/platform and open a URL command.

4. Portal device dashboard.
   - Acceptance: shows paired devices, status, capabilities, and last check-in.

## Phase 7: 3dvr Agent Evolution

Goal: move from outreach script to personal action system.

Current loop:

```text
crawl -> enrich -> message -> track
```

Future loop:

```text
observe -> suggest -> automate -> coordinate -> deploy
```

Commands to grow toward:

```text
3dvr nearby
3dvr leads
3dvr post
3dvr deploy
3dvr sync
3dvr ai
3dvr meeting
3dvr focus
```

Agent task cards:

1. Preserve outreach reliability.
   - Repo target: `3dvr-agent`.
   - Acceptance: email, form, failure tracking, and inbox triage tests pass.

2. Add `3dvr meeting`.
   - Connect to portal meeting ops links.
   - Acceptance: command can print host, guest, fallback, and smart join links for a room.

3. Add `3dvr device`.
   - Connect to device pairing API when available.
   - Acceptance: command can pair, list, and ping devices.

4. Add action queue.
   - Agent suggestions become reviewable actions before execution.
   - Acceptance: queue can hold `send`, `post`, `deploy`, `notify`, and `open-url` actions.

## This Week

1. Make production deploy current.
   - Ensure `portal.3dvr.tech` is actually serving `main`.
   - Verify `/portal.3dvr.tech/video/join.html`, `/meshcast.html`, `/ops.html`, and `/smart-launcher.html`.

2. Create API skeleton.
   - `GET /health` first.
   - Add route stubs only after health is deployed.

3. Document DO server inventory.
   - Do not change firewall or proxy blindly.
   - Capture current state first.

4. Add in-app notification center shell.
   - No push requirement yet.
   - Store notifications locally or in Gun until API is ready.

5. Add `3dvr meeting` command.
   - It should print the same URLs the portal meeting system generates.

## Agent Rules

- Pick one task card.
- State repo and files before editing.
- Do not modify billing, auth, or deployment config unless the card requires it.
- Add or update tests for each user-visible behavior.
- Run the smallest relevant test set.
- If live production is involved, verify the live URL after pushing.
- Leave a short note in the final response: files changed, tests run, what remains.
