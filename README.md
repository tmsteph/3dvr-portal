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

### Run Locally

```bash
git clone https://github.com/tmsteph/3dvr-portal.git
cd 3dvr-portal
open index.html
```

### Backfill legacy Gun data

The admin dashboard now relies on the Fly.io Gun relay. If you need to migrate
historical records from the legacy Manhattan relay, run the provided script:

```bash
npm install
npm run migrate:gun
```

The script connects to both relays, copies the `3dvr-portal` collections used by
the admin dashboard (user profiles, stats, admin roster, and admin requests),
and reports how many records were moved. After the migration completes, reload
the admin dashboard to confirm historical users appear via the Fly.io relay
only.
