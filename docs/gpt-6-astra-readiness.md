# GPT-6 Astra readiness

Status: preparation track for the September 3, 2026 GPT-6 Astra launch.

## Goal

Make GPT-6 Astra an opt-in frontier lane in 3DVR without changing the default model or coupling 3DVR memory, permissions, and audit state to one provider/model.

## Immediate compatibility work

- Keep the OpenAI Responses API as the primary OpenAI transport.
- Treat GPT-6 Astra as a reasoning model that must not receive `temperature`, `top_p`, or `top_logprobs`.
- Replace GPT-5-specific request-shape checks with capability-oriented model handling so later reasoning-model generations do not accidentally receive unsupported sampling parameters.
- Add `gpt-6-astra` to the curated model choices used by Site Builder, Guide, and Forge only after request-shape compatibility is covered by tests.
- Keep current production defaults unchanged while access is rolling out.
- Allow the frontier model to be selected by server configuration so future model promotion does not require changing business logic.

## First Astra lane

Use Astra first for high-value, low-volume work:

- Operator planning and difficult multi-step work
- coding / architecture / repair
- research with verification
- supervisor decisions in milestone-supervised agent workflows

Keep routine, repetitive, and high-volume work on cheaper models unless eval evidence shows a reason to promote it.

## Eval gate before promotion

Compare the existing model against Astra on representative 3DVR tasks and record:

- task success / verifier result
- tool-call success
- latency
- token and estimated cost
- retries / corrections
- whether the result preserved user intent and authority boundaries

Canary to Thomas's account first. Promote by task class, not globally.

## Architecture rule

Digital Organism memory, tool permissions, audit history, and user-owned state stay outside the model. The model router can choose Astra, other OpenAI models, Claude, or local/open models without moving ownership of memory into the provider.

## Later Astra-native experiments

After the basic compatibility/eval gate is stable, evaluate:

- async tool calling for long-running agent work
- mid-turn steering
- reasoning-effort changes during a conversation
- larger-context workflows
- supervisor/worker model routing

These are follow-up experiments, not prerequisites for initial compatibility.
