# OpenClaw as a Distributed Personal Agent Runtime

**3DVR Research Log — July 12, 2026**

## Research question

Can OpenClaw become the open runtime beneath a personal agent that:

1. works on several independent tasks concurrently;
2. automatically chooses an appropriate model and reasoning level for each task; and
3. routes work among cloud servers, laptops, phones, and future personal devices?

Our current conclusion is that these capabilities are being developed across the agent ecosystem, but they are not yet combined into one understandable, user-owned personal system. OpenClaw is a strong place to test and contribute because it already provides much of the personal-agent foundation: persistent sessions, tools, messaging interfaces, model access, skills, and device-oriented execution.

The opportunity for 3DVR is not to immediately replace OpenClaw. It is to help develop the missing orchestration layer while documenting real use, limitations, safety requirements, and upstream contribution opportunities.

## The problem we observed

A personal agent feels unnecessarily limited when a long-running job blocks every other request. A human assistant does not stop receiving messages because one research assignment is still running. An agent should similarly be able to keep a conversation responsive while several bounded jobs proceed in parallel.

The desired interaction is closer to:

```text
Goal: Prepare a new customer offer

● Research comparable offers       running on cloud
● Inspect existing brand assets    running on laptop
● Draft landing-page structure     waiting for research
● Check current deployment         running on cloud
● Draft customer message           awaiting approval
```

The system should also avoid using the strongest and most expensive model for every operation. Renaming files, checking service health, drafting a routine summary, debugging a deployment, and making a strategic decision do not need identical models or reasoning budgets.

Finally, a personal agent should not be tied to one machine. Different devices hold different capabilities and data:

| Node | Likely strengths |
| --- | --- |
| Cloud server | Always available, long-running jobs, public services, scheduled work |
| Laptop | Local files, development environment, browser sessions, larger compute budget |
| Phone | Camera, microphone, notifications, approvals, location-sensitive context |

The system should route work according to capability, availability, privacy, cost, battery, connectivity, and user preference.

## What exists today

### OpenClaw

OpenClaw already supplies many of the primitives needed for experimentation:

- a self-hosted personal-agent runtime;
- persistent sessions and workspaces;
- skills and tool execution;
- multiple model providers;
- sub-agent and multi-agent patterns;
- messaging-channel interfaces;
- execution on personal or cloud hardware.

The practical gap appears to be less about whether separate tasks or agents can exist and more about whether one supervisor can automatically decompose a goal, coordinate dependencies, assign models and nodes, expose progress clearly, recover from failures, and remain understandable to the user.

Relevant project:

- [OpenClaw repository](https://github.com/openclaw/openclaw)

### Multi-agent orchestration frameworks

Frameworks such as AutoGen demonstrate configurable conversations and collaboration among multiple agents. LangGraph-style systems represent workflows as graphs, allowing explicit dependencies, parallel branches, resumable state, and synthesis steps.

These systems support important orchestration ideas, but they are generally developer frameworks rather than a complete personal-agent experience.

References:

- [AutoGen paper](https://arxiv.org/abs/2308.08155)
- [AutoGen Studio paper](https://arxiv.org/abs/2408.15247)

### Durable distributed execution

Workflow systems such as Temporal already solve much of the non-AI infrastructure problem: durable task queues, retries, worker processes, schedules, timeouts, and recovery after interruption.

An agent supervisor could dispatch work to capability-specific queues such as:

```text
cloud.general
cloud.browser
laptop.local-files
laptop.gpu
phone.camera
phone.notification
```

The workflow engine does not decide what the user wants. It ensures that once the supervisor assigns a bounded task, the work can survive process failures and temporary node disconnections.

Reference:

- [Temporal documentation](https://docs.temporal.io/)

### Model gateways and routers

Model gateways increasingly provide provider abstraction, retries, budgets, fallbacks, latency-aware selection, and load balancing. The harder unsolved product question is semantic routing:

> What is the least expensive model and reasoning level likely to complete this particular task reliably and safely?

A useful router should consider:

- complexity;
- risk;
- required tools and modalities;
- expected token use;
- latency tolerance;
- privacy;
- previous success on similar tasks;
- confidence in the result;
- user and subscription budgets.

The safest first implementation is probably rule-based routing with measured escalation, not an opaque learned router.

## Proposed architecture

```text
3DVR Agent Control Plane
├── Goal and task supervisor
├── Dependency and concurrency scheduler
├── Model and reasoning router
├── Device capability registry
├── Permission and approval policy
├── Budget and usage governor
├── Unified logs and task history
└── Emergency stop

Execution layer
├── OpenClaw cloud worker
├── OpenClaw laptop worker
├── Phone capability node
└── Future personal hardware nodes
```

OpenClaw can remain the open execution runtime and personal-agent interface. The 3DVR layer can focus on orchestration, governance, visibility, deployment, subscriptions, and a consistent experience across devices.

This preserves the option to contribute generally useful capabilities upstream instead of maintaining an unnecessary fork.

## Initial routing policy

The first version should use transparent rules:

```text
Deterministic operation available     → use script or tool without an LLM
Routine text transformation           → economy model, low reasoning
Research or synthesis                 → general model, moderate reasoning
Difficult debugging or architecture   → strong coding/reasoning model
Low-confidence result                 → validate, retry, or escalate
Local private files                   → authorized local node
Long-running background work          → cloud node
Camera, microphone, notification      → phone node
Financial, destructive, or public act → explicit human approval
```

Every automatic choice should be visible and overridable.

## Research hypotheses

### H1: Concurrency improves usefulness more than adding another tool

Allowing the main conversation to stay responsive while bounded tasks run concurrently may produce a larger improvement in perceived agency than adding more integrations.

### H2: Rule-based routing captures most early value

A small set of explicit rules based on task type, risk, privacy, and required capability may route well enough to begin collecting useful data before developing a learned router.

### H3: The laptop and phone should be opportunistic nodes

The cloud can provide durable coordination, while personal devices advertise temporary capabilities. Work should pause, migrate, or fall back when a device disconnects rather than assuming every node is continuously online.

### H4: Readable execution is a product requirement

Users need to see what is running, waiting, blocked, failed, and awaiting approval. Raw logs are insufficient. Trust requires a task-level explanation of actions, models, nodes, cost, and permissions.

### H5: Security must be designed into routing

Parallelism and multiple devices increase the number of credentials, sessions, and possible failure paths. Permission scopes, isolated workspaces, approval gates, audit logs, and an emergency stop are part of orchestration—not later additions.

## Experiment plan

### Experiment 1: Concurrent bounded tasks

Ask one primary OpenClaw agent to perform a real compound goal containing three independent tasks and one dependent task.

Example:

```text
Research five prospects, inspect the current deployment,
draft an outreach message based on the research, and keep
responding to new messages while that work continues.
```

Record:

- whether work actually executes concurrently;
- whether the main conversation remains responsive;
- how child tasks are represented;
- whether dependencies are respected;
- whether tasks can be paused or cancelled;
- whether one failure blocks unrelated tasks;
- how results return to the supervisor.

### Experiment 2: Model and reasoning routing

Create a test set containing:

- deterministic shell check;
- short email summary;
- sales-message draft;
- multi-source research synthesis;
- difficult debugging task;
- high-risk public action.

Run each task through a simple routing policy. Measure:

- chosen model and reasoning level;
- latency;
- estimated cost;
- task success;
- validation failures;
- number of escalations;
- user corrections.

### Experiment 3: Cloud and laptop routing

Register a cloud worker and laptop worker with declared capabilities. Test:

- cloud-only task;
- local-file task;
- browser-session task;
- task started on laptop before disconnection;
- task queued while laptop is offline;
- user override of automatic placement.

### Experiment 4: Phone as an approval and sensor node

Begin with narrow capabilities rather than unrestricted phone automation:

- display a pending approval;
- approve, reject, or hold an action;
- capture a requested photograph;
- return microphone input;
- receive a completion or failure notification.

Measure reliability, battery impact, permission clarity, and recovery after the app is suspended.

## Minimal task record

```json
{
  "goalId": "prepare-offer-001",
  "taskId": "research-market",
  "status": "running",
  "dependsOn": [],
  "agent": "research",
  "modelTier": "economy",
  "reasoningLevel": "moderate",
  "node": "cloud",
  "riskLevel": "low",
  "requiresApproval": false,
  "estimatedBudgetUsd": 0.25,
  "createdAt": "2026-07-12T00:00:00Z"
}
```

This is deliberately small. The research should first establish which fields are actually needed for observability, routing, recovery, and user control.

## Contribution strategy

We should participate in OpenClaw as users and contributors before maintaining a fork.

1. Test existing sub-agent, multi-agent, model, and node behavior with real workflows.
2. Search and join relevant upstream discussions.
3. Publish reproducible observations instead of broad feature requests.
4. Submit small documentation and observability improvements first.
5. Prototype the supervisor as a companion layer or skill where possible.
6. Contribute generally useful primitives upstream.
7. Fork only if the upstream architecture prevents the required safety or orchestration model.

## Boundary between OpenClaw and 3DVR Agent

**OpenClaw** can be the replaceable open runtime that executes tools, maintains sessions, and connects models and channels.

**3DVR Agent** can be the customer-facing managed service that provides:

- deployment and updates;
- identity and subscription controls;
- task supervision;
- model and reasoning routing;
- device registration and routing;
- usage limits and budgets;
- readable activity logs;
- approval policies;
- local/cloud privacy controls;
- emergency stop.

This lets 3DVR develop a differentiated product without pretending the underlying open-source ecosystem does not exist.

## Immediate next actions

- Inventory the exact OpenClaw version and enabled features on the current 3DVR deployment.
- Configure a primary agent and at least two bounded specialist agents.
- Run the four experiments in this document.
- Save transcripts, timings, failures, routing choices, and screenshots.
- Convert each confirmed limitation into a focused upstream issue or local prototype.
- Update this research log with results rather than treating the current architecture as settled.

## Current conclusion

The most promising path is **adopt, test, contribute, and extend**.

The research opportunity is not simply “make another agent.” It is to develop and evaluate a transparent personal orchestration layer that can answer four questions for every task:

1. What should run now?
2. What can run in parallel?
3. Which model and reasoning level are sufficient?
4. Which available device is the safest and most capable place to execute it?

That is a concrete open-computing research program and a plausible foundation for 3DVR Agent.