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
- [Chat](https://3dvr-portal.vercel.app/chat.html)
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

1. In your repository settings, add the following secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` (from the
   Vercel dashboard). Optional: set `VERCEL_DEV_ALIAS` to the `.vercel.app` or custom domain you want the workflow to point at
   (for example `dev-3dvr-portal.vercel.app`).
2. Enable the "Vercel Dev Preview" workflow in GitHub Actions. It now runs on push to `main`/`dev`, pull requests targeting
   those branches, and manual dispatch via **Run workflow**.
3. Pull request runs always publish a preview URL so you can test before merging. To also alias that preview to your stable
   dev URL from a manual run, set the `set_alias` input to `true` when triggering the workflow. Pushes to `main`/`dev` alias
   automatically when `VERCEL_DEV_ALIAS` is configured.
4. Each run pulls preview env settings, builds the site, deploys a preview, and—if aliasing is enabled—points the stable dev
   URL at the new preview so you can reuse the same link across sessions and team members.
