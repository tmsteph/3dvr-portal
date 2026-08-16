# 3DVR Portal

**The Open Community Portal for Dreamers, Builders, and Innovators**

3DVR Portal is the open-source front door to the 3DVR ecosystem: community, practical business tools, and experiments in open computing.

## Live portal

**https://portal.3dvr.tech**

## Repository layout

The customer-facing portal remains at the repository root. Separately deployed/runtime apps live under `apps/`.

```text
3dvr-portal/
├── apps/agent/       # 3dvr CLI and worker runtime
├── apps/companion/   # Android Companion control plane
├── api/              # portal serverless APIs
├── tests/            # portal tests
└── ...               # portal pages and assets
```

Run `npm test` for the portal, `npm run test:agent` for the agent, or `npm run test:all` for both.

## What is here now?

- Portal Home and installable web apps
- CRM, Contacts, Calendar, Tasks, Notes, and community tools
- Agent operations and the RUNE v0.1 mission language
- Android Companion for opt-in phone control
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
