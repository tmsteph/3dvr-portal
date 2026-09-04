# GPT-6 Astra first eval

Run this only after the 3DVR OpenAI request builders can form a valid Astra request and account access is confirmed.

## Compare

Use the current production route and GPT-6 Astra on the same small set of real 3DVR tasks:

1. Operator: turn a messy request into a correct bounded next action.
2. Forge: produce a useful project/action brief from incomplete input.
3. Site Builder: generate a mobile-safe page while using web search only when current facts are needed.
4. Coding supervisor: inspect a concrete portal bug, propose a minimal fix, and verify it.
5. Digital Organism supervisor: use retrieved context while preserving memory/privacy boundaries.

## Record

For each run record model, reasoning effort, success/failure, verifier evidence, tool-call failures, correction count, latency, token usage, and estimated cost. Do not score style alone as success.

## Promotion rule

Astra should win a task lane because it improves completed-task reliability or lowers total cost-to-success, not because it is newer. Keep lower-cost models for lanes where they already meet the verifier.
