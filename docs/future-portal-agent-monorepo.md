# Portal + Agent Monorepo Design

Status: implemented July 16, 2026.

## Decision

`3dvr-agent` is consolidated into `3dvr-portal` with an incremental monorepo layout. The existing portal remains at the repository root and the agent lives under `apps/agent` with its prior Git history preserved.

```text
3dvr-portal/
├── app/                     # existing portal code
├── public/                  # existing portal assets
├── package.json             # existing portal package and scripts
├── ...                      # other existing portal files
├── apps/
│   └── agent/               # imported 3dvr-agent repository
│       ├── package.json
│       ├── thomas-agent/
│       ├── test/
│       ├── install.sh
│       └── README.md
└── .github/workflows/
    ├── portal.yml
    └── agent.yml
```

The asymmetric shape is intentional. A monorepo does not require moving every application at once, and keeping the portal at the root avoids changing its current Vercel project root, imports, scripts, and deployment assumptions.

## Runtime boundaries

- The portal remains a Vercel deployment built from the repository root.
- The agent remains a separate Hetzner runtime whose commands run from `apps/agent`.
- The agent keeps its own package manifest, tests, install script, environment, and process commands.
- Portal and agent secrets remain separate and never move into shared source-controlled configuration.
- CI uses path filters: portal changes run portal checks, agent changes run agent checks, and cross-cutting changes run both.

## Migration record

1. The migration started from a fresh `origin/main` checkout; existing dirty worktrees were left untouched.
2. The agent was imported with Git history preserved under `apps/agent`.
3. Agent-only CI paths and root convenience commands were added without changing the portal's Vercel project root.
4. Vercel excludes `apps/agent` from the public deployment; the worker remains a separate runtime.
5. The combined portal and agent suites must pass before the production worker checkout changes.
6. The standalone `3dvr-agent` repository remains read-only during the transition and is not deleted.

## Deferred work

Do not create shared packages during the initial migration. Extract a package only after real duplication establishes a stable boundary—for example preview schemas, attribution rules, or outreach branding used by both runtimes.

A possible later shape is:

```text
apps/
├── portal/
└── agent/
packages/
└── outreach-contracts/
```

Moving the portal into `apps/portal` is explicitly deferred because it would change Vercel roots, imports, scripts, CI paths, and other established assumptions. The agent can also be separated later by extracting the history of `apps/agent`.

## Future review

Revisit the layout only when a concrete shared boundary justifies a package extraction or when moving the portal under `apps/portal` produces more benefit than deployment risk.
