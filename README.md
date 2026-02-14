# 3DVR Portal

**The Open Community Portal for Dreamers, Builders, and Innovators**  
*Part startup incubator, part coworking space, part collective playground — all open source.*

---

## What is 3DVR Portal?

The **3DVR Portal** is the entry point and central hub for the 3DVR community: a decentralized, open-source platform where people come together to:

- **Collaborate on open-source projects** in web, VR, gaming, hardware, and education.
- **Propose and launch new ideas and startups** in a supportive community.
- **Learn and grow skills** with access to mentors, tutorials, and collaborative coding.
- **Earn rewards and funding** for contributing meaningfully to projects.
- **Build the future** of open and ergonomic computing, decentralized communication, and community-driven hardware and software.

We are making tools and products **by the community, for the community** — and ensuring that anyone who participates can also benefit financially, socially, and professionally.

If you believe in empowering people to create together and own what they build — **welcome home.**

---

## Current Features

- **Decentralized Account System (GUN.js SEA):** Create accounts with zero back-end servers. Your data is your own.
- **Realtime Group Chat:** Connect with the community and collaborate live.
- **Task & Notes Apps:** Plan, discuss, and organize project work together.
- **Mini Games & Demos:** Explore multiplayer-first coding through fun experiments.
- **Calendar Hub (beta):** Connect Google and Outlook calendars using OAuth tokens and sync events in one place.
- **Membership Support (coming soon):** Fund the platform and unlock rewards with our $20/month supporter plan.

Everything is **100% open-source using HTML, CSS, and JS** — forkable, hackable, remixable.

---

## Roadmap

3DVR Portal is evolving fast. Here’s what’s coming next:

- **Project Boards + Kanban:** Track and manage projects with shared task boards.
- **Community Dashboard:** See what’s happening across the ecosystem.
- **3D/VR Collaborative Spaces:** Join virtual meetups and galleries using Three.js.
- **Decentralized Contributor Rewards:** Get paid fairly for your work in open-source.
- **Open Hardware Prototyping:** Design and discuss open-source laptops, SBCs, and more.

We are laying the groundwork for **the most open, fun, and people-driven dev platform on Earth.**

---

## Getting Started

### Use the Portal

The portal is live and hosted at:

[**→ Visit the 3DVR Portal**](https://3dvr-portal.vercel.app)

You can sign up, join the chat, and start contributing right now — no downloads or installs required.

### Install individual apps

Most of the portal experiences now ship with their own installable manifests, so you can add just the tools you need as standalones on your device:

- [Tasks](https://3dvr-portal.vercel.app/tasks.html)
- [Notes](https://3dvr-portal.vercel.app/notes/)
- [Chat](https://3dvr-portal.vercel.app/chat/)
- [Calendar Hub](https://3dvr-portal.vercel.app/calendar/)
- [Contacts](https://3dvr-portal.vercel.app/contacts/)

Open the page you want and use your browser’s **Install** or **Add to Home Screen** option to pin it like a native app.

### Brave browser setup

Brave shields can block realtime sync. Click the 🛡️ icon and either turn Shields off for `portal.3dvr.tech` and `relay.3dvr.tech`, or set **Cross-site cookies** to *Allow* and **Fingerprinting** to *Standard*. Use a regular window (not Tor or private mode) for the most reliable GunJS connection.

## Portal data standard

- Prefer `window.ScoreSystem.ensureGun` to initialize Gun so every app shares the same peer list, SEA configuration, and offline stub behavior.
- Store collaborative data under `3dvr-portal/<app>` nodes first, with legacy nodes read and written second so older clients continue to sync.
- Keep the portal node as the source of truth, and avoid device-local only storage for anything that should follow a user between browsers.
- Ensure guest or SEA identities are initialized (via `ScoreSystem.ensureGuestIdentity`) before writing so contributions are properly attributed across apps.

### Run Locally

```bash
git clone https://github.com/tmsteph/3dvr-portal.git
cd 3dvr-portal
open index.html
```

### Run the local dev server

The portal is mostly static HTML/CSS/JS, so the default dev server is a simple static
server. This keeps local setup lightweight and avoids a global Vercel dependency.

```bash
npm install
npm run dev
```

### Run the money automation loop

Use the new loop runner to research demand, rank opportunities, and draft ad copy from one command:

```bash
npm run money:loop -- \
  --market "freelancers managing outreach and follow-up" \
  --keywords "lead follow-up,proposal workflow,client onboarding" \
  --channels "reddit,x,linkedin,email" \
  --budget 150
```

Optional output file:

```bash
npm run money:loop -- --market "local service businesses" --out artifacts/money-loop/latest.json
```

Automation data sync is available in the UI at `/money-ai/`, which writes each run to:

- `gun.get('3dvr-portal').get('money-ai').get('runs')`
- `gun.get('3dvr-portal').get('money-ai').get('opportunities')`
- `gun.get('3dvr-portal').get('money-ai').get('ads')`

Legacy mirror writes also continue to `gun.get('money-ai')` for older clients.

#### Money loop manual walkthrough

Use this checklist after UX or sync changes:

1. Open `/money-ai/` in one browser tab, run the loop once, and verify opportunities/ads render in the results panel.
2. Hard refresh and clear site data for the local host, then rerun and confirm the app still initializes and submits.
3. Open a second browser (or profile) and check the same run in Gun Explorer at `3dvr-portal/money-ai/runs/<runId>`.
4. Toggle network off/on to confirm the UI reports offline sync state, then reconnect and run again.
5. Validate one mobile browser and one desktop browser to confirm controls, focus states, and status text are readable.

### Run the money autopilot cycle

Autopilot can discover markets on its own, run demand research, build an offer page, publish, and dispatch promotion tasks.

```bash
npm run money:autopilot -- --out artifacts/money-autopilot/latest.json
```

Optional dry-run (skip publish even when enabled):

```bash
npm run money:autopilot -- --dryRun true --out artifacts/money-autopilot/latest.json
```

Environment controls:

- `MONEY_AUTOPILOT_MARKET`
- `MONEY_AUTOPILOT_KEYWORDS` (comma separated)
- `MONEY_AUTOPILOT_CHANNELS` (comma separated)
- `MONEY_AUTOPILOT_WEEKLY_BUDGET`
- `MONEY_AUTOPILOT_MAX_BUDGET`
- `MONEY_AUTOPILOT_SIGNAL_LIMIT`
- `MONEY_AUTOPILOT_AUTO_DISCOVERY` (`true`/`false`)
- `MONEY_AUTOPILOT_DISCOVERY_SEEDS` (comma separated)
- `MONEY_AUTOPILOT_PUBLISH` (`true`/`false`)
- `MONEY_AUTOPILOT_DRY_RUN` (`true`/`false`)
- `MONEY_AUTOPILOT_GH_TOKEN` (or `GH_PAT`)
- `MONEY_AUTOPILOT_GH_REPO` (for example `tmsteph/3dvr-portal`)
- `MONEY_AUTOPILOT_GH_BRANCH`
- `MONEY_AUTOPILOT_PUBLISH_PATH_PREFIX`
- `MONEY_AUTOPILOT_COMMIT_PREFIX`
- `MONEY_AUTOPILOT_VERCEL_DEPLOY` (`true`/`false`)
- `MONEY_AUTOPILOT_VERCEL_TOKEN`
- `MONEY_AUTOPILOT_VERCEL_PROJECT_NAME`
- `MONEY_AUTOPILOT_VERCEL_TARGET` (`production` or `preview`)
- `MONEY_AUTOPILOT_PROMOTION` (`true`/`false`)
- `MONEY_AUTOPILOT_PROMO_WEBHOOK_URL` (n8n/Zapier/custom worker endpoint)
- `MONEY_AUTOPILOT_DEFAULT_DESTINATION_URL`
- `MONEY_AUTOPILOT_GA_PROPERTY_ID`
- `MONEY_AUTOPILOT_GA_ACCESS_TOKEN`

Security for UI-triggered autopilot:

- `MONEY_AUTOPILOT_TOKEN` is required by `GET /api/money/loop?mode=autopilot`.
- Provide it in the `X-Autopilot-Token` header (the Money AI page has a token field).
- `MONEY_AUTOPILOT_USER_TOKEN_SECRET` signs per-user bearer tokens.
- `MONEY_AUTOPILOT_REQUIRE_USER_TOKEN=true` enforces bearer tokens for regular loop runs.
- `MONEY_AUTOPILOT_ALLOW_FREE_PLAN=true` allows token issuance without an active Stripe subscription.
- `MONEY_AUTOPILOT_ALLOWED_SUB_STATUSES` overrides accepted Stripe statuses (default: `active,trialing`).
- `MONEY_AUTOPILOT_PRICE_PLAN_MAP` maps Stripe price IDs to plans, example:
  `{"price_starter":"starter","price_pro":"pro"}`.
- `MONEY_AUTOPILOT_RATE_LIMITS` sets per-plan quotas, example:
  `{"free":{"minute":1,"day":1},"starter":{"minute":2,"day":10},"pro":{"minute":6,"day":80}}`.

Issue a user token from the page:

1. Enter subscriber email in **Subscriber email (for user token)**.
2. Click **Get User Token**.
3. The token is verified against Stripe entitlement and then used as `Authorization: Bearer <token>`.
4. Run buttons now include plan-based rate-limit status in the results pane.

Scheduled background execution is provided via `.github/workflows/money-autopilot.yml` (every 6 hours plus manual dispatch).

Important: promotion dispatch only sends campaign tasks to your webhook. Paid ad spend happens only if your webhook
worker actually creates campaigns in Google Ads/social APIs.

### Run the Playwright smoke check

Use one command to verify browser automation end-to-end:

```bash
npm run playwright:smoke
```

What this does:

1. Installs the Playwright Firefox browser runtime if needed.
2. Starts a local static server for the portal.
3. Opens the portal in headless Playwright and validates the landing page title and heading.

On Android/Termux, the command automatically runs inside a local Debian `proot-distro` if available.

### When do you need Vercel locally?

Only if you need to emulate Vercel serverless functions under `/api` during development.
For most UI work, the static dev server above is enough.

### Calendar Hub developer preview

The new calendar prototype lives at `calendar/index.html`. To experiment with Google or Outlook:

1. Generate OAuth tokens using your own developer accounts (Google Cloud or Azure).
2. Open the Calendar Hub page locally and paste the access tokens into the connection cards.
3. Use the **Fetch events** button to call the lightweight proxy in `/api/calendar` and list your upcoming events.
4. Use the **Create quick events** form to push meetings back to the connected provider.

Tokens are stored in `localStorage` only, making it easy to iterate while you wire up a production-ready OAuth flow.

### Automated dev deployments (GitHub + Vercel)

Use the included GitHub Actions workflow to build and deploy a stable dev site on Vercel whenever you push to `main` or `dev`.
This keeps preview testing on a predictable URL instead of a new random link every run, which helps debug features that are
origin or cookie sensitive.

#### Retrieving the required API tokens

Open the in-app **Deployment Guides** at [`/deployment-guides/`](https://3dvr-portal.vercel.app/deployment-guides/) for
step-by-step pages covering the GitHub token, Vercel token and IDs, optional stable alias, and wiring the workflow
secrets. Quick checklist:

1. Add repository secrets for `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. Optional: include `VERCEL_DEV_ALIAS`
   (stable preview) and `GH_PAT` (extra GitHub API scope).
2. Enable the "Vercel Dev Preview" workflow in GitHub Actions. It runs on pushes to `main`/`dev`, pull requests into those
   branches, and manual dispatch.
3. Pull request runs always publish a preview URL; manual runs can also alias to your stable dev domain when
   `set_alias=true`. Pushes to `main`/`dev` alias automatically when `VERCEL_DEV_ALIAS` is set.
4. Each run pulls preview env settings, builds the site, deploys, and—when aliasing is enabled—points the stable dev URL at
   the new preview.
