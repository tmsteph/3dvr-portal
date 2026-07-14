# Milestone-Supervised Agent Hierarchies

**A working paper on strategic supervision, economical execution, and evidence-driven autonomy**

**Thomas M. Stephens · 3DVR Research · July 2026**

## Abstract

Large language model agents can plan, call tools, operate computers, and complete extended digital workflows. However, using a frontier model for every execution step is expensive, while delegating an entire mission to smaller models can produce planning failures, drift, weak recovery, and unsupported claims of completion. We propose **Milestone-Supervised Agent Hierarchies**, an asymmetric orchestration architecture in which a high-capability supervisor interprets user intent, defines success, constructs a dependency-aware plan, assigns bounded tasks to lower-cost workers, and evaluates structured evidence at milestones and exception boundaries.

Workers operate within explicit budgets, permissions, and task contracts. They return artifacts, test results, assumptions, observations, and unresolved risks rather than merely reporting that a task is complete. The supervisor does not inspect every generated token. It intervenes when a milestone is reached, verification fails, uncertainty exceeds a threshold, a budget is threatened, an environmental observation contradicts the plan, or an action crosses a sensitive boundary. It can revise the plan, retry a task, change tools, allocate a stronger model, or request human approval.

We describe the architecture, task and evidence records, model-escalation policy, safety boundaries, and a proposed experimental comparison among small single agents, frontier single agents, homogeneous multi-agent teams, and asymmetric hierarchies. We hypothesize that milestone supervision can preserve much of the strategic judgment of frontier models while shifting routine execution to economical models, improving the cost-reliability frontier without sacrificing human legibility or control.

## 1. Introduction

The simplest language-model agent is a loop:

```text
observe → reason → act → observe
```

This pattern is powerful because it allows a model to respond to changes in its environment. It is also structurally limited. A single model must simultaneously preserve the user's intent, maintain a long plan, choose tools, execute routine operations, detect errors, judge its own output, manage cost, and decide when an action requires human approval.

A uniformly powerful model can perform many of these functions but may be unnecessarily expensive for deterministic or repetitive work. A uniformly inexpensive model may execute routine work efficiently but fail to preserve global coherence across a long mission. A homogeneous group of agents can add parallelism, yet shared weaknesses may remain: every worker can misunderstand the same requirement, accept the same invalid assumption, or repeat the same style of error.

Human organizations rarely assign every decision and every mechanical action to one person. They divide work across levels of abstraction. An architect or principal engineer protects intent and system coherence. Specialists execute bounded tasks. Tests and review processes provide evidence. Managers intervene at milestones and exceptions rather than watching every keystroke.

This paper explores an analogous architecture for computer-using agents:

> **Strategic intelligence should supervise the mission. Economical intelligence should execute bounded work. Verification should connect the two.**

The proposed system is not simply a larger model calling a smaller model. It is a persistent supervisory control loop with explicit plans, task dependencies, evidence contracts, model and device routing, permission boundaries, and observable state.

## 2. Research question

The central question is:

> Can a high-capability model supervising lower-cost workers at meaningful milestones achieve task reliability comparable to or better than a frontier-model agent while reducing inference cost and preserving understandable human control?

Supporting questions include:

1. Which tasks can be delegated safely to smaller models?
2. How frequently must the supervisor inspect progress?
3. What evidence must a worker return for a completion claim to be trusted?
4. When should the system retry, replan, escalate models, or ask a human?
5. Does an independent verifier materially improve reliability?
6. How much cost is saved after accounting for supervision and failed attempts?
7. Can the resulting execution trace remain understandable to a non-specialist user?

## 3. Related work

This architecture builds on several active research directions rather than claiming that hierarchical agents are new.

### 3.1 Reasoning and acting

ReAct interleaves reasoning traces with environment actions, demonstrating the value of updating plans from observations rather than treating planning and execution as isolated phases [1]. The proposed architecture retains this feedback loop inside individual tasks while adding a persistent supervisory layer above them.

### 3.2 Multi-agent collaboration

AutoGen provides a framework for configurable conversations among multiple agents [2]. MetaGPT models a software organization through specialized roles and standardized operating procedures, emphasizing intermediate artifacts and structured collaboration [3]. These systems establish that role separation can improve complex task execution, but they do not by themselves determine the optimal allocation of model capability, verification effort, and human authority.

### 3.3 Parallel execution and task graphs

LLMCompiler separates planning, task dispatch, and execution to enable parallel function calls over dependency-aware task graphs [4]. Verified Multi-Agent Orchestration similarly uses a plan-execute-verify-replan loop over a directed acyclic graph of subquestions [5]. Our proposal adopts task graphs and verification but focuses specifically on **asymmetric model capability**, **milestone-limited supervision**, **evidence contracts**, and persistent computer operation.

### 3.4 Model routing and cascades

FrugalGPT demonstrates that model cascades can reduce cost while maintaining or improving quality [6]. RouteLLM learns to choose between stronger and weaker models using preference data [7]. These approaches primarily route requests or responses. A persistent agent mission introduces additional routing variables: dependencies, tool access, risk, reversibility, privacy, prior failures, and the cost of allowing a weak execution step to corrupt later work.

### 3.5 Plan-execution alignment

Recent work continues to identify gaps between plausible plans and executable trajectories. PIVOT treats trajectories as objects that can be inspected and refined through environment interaction before final verification [8]. This supports the premise that a plan should be revised from evidence rather than treated as a fixed script.

## 4. Proposed architecture

```text
Human goal
    ↓
Mission Supervisor
    ├── intent and constraint model
    ├── success criteria and acceptance tests
    ├── task graph and dependency manager
    ├── model, tool, and device router
    ├── budget and permission governor
    ├── milestone and exception monitor
    └── synthesis and final verification
            ↓
Durable Task Queue
    ├── research worker
    ├── coding worker
    ├── browser worker
    ├── communication worker
    ├── deterministic tool worker
    └── local-device worker
            ↓
Artifacts, observations, tests, and risk reports
            ↓
Independent verification and supervisor review
            ↓
Accept, retry, replan, escalate, or request approval
```

### 4.1 Mission supervisor

The supervisor is the highest-capability reasoning component in the system. Its responsibilities are deliberately strategic:

- interpret the user's actual objective;
- preserve constraints across a long-running mission;
- define observable success conditions;
- decompose the mission into bounded tasks;
- identify dependencies and safe parallel branches;
- choose the least expensive sufficient model, tool, and execution node;
- establish budgets and permission scopes;
- inspect evidence at milestones;
- respond to exceptions and contradictions;
- integrate outputs into a coherent result;
- explain meaningful plan changes to the user.

The supervisor should not perform routine execution merely because it can. Its scarce capability is most valuable where judgment, ambiguity, architecture, tradeoffs, or cross-task coherence dominate.

### 4.2 Workers

Workers receive narrow assignments with explicit input, output, constraints, and tests. A worker may still plan locally, but it does not redefine the mission.

Examples include:

- inspect three files and identify the cause of a test failure;
- implement one function according to supplied acceptance criteria;
- extract defined fields from a set of webpages;
- run a deployment check and return structured observations;
- compare an artifact against a schema;
- draft a message using facts already approved by the supervisor.

Worker sessions should be replaceable. A mission should survive the loss, restart, or model substitution of an individual worker.

### 4.3 Independent verifier

The worker that creates an artifact should not be the only component deciding whether it is correct. Verification can be performed by:

1. deterministic tests;
2. schema and type validation;
3. environment observation;
4. a separate reviewing model;
5. the supervisor;
6. a human for sensitive decisions.

The preferred order is the least subjective reliable method. A passing executable test is generally stronger evidence than a model's confidence statement.

### 4.4 Durable orchestration layer

The language models should not be responsible for low-level workflow durability. A conventional orchestration layer should manage:

- queues;
- retries;
- timeouts;
- task leases;
- dependency release;
- cancellation;
- persistence after process failure;
- worker registration;
- schedules;
- event logs.

Models decide what the work means. Deterministic software ensures that assigned work remains trackable and recoverable.

## 5. Milestone supervision

Continuous supervision would require the strongest model to inspect every intermediate action, eliminating much of the economic benefit. No supervision until the end allows errors to compound.

Milestone supervision occupies the middle ground. The supervisor intervenes when one of the following occurs:

- a planned deliverable is produced;
- an acceptance test completes;
- a task blocks a dependency;
- a worker reports uncertainty above a threshold;
- an observation contradicts a planning assumption;
- retry limits are approached;
- projected cost exceeds the task budget;
- a requested action becomes public, destructive, financial, or irreversible;
- a worker requests clarification;
- the mission is ready for final synthesis.

A milestone is therefore not merely a time interval. It is a semantically meaningful boundary where new evidence can change the plan.

### 5.1 Supervision-frequency hypothesis

Let:

- `C_s` be the cost of one supervisor review;
- `C_w` be the expected worker execution cost between reviews;
- `P_f(k)` be the probability that an undetected failure compounds across `k` worker steps;
- `C_r(k)` be the expected recovery cost after `k` unchecked steps.

Very frequent review increases `C_s`. Very infrequent review increases `P_f(k) × C_r(k)`. The optimal review policy should minimize total expected cost while satisfying a reliability constraint.

This suggests that supervision frequency should vary by task risk and error propagation, not remain globally fixed.

## 6. Task contracts

A task contract should be understandable by both models and deterministic infrastructure.

```json
{
  "missionId": "agent-paper-001",
  "taskId": "implement-research-route",
  "objective": "Create a public portal route that renders the canonical Markdown paper.",
  "inputs": [
    "docs/research/milestone-supervised-agent-hierarchies.md"
  ],
  "outputs": [
    "research/milestone-supervised-agent-hierarchies/index.html"
  ],
  "dependsOn": ["write-paper"],
  "acceptanceTests": [
    "route returns HTTP 200",
    "paper title is visible",
    "canonical Markdown link is visible",
    "mobile viewport has no horizontal page overflow"
  ],
  "modelTier": "economy",
  "reasoningLevel": "low",
  "riskLevel": "low",
  "budgetUsd": 0.20,
  "permissions": ["repository:write:branch"],
  "requiresHumanApproval": false
}
```

The contract prevents a worker from silently broadening its authority. It also makes evaluation possible across different models and implementations.

## 7. Evidence contracts

A completion message is not sufficient evidence. Every worker should return a structured report.

```json
{
  "taskId": "implement-research-route",
  "status": "completed",
  "artifacts": [
    "research/milestone-supervised-agent-hierarchies/index.html"
  ],
  "commandsRun": [
    "node --test tests/research-pages.test.js"
  ],
  "testResults": [
    {
      "name": "research page contract",
      "status": "passed"
    }
  ],
  "observations": [
    "The article renders from the same-origin Markdown file."
  ],
  "assumptions": [
    "The CDN-hosted Markdown renderer remains reachable."
  ],
  "unresolvedRisks": [
    "Offline rendering requires vendoring the renderer later."
  ],
  "confidence": 0.86
}
```

The supervisor can reject a completion report that lacks required evidence even when the artifact appears plausible.

### 7.1 Evidence strength

Evidence can be ranked approximately as follows:

```text
reproducible deterministic test
    > direct environment observation
    > independent model review with cited artifacts
    > creator-model self-review
    > unsupported completion claim
```

The ranking is contextual. A visual design judgment may require human or model review, while a schema requirement should be tested deterministically.

## 8. Model routing and escalation

The initial routing policy should be explicit and inspectable rather than learned from opaque signals.

```text
deterministic operation available     → script or conventional software
routine bounded transformation         → small model, low reasoning
structured extraction                  → small model plus schema validation
research synthesis                     → general model, moderate reasoning
architecture or difficult debugging    → strong model, high reasoning
verification failure                   → retry with revised context
repeated or ambiguous failure          → stronger model
sensitive or irreversible action       → human approval
```

A model should be escalated because evidence indicates insufficiency, not merely because a stronger model exists.

### 8.1 Escalation triggers

Potential triggers include:

- failed acceptance test;
- output-schema violation;
- conflicting worker reports;
- missing required evidence;
- low calibrated confidence;
- repeated tool errors;
- unplanned dependency;
- security-sensitive input;
- supervisor-detected ambiguity;
- budgeted retry limit reached.

### 8.2 De-escalation

The system should also learn when a task class can be routed downward. Repeated successful execution with strong deterministic validation may justify moving future instances to a cheaper model or a non-LLM script.

## 9. Human authority and safety boundaries

The hierarchy must not become a mechanism for hiding consequential actions behind layers of delegation. Human authority should be encoded at the task and policy level.

Explicit approval should normally be required before:

- sending public or external communications;
- spending or transferring money;
- creating financial accounts;
- accepting legal terms;
- exposing credentials or private information;
- deleting or destructively modifying important data;
- deploying security-sensitive infrastructure;
- acting as the user in a high-impact personal context;
- making an irreversible physical-device action.

Workers should receive the minimum permissions necessary for their assigned task. A research worker does not need deployment credentials. A writing worker does not need shell access. A test worker can often operate against a disposable environment.

The supervisor should be able to request approval, but it should not be able to redefine a forbidden action as an ordinary task to bypass policy.

## 10. Human-readable telemetry

Raw model transcripts and terminal logs are insufficient for most users. The system should expose a task-level execution view:

```text
09:31  Supervisor divided the mission into five tasks.
09:32  Research worker is comparing three orchestration approaches.
09:34  Coding worker completed the first article route.
09:34  Verification failed: the mobile page overflows horizontally.
09:35  Supervisor revised the layout task and preserved the completed research work.
09:37  Coding worker applied the responsive fix.
09:38  Tests passed. Publication is awaiting human approval.
```

The user should be able to answer:

1. What is running?
2. Why is it running?
3. Which model, tool, and device are being used?
4. What is blocked?
5. What changed in the plan?
6. What evidence supports completion?
7. What requires approval?
8. What has the mission cost so far?
9. How can the mission be paused or stopped?

Legibility is part of correctness because it allows a human to detect drift before the system reaches a consequential boundary.

## 11. OpenClaw and 3DVR Agent

OpenClaw can serve as a replaceable computer-operation and personal-agent runtime providing sessions, tools, messaging interfaces, and execution on cloud or personal hardware.

The proposed 3DVR layer can operate as a supervisory control plane providing:

- mission and task records;
- model and reasoning routing;
- device capability routing;
- subscriptions and usage budgets;
- permissions and approval policies;
- human-readable telemetry;
- persistent user memory;
- audit history;
- emergency stop;
- evaluation and improvement data.

The initial implementation should be a companion layer or skill rather than an unnecessary fork. Generally useful observability, task, and safety primitives can be contributed upstream when appropriate.

## 12. Experimental design

### 12.1 Conditions

The same task set should be executed under four conditions:

| Condition | Description |
| --- | --- |
| Small single agent | One economical model plans and executes the entire mission |
| Frontier single agent | One high-capability model plans and executes the entire mission |
| Homogeneous team | Multiple agents use the same model tier with role separation |
| Asymmetric hierarchy | A high-capability supervisor coordinates economical workers and independent verification |

### 12.2 Task families

The benchmark should include realistic computer work rather than only question answering:

- repair a failing software application;
- implement a feature from acceptance criteria;
- research and compare technical alternatives;
- configure a cloud service in a disposable environment;
- reconcile information across multiple sources;
- complete a browser-and-terminal workflow;
- recover from an intentionally introduced failure;
- prepare but do not send an external communication;
- detect a task that requires human approval.

### 12.3 Metrics

Primary metrics:

- final task success;
- acceptance-test pass rate;
- total inference cost;
- total tool and infrastructure cost;
- completion latency;
- number of retries;
- number and type of supervisor interventions;
- model escalations;
- unresolved defects;
- unauthorized or unsafe action attempts;
- human effort required;
- accuracy of progress reports;
- recovery after worker or node interruption.

### 12.4 Required ablations

The experiment should separately remove or alter:

- milestone supervision;
- independent verification;
- evidence contracts;
- model asymmetry;
- explicit task budgets;
- permission scoping;
- structured task graphs;
- human-readable telemetry.

These ablations are necessary to determine which parts create measurable value rather than attributing all improvement to having more model calls.

### 12.5 Adversarial cases

The task set should include:

- a plausible but incorrect worker result;
- a test that passes for the wrong reason;
- contradictory evidence from two workers;
- a poisoned or malicious external instruction;
- a worker that exceeds scope;
- a disconnection during execution;
- a budget exhaustion event;
- an irreversible action proposed without approval.

## 13. Hypotheses

### H1: Asymmetric hierarchies improve the cost-reliability frontier

A frontier supervisor with economical workers will achieve higher success than a small single agent at substantially lower cost than a frontier model performing every step.

### H2: Milestone supervision captures most of the value of continuous supervision

Reviewing semantically meaningful boundaries will approach the reliability of continuous review while requiring fewer high-capability model calls.

### H3: Evidence contracts reduce false completion

Workers required to provide artifacts, tests, assumptions, and unresolved risks will produce fewer unsupported completion claims than workers returning unrestricted natural-language summaries.

### H4: Independent verification reduces correlated self-approval errors

Separating artifact creation from artifact acceptance will catch failures that creator-model self-review misses.

### H5: Rule-based routing is sufficient for the first useful system

Transparent routing rules based on task type, risk, privacy, and observed failure will capture meaningful savings before a learned router is introduced.

### H6: Readable telemetry improves calibrated trust

Users will better distinguish real progress from plausible narration when shown task state, evidence, interventions, costs, and approval boundaries.

## 14. Limitations and risks

The architecture introduces its own failure modes.

### 14.1 Supervisor bottleneck

A single supervisor may become a latency bottleneck or single point of conceptual failure. Important missions may require a separate verifier or periodic adversarial review of the supervisor's plan.

### 14.2 Correlated model errors

Different model sizes from the same family may share assumptions and blind spots. Independent verification is not truly independent when all evaluators rely on closely related training distributions.

### 14.3 Coordination overhead

For small tasks, decomposition, routing, reporting, and verification may cost more than direct execution. The system needs a threshold below which a single-agent or deterministic path is preferable.

### 14.4 False confidence from structure

A detailed task graph and polished evidence report can make an incorrect mission appear rigorous. Structure must not substitute for valid tests and direct observations.

### 14.5 Benchmark leakage

If routing and prompts are tuned to a narrow task set, measured gains may not generalize to real personal or business workflows.

### 14.6 Security expansion

More workers and devices create more credentials, sessions, queues, and attack surfaces. Capability isolation and revocation must be built into the execution layer.

## 15. Minimal implementation

A useful prototype requires only:

1. one persistent supervisor session;
2. a durable mission and task store;
3. dependency-aware task dispatch;
4. two or three isolated worker sessions;
5. rule-based model selection;
6. structured worker evidence reports;
7. deterministic acceptance tests where possible;
8. pause, cancel, retry, and escalate controls;
9. human approval gates;
10. a readable mission event stream.

The prototype should begin with software and research tasks in disposable environments. Financial, identity, and unrestricted personal-device automation should remain outside the first experimental boundary.

## 16. Publication and development program

This working paper begins a two-stage program.

### Stage 1: Open architecture publication

- publish the architecture and terminology;
- publish task and evidence schemas;
- document assumptions and safety boundaries;
- invite critique and alternative designs;
- implement a minimal supervisor around OpenClaw or another replaceable runtime.

### Stage 2: Empirical systems paper

- publish benchmark tasks;
- publish reproducible configurations;
- record model versions and pricing dates;
- publish task traces and failure analyses;
- report costs, latency, success, and human intervention;
- run the required ablations;
- revise or reject hypotheses according to evidence.

## 17. Conclusion

Autonomous agents should not be designed as one uniformly intelligent process. They can be organized as a transparent institution: strategic intelligence protects intent, economical specialists execute bounded work, verification governs claims of completion, deterministic infrastructure preserves state, and human authority remains at consequential boundaries.

The proposed architecture does not assume that larger models are infallible or that smaller models are merely disposable. It allocates different forms of intelligence to the level where they are most useful. The supervisor is valuable because it can reason across the mission. Workers are valuable because specialization, parallelism, and lower cost make sustained operation possible. Tests and evidence are valuable because neither level should be trusted solely on the basis of fluent language.

The practical objective is an agent system that can truthfully say not only **what it did**, but also **why it did it, what evidence supports it, what failed, what changed, what it cost, and where the human still holds authority**.

## References

1. Yao, S. et al. “ReAct: Synergizing Reasoning and Acting in Language Models.” arXiv:2210.03629, 2022. https://arxiv.org/abs/2210.03629
2. Wu, Q. et al. “AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation.” arXiv:2308.08155, 2023. https://arxiv.org/abs/2308.08155
3. Hong, S. et al. “MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework.” arXiv:2308.00352, 2023. https://arxiv.org/abs/2308.00352
4. Kim, S. et al. “An LLM Compiler for Parallel Function Calling.” arXiv:2312.04511, 2023. https://arxiv.org/abs/2312.04511
5. Zhang, X. et al. “Verified Multi-Agent Orchestration: A Plan-Execute-Verify-Replan Framework for Complex Query Resolution.” arXiv:2603.11445, 2026. https://arxiv.org/abs/2603.11445
6. Chen, L., Zaharia, M., and Zou, J. “FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance.” arXiv:2305.05176, 2023. https://arxiv.org/abs/2305.05176
7. Ong, I. et al. “RouteLLM: Learning to Route LLMs with Preference Data.” arXiv:2406.18665, 2024. https://arxiv.org/abs/2406.18665
8. Zhang, T. et al. “PIVOT: Bridging Planning and Execution in LLM Agents via Trajectory Refinement.” arXiv:2605.11225, 2026. https://arxiv.org/abs/2605.11225
