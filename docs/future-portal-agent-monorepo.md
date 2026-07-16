# Future Portal + Agent Monorepo Design

Status: future design; no migration is currently scheduled.

## Decision

If `3dvr-agent` is consolidated into `3dvr-portal`, use an incremental monorepo layout. Keep the existing portal at the repository root and import the agent intact under `apps/agent`.

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

## Migration outline

1. Start from a fresh `origin/main` checkout and leave existing dirty worktrees untouched.
2. Import the agent with Git history preserved under `apps/agent`.
3. Add agent-only CI paths and root convenience commands without changing portal deployment behavior.
4. Verify the complete agent and portal test suites from the combined repository.
5. Prove the monorepo checkout on Hetzner before switching the active worker path.
6. Archive the standalone `3dvr-agent` repository as read-only for a transition period; do not delete it.

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

## Trigger to revisit

Revisit this design when atomic portal-and-agent changes are common enough that coordinating two repositories creates material release friction. Until then, keep both repositories operationally independent.
