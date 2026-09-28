# Modal target

Modal is a strong first target for the text lane because its current Endpoint product can deploy OpenAI-compatible LLM inference and serverless services scale down when idle.

A future activation can use Modal's endpoint CLI with an open-weight model, then point `THREEDVR_EPHEMERAL_LLM_URL` at the resulting OpenAI-compatible API.

For custom media work, use a Modal Web Function/Server or GPU Function that implements the 3DVR worker contract.

## Recommended separation

- one text endpoint;
- one media endpoint;
- model caches/weights stored in provider-native persistent storage;
- zero idle replicas unless measurements justify otherwise.

## Cold starts are acceptable

This lane is an escape hatch, not the default chat path. Optimize for zero idle cost first. If usage grows enough that cold starts become painful, that is evidence that dedicated GPU economics should be reconsidered.

## No deployment yet

No Modal app, secret, or endpoint is created by the Portal repository. Activation remains an explicit infrastructure step.
