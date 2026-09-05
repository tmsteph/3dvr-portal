# 3DVR Portal

**The Open Community Portal for Dreamers, Builders, and Innovators**

3DVR Portal is the open-source front door to the 3DVR ecosystem: community, practical business tools, and experiments in open computing.

## Live portal

**https://portal.3dvr.tech**

## Canonical monorepo

`tmsteph/3dvr-portal` is the default home for active 3DVR product, platform, and research development.

New capability should normally extend this repository rather than create another 3DVR repository. Independent deployment, packaging, or release does **not** by itself require a separate repository. Shared code and cross-product contracts should stay together so the Agent, Portal, devices, tests, and experiments can evolve as one system.

Separate repositories remain useful when work must closely track an upstream project, has a genuinely independent contributor/release lifecycle, or is intentionally preserved as a reference or historical archive. Older 3DVR repositories should increasingly point back here when their active ideas have been absorbed.

## Repository layout

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

Run `npm test` for the portal, `npm run test:agent` for the agent, `npm run test:computing` for Computing, or `npm run test:all` for the integrated monorepo verification.

## Current consolidation plan

The ecosystem-wide simplification and shipping plan is tracked in [`docs/ecosystem-consolidation.md`](docs/ecosystem-consolidation.md). Its operating rule is simple: keep the public story clear, route users through a few strong intents, and move experiments behind stable core products.

### Ecosystem map

- **Core** — maintained public paths: `3dvr.tech`, Portal, 3DVR OS, 3DVR Calendar, and `tmsteph.com`.
- **Labs** — experiments and research such as TommyOS / Daedalos, AI Systems Lab, browser-computing prototypes, characters, hardware concepts, and interactive experiments.
- **Legacy** — superseded projects kept for history. Their README files should point visitors to the current Core replacement.

Default rule: extend a Core path when possible; use Labs when the work is intentionally experimental; do not revive Legacy as a competing product line.

## What is here now?

- Portal Home and installable web apps
- CRM, Contacts, Calendar, Tasks, Notes, and community tools
- Agent operations and the RUNE v0.1 mission language
- Digital Organism memory/retrieval work integrated with the Agent runtime
- Android Companion for opt-in phone control
- 3DVR Computing capability contracts for browser, desktop, and mobile control
- Money Printer experiments for turning demand into offers and delivery
- Open-source computing, hardware, VR, and education experiments

## Data architecture

3DVR is moving away from treating any single browser-side database as the universal source of truth.

- **Postgres / server-backed APIs:** durable structured business and account data when a server authority is appropriate.
- **Gun:** realtime/local-first collaboration and experiments where peer sync is useful.
- **Object storage:** files and larger immutable assets.
- **Device-local storage:** drafts, caches, UI state, and intentionally local experiences.

Existing Gun-backed apps remain supported; new features should choose storage based on the data's durability, authority, privacy, and sync requirements rather than defaulting everything to Gun.

## Getting started

Use the live Portal at **https://portal.3dvr.tech** or run it locally:

```bash
git clone https://github.com/tmsteph/3dvr-portal.git
cd 3dvr-portal
npm install
npm run dev
```

## Agent + RUNE

The Agent execution layer lives in [`apps/agent`](apps/agent/README.md). RUNE is the small human-readable mission format that compiles into the existing bounded mission runtime, preserving evidence, retries, dependency handling, and approval gates.

See [`apps/agent/docs/rune-missions.md`](apps/agent/docs/rune-missions.md).

## Android Companion

The opt-in Android control plane lives in [`apps/companion`](apps/companion/README.md). It provides an always-on local bridge for bounded device interaction while keeping destructive, financial, account-security, and other high-impact actions behind policy/approval boundaries.

## Money Printer

The canonical architecture is [`docs/money-printer-business-nervous-system.md`](docs/money-printer-business-nervous-system.md). The goal is a measurable loop:

**demand → offer → customer → delivery → reputation → learning**

The web cockpit lives at `/money-printer/`; runtime automation remains bounded by explicit connector permissions and approval gates.

## Contributing

3DVR is intentionally open source. Useful contributions include bug fixes, accessibility improvements, documentation, experiments, new open tools, and simplifying existing systems.

If you believe people should be able to understand, modify, and own the computing systems they depend on, welcome home.

## License

See [`LICENSE`](LICENSE).
