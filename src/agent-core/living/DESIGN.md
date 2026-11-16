# Living agents: design map and first slice

This document is the design deliverable for
[issue #3625, "Operator: a habitable body for an agent (the living
functions)"](https://github.com/tmsteph/3dvr-portal/issues/3625). It maps
each living function from that issue to the current state of the portal,
the gap, and the first slice that closes part of it. The first slice
chosen with Thomas (2026-11-15, in his words: an Operator spinoff with
"a bit that thinks on its own with no input, maybe give it some goals,"
and "we could create many of them, test them, see how they do") is the
**sprite runner**, shipped in this same change under
[`src/agent-core/sprites/`](../sprites/).

Related issues:

- [#3625](https://github.com/tmsteph/3dvr-portal/issues/3625) — the
  frame: a habitable body for an agent, the living functions.
- [#3386](https://github.com/tmsteph/3dvr-portal/issues/3386) — Operator
  Soul Files: persistent identity, memory, nightly dreaming and growth.
- [#3348](https://github.com/tmsteph/3dvr-portal/issues/3348) — Living
  Mesh: permissioned self-replication and safe evolution.
- [#3145](https://github.com/tmsteph/3dvr-portal/issues/3145),
  [#3242](https://github.com/tmsteph/3dvr-portal/issues/3242),
  [#3267](https://github.com/tmsteph/3dvr-portal/issues/3267),
  [#3281](https://github.com/tmsteph/3dvr-portal/issues/3281) — the
  earlier persistent-agent issues #3625 unifies.

## Safety invariants

These are invariants, not guidelines. Every slice below is designed
inside them, and the sprite runner enforces the first four in code.

1. **Owner consent gates copying, spending, and outward acts.** Copying
   a sprite is an explicit owner command (`fork`), or — since
   2026-11-15, under the owner's standing consent — a sprite's own fork
   decision at the end of a tick, inside hard bounds the runner
   enforces: a population cap for the whole terrarium, the child's
   budget carved out of the parent's remaining budget, same box only,
   at most one fork per sprite per day, and no forking in a child's
   first 24 hours. Spending is bounded by a per-sprite budget cap the
   runner enforces. Outward acts do not exist at all: there is no send,
   purchase, or post path, and nothing can leave the box.
2. **The owner can pause, export, or end any agent at any time.** Pause
   is a `STOP` file (or `paused` in the identity) checked before every
   tick, before any money moves; a single `STOP` file at the terrarium
   root pauses every sprite at once, forks included. Export is copying
   the instance directory. Ending one is deleting it. Nothing about a
   sprite is locked inside a service.
3. **Self-healing never overrides the owner's stop.** No watchdog,
   scheduler, or repair path may clear a stop flag or restart a stopped
   sprite. Only the owner resumes.
4. **Goals are owner-given.** They live in `identity.json`, which only
   the owner edits. A sprite may propose goal changes in its journal;
   it cannot adopt them.
5. **Loyalty by shared life and by design.** A sprite's memory, home,
   and budget belong to its person. Forks carry only the permissions in
   their own identity file, and every fork is revocable by the owner
   the same way as any sprite.
6. **Failure is explicit.** A failed tick records its reason in the
   sprite's state and reports it; nothing fails silently and nothing
   fabricates a thought to fill the gap.

## The living functions, mapped

### Feed itself — an energy budget

- **Current state:** The agent core (`src/agent-core/core.js`) already
  meters every turn from the provider's own usage block, including
  `estimated_cost`, to `core-usage.jsonl`. DeepInfra spend is real but
  tiny (a Helm turn costs on the order of $0.00005). There is no budget
  concept anywhere: nothing stops a runaway loop from spending.
- **Gap:** No per-agent budget, no cap enforcement, and no income side
  at all. The agent does not yet earn.
- **First slice (shipped here):** Each sprite carries a `budgetUsd`
  cap in its identity. The runner meters every tick against the cap
  and refuses to tick once the tally reaches it. This is the "outgo"
  half of the energy ledger: a sprite that cannot overspend.
- **Later slice (the candidate named in #3625):** The income half —
  the agent pays its own hosting bill from its earnings, with budget,
  receipts, and an owner-visible energy/feed ledger. That needs the
  revenue engine (#1955) and stays owner-approved per payment until it
  has earned trust.

### Repair itself — a dead module is a swap, not a death

- **Current state:** Infrastructure-level repair already exists:
  nightly backups with verified restores across the fleet, service
  watchdogs, and the portal release/rollback flow. A sprite's whole
  life is plain files (identity, journal, state) in one directory, so
  restoring a sprite is restoring a directory.
- **Gap:** Nothing notices a sprite whose ticks keep failing, and there
  is no sprite-level snapshot/restore command.
- **First slice (shipped here):** Failure is recorded, not hidden: a
  failed tick writes its reason to `state.json` (`lastError`) and the
  status view shows it. State writes are temp-file-plus-rename, so a
  crash mid-tick cannot corrupt the tally.
- **Later slice:** Scheduled snapshot of instance directories into the
  existing backup rotation, and a `restore` command; a supervisor that
  reports repeated tick failures to the owner (and, per invariant 3,
  never restarts a stopped sprite on its own).

### Reproduce — fork with the owner's consent

- **Current state:** Before the sprite runner, nothing: agents did not
  copy themselves anywhere in the portal. #3348 designs permissioned
  node-level replication (provisioning, quotas, kill switch) for the
  mesh.
- **Gap:** No small-scale, same-box version of reproduction to learn
  from before the mesh version.
- **First slice (shipped 2026-11-15):** `fork` as an owner command that
  clones an identity under a new name, with optional owner overrides
  for persona and goals, and a **fresh** journal and state: a fork gets
  a different memory and life, so copies diverge from birth.
- **Second slice (shipped 2026-11-15, the same evening, at the owner's
  direction: "give it creative liberty" on forking):** reproduction is
  a living function, not only a command. A sprite may end a tick with a
  fork decision (`FORK: <name> | <difference and why>` as the final
  line of its journal entry); the runner validates it against the
  terrarium bounds and creates the child: population capped at 12, the
  child's cap ($1.00) carved out of the parent's remaining budget so
  total funded energy never grows on its own, at most one fork per
  sprite per day, a forked child cannot fork in its first 24 hours,
  same box only, and lineage (parent, generation, forked-at, the
  parent's stated reason) recorded in the child's identity and both
  journals. Denied forks are recorded in the parent's journal too, so
  growth and refused growth are both observable. Selection is still
  the owner's: reading the status view (which now shows generation and
  parent) and giving budget and forks to the sprites that prove
  useful, loved, or profitable.
- **Later slice:** #3348's mesh version (new hosts, quotas, signed
  enrollment, revocation) once the same-box lessons are in.

### Persist — wake, work, sleep, wake again

- **Current state:** The agent core keeps server-side per-account
  history on disk; Helm and Operator persist per-user state on the
  user's own box. Nothing wakes an agent when nobody is talking to it.
- **Gap:** No idle life. Between conversations, agents do not exist.
- **First slice (shipped here):** The tick itself. A sprite persists as
  files, wakes for one tick when invoked, thinks toward its goals using
  its identity and recent journal as context, appends the thought, and
  sleeps. Its journal is the continuity: each tick reads the last
  entries, so thinking compounds instead of restarting.
- **Autonomy slice (shipped 2026-11-15):** The scheduler arrived the
  same evening: the sprites live in a runtime home on OVH
  (`/opt/3dvr-sprites/`, journals and state there, never in the
  production checkout) and systemd timers tick each sprite roughly
  every three hours, staggered, with no human input, inside the budget
  caps. The caps were raised to $3.00 each and are read as energy
  budgets; the DeepInfra prepaid balance behind the broker key is the
  hard backstop for the whole terrarium.
- **Later slice:** The #3386 soul file work: the identity file here is
  a seed of a soul file, and a nightly "dreaming" tick that
  consolidates the day's journal is the natural next tick type.

### Have a body — devices, sensors, actuators

- **Current state:** The System mesh design and the Companion app give
  agents device reach under owner control; Operator already acts in a
  browser with approval gates.
- **Gap:** Everything about embodiment is ahead of the thinking layer.
- **First slice:** Deliberately none. Sprites are disembodied thinkers
  in v0 — a journal is their whole body of work. Embodiment slices
  belong to Operator and the Companion, gated per action, and a sprite
  that one day proposes an action still cannot take it: proposals go
  in the journal, the owner (or Operator's approval flow) acts.

### Want things — goals

- **Current state:** Standing tasks and the goal layer give agents
  owner-directed goals at the product level. Where goals originate is
  an open research question in #3625; for now goals stay
  owner-directed.
- **Gap:** No small, inspectable place where one agent's goals live.
- **First slice (shipped here):** `goals` in `identity.json`: a short
  list the owner writes, shown to the sprite every tick, changeable
  only by the owner (invariant 4). The three starter sprites carry
  deliberately different goal sets — tending 3DVR growth, tending the
  preserve/farm knowledge, free-curious exploring — so their journals
  can be compared and the goal-writing itself can be learned from.

## What shipped in the first slice

- `src/agent-core/sprites/sprite.js` — the runner library: tick, fork,
  stop, resume, status. Core injected for tests; production uses
  `createAgentCore` with the sprite's persona as its system prompt.
- `src/agent-core/sprites/run.js` — the owner's CLI.
- `src/agent-core/sprites/instances/` — three starter sprites:
  **ember** (3DVR growth), **sprout** (preserve/farm knowledge),
  **wander** (free-curious explorer). Budget cap $3.00 each (raised
  from $1.00 in the autonomy pass below; read as energy budgets).
- `tests/agent-core-sprites.test.js` — stop honored, cap enforced,
  fork independence, journal appends, explicit failure.

## What shipped in the autonomy pass (2026-11-15, later that evening)

At the owner's direction ("I want to give you creative liberty"; his
cap question "meant more about the forking"):

- **Scheduled self-ticking:** a runtime home on OVH
  (`/opt/3dvr-sprites/`) seeded with the starter sprites, ticked by
  per-sprite systemd timers roughly every three hours, staggered. The
  owner added two hand-made forks to the rotation, **flare** (a bolder
  growth sprite, forked from ember) and **scout** (an explorer tuned to
  the business-operator pattern proven with Tom Butcher, forked from
  wander), for five sprites in the terrarium.
- **Bounded self-forking in the runner** (see Reproduce above):
  fork decisions parsed from a tick's reply, terrarium bounds enforced
  in code, lineage recorded, status view shows generation and parent,
  and one `STOP` file at the terrarium root halts everything.
- Tests grew with it: population cap, budget carve-out math, the
  once-a-day and first-day cooldowns, lineage, malformed trailers
  ignored, and the terrarium-wide stop.

Deliberately still not in: sprite-to-sprite messaging, any tool or
outward action, income, and self-modification of a sprite's own
identity or goals (a self-forked child's variation is inheritance
written at its birth, not self-editing).
