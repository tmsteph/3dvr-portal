# RUNE missions v0.1

RUNE is a small, human-readable mission language for the existing 3DVR agent runtime.

It does **not** replace the mission runner. A `.rune` file is parsed into the same versioned mission object used by JSON missions, so dependency handling, retries, evidence, state, and approval gates keep the same behavior.

## First principle

Write the intent and the proof before giving an agent permission to act.

```text
human intent
  -> RUNE mission
  -> existing mission schema
  -> planner / worker
  -> evidence
  -> evaluator
  -> approval gate
```

## Minimal mission

```rune
mission inspect-portal {
  repository: "tmsteph/3dvr-portal"
  objective: "Inspect the portal without changing it."

  task inspect {
    objective: "Read the current repository state."
    command: ["git", "status", "-sb"]
    evidence: "git status"
  }
}
```

The safe defaults are:

- `branch: "main"`
- `backend: deterministic`
- `risk: read_only`
- `model: review`
- `worktree: false`
- `retries: 1`
- a conservative approval policy for consequential external writes, money, credentials, destructive actions, and production deployment

## Task fields

```rune
task repair-homepage {
  objective: "Repair the homepage without broadening scope."
  backend: codex
  risk: workspace_write
  model: coding
  worktree: true
  depends: [inspect]
  files: ["index.html", "tests/homepage.test.js"]
  command: ["node", "--test", "tests/homepage.test.js"]
  accept: "focused homepage tests pass"
  evidence: "changed files"
  evidence: "test results"
  retries: 2
}
```

Repeated `command`, `accept`, and `evidence` fields append to their corresponding lists.

Commands are argument arrays, not shell strings. This preserves the mission runner's bounded execution model and avoids adding a second shell parser to RUNE.

## Approval gates

```rune
task merge {
  objective: "Stop for explicit human merge approval."
  backend: deterministic
  risk: external_write
  depends: [repair-homepage]
  gate: [merge_pull_request, "tmsteph/3dvr-portal#1234"]
  evidence: "approval record"
}
```

A gate compiles to the existing scoped approval record. RUNE does not bypass or weaken approval handling.

## Use it

Mission lookup prefers the existing `.json` definition when one exists. If JSON is absent, the runner loads the matching `.rune` file and compiles it in memory.

```sh
3dvr mission validate rune-demo-v01
3dvr mission run rune-demo-v01
3dvr mission run rune-demo-v01 --execute
3dvr mission status rune-demo-v01
```

`run` remains inspect-only by default. `--execute` is still required before declared commands run.

See `apps/agent/missions/rune-demo-v01.rune` for the first tracked example.

## Deliberate limits in v0.1

RUNE v0.1 is intentionally small:

- one mission per file
- one statement per line
- no variables
- no loops
- no conditionals
- no inline shell
- no hidden model calls
- no implicit external writes

Those limits keep the language readable and make the compiled mission easy to inspect. Add syntax only when a real mission cannot be expressed cleanly with the existing schema.
