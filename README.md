# 3DVR Portal

**Open source personal computing with an AI Operator that does real work, with your approval.**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Live site](https://img.shields.io/badge/live-portal.3dvr.tech-brightgreen)](https://portal.3dvr.tech)

3DVR Portal is a personal computing platform you can actually own: an AI **Operator**, practical business tools, and community apps, all in one open source codebase (GPLv3). No black boxes. The agent proposes, you approve, and every action leaves a receipt.

## Try it now

- **Live portal:** https://portal.3dvr.tech
- **Meet Operator:** https://portal.3dvr.tech/operator/
- **Join the open build:** https://portal.3dvr.tech/operator/open/

No install needed to look around. Hosted personal agents are in pilot; builders can run the whole thing themselves.

## What you get

- **Operator, an AI agent with guardrails.** It plans work, uses tools, and remembers context. Anything risky waits for your explicit approval, and approvals are bound to the exact action you saw. Models are pluggable: hosted APIs first, local models (Ollama) as a fallback, through one router.
- **Business tools that earn their keep.** CRM, contacts, calendar, tasks, and notes, built for a small business that runs on them daily (ours).
- **Android Companion.** An opt-in bridge for bounded phone control, with high-impact actions kept behind policy and approval boundaries.
- **Community and play.** Open apps, experiments, and a game hub, because personal computing should be fun as well as useful.

## Run it locally

```bash
git clone https://github.com/tmsteph/3dvr-portal.git
cd 3dvr-portal
npm install
npm run dev
```

Run the checks with `npm test` (portal), `npm run test:agent` (agent), `npm run test:computing` (computing), or `npm run test:all` for everything.

## Where the build is

Operator is the active focus. The safety core (policy, approvals, receipts) is merged, along with the model router and the planner. In progress now: persistent memory, a tool bridge (files, mail, calendar, browser), an approval UI, and speed work. The execution layer lives in [`apps/agent`](apps/agent/README.md), the shared safety core in [`operator-core`](operator-core/README.md), and the Android control plane in [`apps/companion`](apps/companion/README.md).

Good first contributions: docs, accessibility fixes, tests, and small tools. If you believe people should be able to understand, modify, and own the computing systems they depend on, welcome home.

## Contributing

3DVR is intentionally open source. Useful contributions include bug fixes, accessibility improvements, documentation, experiments, new open tools, and simplifying existing systems. Open an issue first for anything large so we can point you at the right part of the tree.

## License

GPLv3. See [`LICENSE`](LICENSE).

---

## Project notes

### Canonical monorepo

`tmsteph/3dvr-portal` is the default home for active 3DVR product, platform, and research development.

New capability should normally extend this repository rather than create another 3DVR repository. Independent deployment, packaging, or release does **not** by itself require a separate repository. Shared code and cross-product contracts should stay together so the Agent, Portal, devices, tests, and experiments can evolve as one system.

Separate repositories remain useful when work must closely track an upstream project, has a genuinely independent contributor/release lifecycle, or is intentionally preserved as a reference or historical archive. Older 3DVR repositories should increasingly point back here when their active ideas have been absorbed.

### Repository layout

The customer-facing portal remains at the repository root. Separately deployed/runtime apps live under `apps/`.

```text
3dvr-portal/
├── apps/agent/       # 3dvr CLI, worker runtime, and Digital Organism integration
├── apps/companion/   # Android Companion control plane
├── apps/computing/   # shared browser/Desktop/Mobile capability contracts
├── api/              # portal serverless APIs
├── tests/            # portal tests
└── ...               # portal pages, labs, docs, scripts, and assets
```

### Consolidation and ecosystem map

The ecosystem-wide simplification and shipping plan is tracked in [`docs/ecosystem-consolidation.md`](docs/ecosystem-consolidation.md). Its operating rule is simple: keep the public story clear, route users through a few strong intents, and move experiments behind stable core products.

The ongoing repo-by-repo cleanup and canonical destination for older experiments is tracked in [`docs/repository-migration-map.md`](docs/repository-migration-map.md).

- **Core**: maintained public paths: `3dvr.tech`, Portal, 3DVR OS, 3DVR Calendar, and `tmsteph.com`.
- **Labs**: experiments and research such as TommyOS / Daedalos, AI Systems Lab, browser-computing prototypes, characters, hardware concepts, and interactive experiments.
- **Legacy**: superseded projects kept for history. Their README files should point visitors to the current Core replacement.

Default rule: extend a Core path when possible; use Labs when the work is intentionally experimental; do not revive Legacy as a competing product line.

### Data architecture

3DVR is moving away from treating any single browser-side database as the universal source of truth.

- **Postgres / server-backed APIs:** durable structured business and account data when a server authority is appropriate.
- **Gun:** realtime/local-first collaboration and experiments where peer sync is useful.
- **Object storage:** files and larger immutable assets.
- **Device-local storage:** drafts, caches, UI state, and intentionally local experiences.

Existing Gun-backed apps remain supported; new features should choose storage based on the data's durability, authority, privacy, and sync requirements rather than defaulting everything to Gun.

### Agent + RUNE

The Agent execution layer lives in [`apps/agent`](apps/agent/README.md). RUNE is the small human-readable mission format that compiles into the existing bounded mission runtime, preserving evidence, retries, dependency handling, and approval gates.

See [`apps/agent/docs/rune-missions.md`](apps/agent/docs/rune-missions.md).

### Money Printer

The canonical architecture is [`docs/money-printer-business-nervous-system.md`](docs/money-printer-business-nervous-system.md). The goal is a measurable loop:

**demand → offer → customer → delivery → reputation → learning**

The web cockpit lives at `/money-printer/`; runtime automation remains bounded by explicit connector permissions and approval gates.
