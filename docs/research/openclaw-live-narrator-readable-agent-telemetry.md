# OpenClaw Live Narrator

**Readable agent telemetry and a continuous-improvement loop for persistent personal agents**

**Thomas M. Stephens · 3DVR Research · July 2026**

## Abstract

Persistent computer-using agents often expose activity through raw terminal output, tool-call records, session logs, and model transcripts. These sources are useful to developers but difficult for a user to follow while an agent is working. The result is an observability gap: the system may be active, blocked, retrying, or changing direction while the user sees only silence or an unreadable stream.

This note proposes **OpenClaw Live Narrator**, a sidecar observability and improvement layer that converts structured runtime events into a continuously updated, plain-English mission transcript. The narrator does not replace authoritative logs. It reads normalized events, groups low-level operations into meaningful task transitions, preserves links to evidence, and writes a compact `LIVE_STATUS.md` or equivalent live view every few seconds.

The same event history can support a bounded continuous-improvement loop. After a mission, the system can identify recurring failures, unclear status messages, excessive retries, missing instrumentation, and opportunities to replace model work with deterministic tools. Proposed improvements remain evidence-backed and subject to normal tests, permissions, and human approval.

The objective is not to make an agent appear busy. It is to let a person answer, at any moment: **What is the agent doing, why is it doing it, what changed, what is blocked, what evidence exists, and what requires my attention?**

## 1. The problem

OpenClaw can act as a persistent runtime for sessions, tools, terminal work, browser work, messaging, and personal-device operations. However, the runtime experience can feel opaque when its internal activity is represented primarily by:

- raw model output;
- terminal lines;
- tool invocation payloads;
- verbose debug logs;
- partial progress messages;
- delayed final responses;
- separate child-agent sessions.

A user should not need to read implementation-level logs to understand the mission.

Codex-like development interfaces demonstrate a useful interaction pattern: they narrate meaningful operations such as inspecting files, finding a failing test, changing a plan, applying a patch, and validating the result. The narration is neither the full private reasoning process nor a raw log dump. It is a human-readable operational account.

The missing layer can be described as:

> **Readable Agent Telemetry: a truthful, continuously updated explanation of agent activity grounded in runtime evidence.**

## 2. Research question

> Can a sidecar narrator improve user understanding and trust without materially slowing execution, overwhelming the user, leaking private reasoning, or replacing authoritative evidence with plausible summaries?

Supporting questions include:

1. Which runtime events are necessary to reconstruct meaningful progress?
2. How should repetitive low-level events be grouped into one human-readable update?
3. How frequently should the live status change?
4. How can the narrator distinguish observed facts from model interpretations?
5. How should child-agent and parallel-task activity be represented?
6. What information should remain hidden for privacy or security?
7. Can post-mission telemetry produce safe, measurable system improvements?

## 3. Design principles

### 3.1 Evidence first

Every narrated claim should refer to an event, artifact, test, task record, or direct environment observation.

```text
Bad:  "The deployment should be fixed now."
Good: "The deployment returned HTTP 200 after the configuration change."
```

### 3.2 Summarize operations, not private reasoning

The narrator should explain actions, observations, decisions, and plan changes. It does not need to expose hidden chain-of-thought or every intermediate hypothesis.

### 3.3 Preserve the raw source

The narrative is a view over authoritative telemetry. Raw events, commands, timestamps, artifacts, and test output remain available for inspection.

### 3.4 Report uncertainty honestly

The narrator should distinguish:

- confirmed observation;
- current interpretation;
- assumption;
- planned action;
- unresolved risk.

### 3.5 Prefer meaningful transitions

A user needs to know that the agent moved from research to implementation, not that it emitted 137 token chunks or polled a process 20 times.

### 3.6 Remain interruptible

The live view should expose pause, cancel, retry, approve, and inspect controls where the runtime supports them.

### 3.7 Avoid performative narration

The narrator must not invent progress to reassure the user. Silence with a clear state such as “waiting for deployment” is better than decorative activity.

## 4. Proposed architecture

```text
OpenClaw runtime
    ├── model/session events
    ├── tool-call events
    ├── terminal process events
    ├── browser events
    ├── task and child-agent events
    └── approval and permission events
              ↓
Event adapters
    ├── normalize event names
    ├── redact protected fields
    ├── attach mission/task IDs
    └── preserve evidence pointers
              ↓
Append-only telemetry stream
              ↓
State reducer
    ├── active tasks
    ├── waiting tasks
    ├── failures and retries
    ├── completed milestones
    ├── current plan version
    └── pending approvals
              ↓
Narration engine
    ├── deterministic templates first
    ├── optional small-model summarization
    ├── duplicate suppression
    └── significance scoring
              ↓
Human-readable surfaces
    ├── LIVE_STATUS.md
    ├── terminal status view
    ├── portal mission timeline
    ├── messaging update
    └── machine-readable status.json
```

The event stream should be the stable interface. OpenClaw-specific adapters can change as the underlying runtime evolves without forcing the status UI or research format to change.

## 5. Event model

A minimal normalized event could use this shape:

```json
{
  "eventId": "evt_01J...",
  "timestamp": "2026-07-09T17:10:40Z",
  "missionId": "mission_openclaw_telemetry",
  "taskId": "inspect-runtime-events",
  "parentTaskId": null,
  "source": "terminal",
  "type": "process.completed",
  "severity": "info",
  "summary": "Focused test suite completed successfully.",
  "evidence": {
    "command": "node --test tests/telemetry.test.js",
    "exitCode": 0,
    "artifact": null
  },
  "visibility": "user",
  "sensitiveFieldsRedacted": true
}
```

Useful event families include:

```text
mission.created
mission.plan.updated
mission.paused
mission.completed
mission.failed

task.created
task.started
task.progress
task.blocked
task.retrying
task.completed
task.failed

tool.requested
tool.started
tool.completed
tool.failed

process.started
process.output.sampled
process.completed
process.failed

artifact.created
artifact.updated
artifact.validated

test.started
test.passed
test.failed

approval.requested
approval.granted
approval.denied

worker.started
worker.waiting
worker.completed
worker.failed
```

## 6. State reduction

The live view should be derived from events rather than rewritten independently by every agent.

A deterministic reducer can calculate:

- current mission state;
- current plan version;
- active task count;
- tasks running in parallel;
- dependencies still waiting;
- latest meaningful observation;
- retry count;
- elapsed time;
- latest test result;
- pending approval;
- estimated or measured cost;
- last heartbeat from each worker.

This separation reduces hallucinated status. The narrator phrases known state; it does not decide whether a task actually finished.

## 7. `LIVE_STATUS.md`

The first implementation can write a small Markdown document to a mission workspace.

```markdown
# Live mission status

**Mission:** Improve OpenClaw runtime observability
**State:** Running
**Updated:** 2026-07-09 10:37 PDT

## Current focus

The implementation worker is adding normalized task events. The research worker has finished comparing existing observability patterns.

## Active work

- **Add event adapter** — running
  - Reading session and tool events
  - Next milestone: emit the first normalized event stream

- **Design readable status** — waiting on event adapter

## Recently completed

- Confirmed that raw logs contain enough information for an initial sidecar prototype.
- Defined the minimal event schema.

## Blockers

- Exact event hooks vary by the installed OpenClaw version.

## Evidence

- `artifacts/runtime-event-sample.jsonl`
- `tests/telemetry-adapter.test.js`: pending

## Needs your attention

Nothing currently requires approval.
```

The file can be rewritten atomically whenever a meaningful state transition occurs, with a bounded heartbeat update when a long process remains active.

## 8. Narration policy

### 8.1 Significance scoring

Not every event deserves a user-facing line. Events can be scored according to:

- task-state change;
- new evidence;
- failure or retry;
- plan revision;
- dependency release;
- approval requirement;
- security relevance;
- elapsed time since the last update;
- direct user interest.

Low-significance events remain in raw telemetry.

### 8.2 Aggregation

Repeated events should collapse into one statement.

```text
Raw events:
- poll deployment: BUILDING
- poll deployment: BUILDING
- poll deployment: BUILDING
- poll deployment: READY

Narration:
- Waited for the deployment to become ready; it is now available.
```

### 8.3 Templates before models

Many status updates can be generated deterministically:

```text
{task} started on {node} using {modelTier}.
{testName} failed with {failureSummary}.
{task} is waiting for {dependency}.
Approval is required before {action}.
```

A small model can improve phrasing or combine several events, but it should receive a constrained structured payload and should not invent facts outside it.

### 8.4 Update cadence

The narrator should update on meaningful transitions and provide a heartbeat for long-running work. An initial policy could be:

- immediately for failures, approvals, and plan changes;
- within several seconds for task transitions;
- every 30–60 seconds for a long-running task with no new milestone;
- no update for token streaming or repetitive debug output.

## 9. Parallel and hierarchical agents

Readable telemetry becomes more important when one supervisor coordinates several workers.

The mission view should show:

```text
Supervisor
├── Runtime research          completed
├── Event adapter             running
├── Portal timeline           waiting for adapter
├── Security review           queued
└── Integration tests         blocked by event adapter
```

Each worker should emit events into the same mission stream with its own task and parent identifiers. The narrator can then explain concurrency, dependencies, and independent failures without forcing the user to open every child session.

## 10. Security and privacy

Telemetry can accidentally expose secrets more easily than ordinary UI because it collects activity from many tools.

The adapter layer should redact:

- API keys and tokens;
- cookies and authorization headers;
- private message bodies unless explicitly included;
- sensitive file contents;
- personal identifiers not needed for status;
- full command output containing credentials;
- hidden model reasoning.

Each event should carry a visibility level such as:

```text
internal-debug
operator
user
public
```

Public status must never be derived automatically from an internal event without an explicit publication policy.

## 11. Failure and recovery visibility

The narrator should report failures without turning every recoverable error into an alarm.

Example:

```text
10:21  Browser worker could not load the page.
10:21  It is retrying once with a fresh session.
10:22  Retry succeeded; the research task continues.
```

When recovery fails:

```text
10:24  The browser task failed after two attempts.
10:24  The supervisor paused the dependent outreach draft and requested a new plan.
```

The important information is not only that an error occurred, but what the system did because of it.

## 12. Continuous-improvement loop

The same telemetry can help improve the runtime after a mission.

```text
mission events
    ↓
post-mission analyzer
    ├── repeated failures
    ├── excessive retries
    ├── unclear status transitions
    ├── missing evidence
    ├── slow tools
    ├── model overuse
    └── user interventions
    ↓
improvement proposal
    ↓
tests and human review
    ↓
bounded implementation
```

Possible improvements include:

- add a missing event hook;
- improve an unclear narration template;
- replace a repeated model operation with a script;
- change a retry policy;
- route a task to a more suitable model;
- add an acceptance test;
- split a task that repeatedly times out;
- reduce noisy log sampling;
- improve redaction rules;
- update the operator playbook.

### 12.1 Improvement evidence record

```json
{
  "proposalId": "improvement_telemetry_004",
  "observation": "Deployment readiness polling generated 42 repetitive events across six missions.",
  "evidence": [
    "mission_101",
    "mission_108",
    "mission_112"
  ],
  "proposedChange": "Collapse polling events and narrate only state transitions.",
  "expectedBenefit": "Lower status noise without losing failure visibility.",
  "risk": "low",
  "requiresApproval": false,
  "validation": [
    "telemetry aggregation test",
    "mission replay comparison"
  ]
}
```

The improvement system should propose changes from repeated evidence, not continually rewrite itself from one unusual event.

## 13. Evaluation plan

### Experiment 1: comprehension

Give participants the same agent run in three formats:

1. raw logs;
2. final response only;
3. live narrated telemetry plus evidence links.

Measure whether participants can correctly identify:

- current task;
- latest completed milestone;
- blocker;
- failure and recovery;
- approval requirement;
- final validation state.

### Experiment 2: interruption quality

Ask participants to pause or redirect a running mission. Measure whether narrated telemetry helps them intervene at an appropriate time without discarding unrelated completed work.

### Experiment 3: trust calibration

Introduce one plausible but false completion claim from a worker. Test whether an evidence-grounded reducer and narrator avoid presenting the task as complete.

### Experiment 4: overhead

Measure:

- CPU and memory overhead;
- event-storage growth;
- added inference cost;
- latency between event and narration;
- effect on OpenClaw task completion time.

### Experiment 5: improvement usefulness

Run repeated missions, generate improvement proposals from telemetry, and measure:

- accepted proposals;
- rejected proposals;
- repeated failure reduction;
- narration-noise reduction;
- cost and latency change;
- regressions introduced.

## 14. Minimal viable implementation

The first useful prototype needs:

1. one OpenClaw event adapter;
2. append-only JSONL telemetry;
3. mission and task identifiers;
4. a deterministic state reducer;
5. atomic `LIVE_STATUS.md` generation;
6. templates for task, test, failure, retry, and approval events;
7. secret redaction;
8. a terminal command to view or follow the status;
9. one post-mission improvement report;
10. replay tests using captured event fixtures.

The prototype does not need a complex dashboard. A readable Markdown file, a `tail`-style terminal view, and strong event fixtures are enough to validate the concept.

## 15. Relationship to 3DVR Agent

OpenClaw can remain the replaceable runtime that performs tool and computer operations.

3DVR Agent can provide the customer-facing control plane for:

- mission state;
- readable telemetry;
- task hierarchy;
- model and device routing;
- permissions and approvals;
- costs and budgets;
- memory and identity;
- improvement proposals;
- audit history;
- emergency stop.

The Live Narrator can begin as an OpenClaw sidecar and later become a general protocol that accepts events from other runtimes.

## 16. Contribution strategy

1. Confirm the exact events available in the installed OpenClaw version.
2. Capture a representative session fixture with secrets removed.
3. Implement the smallest adapter and reducer outside the core runtime.
4. Publish the event schema and replay test.
5. Measure usefulness with real 3DVR workflows.
6. Submit generally useful event or observability improvements upstream.
7. Keep 3DVR-specific mission UX in the control plane rather than forcing it into OpenClaw core.

## 17. Conclusion

A persistent agent should not disappear behind a spinner or flood the user with machine logs. It should maintain a truthful operational story.

OpenClaw Live Narrator proposes a narrow but foundational layer:

> **Observe the runtime. Reduce events into state. Narrate only what matters. Link every claim to evidence. Learn from repeated failures. Keep the human in command.**

This turns agent observability from a developer debugging feature into part of the everyday relationship between a person and their AI system.
