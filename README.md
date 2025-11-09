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

### Brave browser setup

Brave shields can block realtime sync. Click the 🛡️ icon and either turn Shields off for `portal.3dvr.tech` and `relay.3dvr.tech`, or set **Cross-site cookies** to *Allow* and **Fingerprinting** to *Standard*. Use a regular window (not Tor or private mode) for the most reliable GunJS connection.

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
