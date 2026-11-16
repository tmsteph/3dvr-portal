# Sprites: small agents that think on their own

A sprite is the first shipped slice of the living-agent direction in
[issue #3625](https://github.com/tmsteph/3dvr-portal/issues/3625): an
Operator spinoff with a bit that thinks on its own, with no input, toward
goals its owner gave it. The full design mapping lives in
[../living/DESIGN.md](../living/DESIGN.md).

Each sprite is a directory under `instances/`:

- `identity.json` — name, persona, owner-given goals, budget cap in USD.
  Only the owner edits this file.
- `journal.md` — the sprite's own thoughts, one entry per tick. This is
  the only place a sprite's thinking lives.
- `state.json` — tick count and spend tally, written by the runner.
- `STOP` — if this file exists, the sprite never ticks. Owner's stop.

A tick wakes a sprite once: the runner checks the stop flag and the
budget cap first, then gives the agent core (`../core.js`) the sprite's
identity, goals, and recent journal, and appends the reply to the
journal. Sprites have **no outward actions**: no sends, no purchases, no
posts. Their only effects on the world are their journal and the one
bounded act below.

**Reproduction.** A sprite may end a tick by deciding to fork: a final
line `FORK: <name> | <difference and why>` in its reply. The runner
enforces the terrarium bounds before creating anything: at most 12
sprites in the root, the child's $1.00 cap carved out of the parent's
remaining budget (the parent's cap drops by that amount), at most one
fork per sprite per day, and a forked child cannot fork in its first
24 hours. The child's identity records its lineage (parent, generation,
forked-at, the parent's reason); its journal starts fresh with a first
entry saying who it is, whose it is, and why it was made. The owner can
also fork any sprite by command (below) with an explicit budget. A
`STOP` file placed in the root itself halts every sprite at once.

## Commands

```sh
node run.js status                 # every sprite side by side
node run.js tick ember             # one autonomous tick
node run.js tick --all             # one tick each
node run.js fork sprout sprout-2   # owner-commanded copy (fresh journal)
node run.js stop wander            # owner stop
node run.js resume wander          # lift the stop
```

Point the runner at a different sprites root with `--root <dir>` or the
`THREEDVR_SPRITES_DIR` environment variable. Journals and state are
runtime artifacts (see `.gitignore`); only identities are source.

Three starter sprites ship with the repo so they can be compared side by
side: **sprout** tends the preserve and food-forest knowledge, **ember**
tends 3DVR growth ideas, and **wander** is the free-curious explorer.
Selection is the owner's: the useful, loved, and profitable ones get
more budget and more forks.

On OVH the sprites live in a runtime home at `/opt/3dvr-sprites/`
(point the CLI there with `--root /opt/3dvr-sprites`), where systemd
timers tick each sprite roughly every three hours, staggered, with no
human input. The repo copies of the identities are the seed; the
runtime journals and state are the life.
