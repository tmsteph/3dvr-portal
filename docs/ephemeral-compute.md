# Ephemeral GPU escalation

3DVR should not pay for a large GPU twenty-four hours a day before the workload justifies it.

The first escalation lane therefore treats GPU compute as a temporary execution resource:

```
Operator
  -> normal hosted model path
  -> explicit/approved ephemeral lane when more model control is needed
  -> OpenAI-compatible serverless GPU endpoint
  -> response
  -> worker can scale back to zero
```

## Current scope

Phase 1 is deliberately small:

- text inference only;
- no always-on GPU;
- provider-neutral OpenAI-compatible endpoint;
- disabled until endpoint, token, and model are configured;
- automatic escape routing is off by default;
- explicit phrases such as "use our own model for this" can select the lane once configured;
- private Portal/Digital Organism context is excluded by default;
- image routing is excluded by default;
- a per-job admission ceiling and runtime timeout are attached to each request.

Tool-capable open models and image/video workers should use the same budget and receipt contract, but should be added as separate worker capabilities rather than turning this text adapter into a giant provider-specific runtime.

## Environment

Required:

- `THREEDVR_EPHEMERAL_LLM_URL` — an OpenAI-compatible chat-completions endpoint.
- `THREEDVR_EPHEMERAL_LLM_TOKEN`
- `THREEDVR_EPHEMERAL_LLM_MODEL`

Optional:

- `THREEDVR_EPHEMERAL_PROVIDER` — label such as `runpod` or `modal`.
- `THREEDVR_EPHEMERAL_GPU_USD_PER_HOUR` — used to estimate the job ceiling.
- `THREEDVR_EPHEMERAL_MAX_JOB_USD` — defaults to $2.
- `THREEDVR_EPHEMERAL_MAX_RUNTIME_MS` — defaults to 20 minutes.
- `THREEDVR_EPHEMERAL_MAX_TOKENS` — defaults to 1600.
- `THREEDVR_EPHEMERAL_AUTO=true` — allows narrow automatic escape routing when the prompt says the current provider cannot/refuses to do the task.
- `THREEDVR_EPHEMERAL_INCLUDE_CONTEXT=true` — permits owner/Portal/memory context to be forwarded. Leave false unless the rented endpoint is trusted for that data.
- `THREEDVR_EPHEMERAL_ALLOW_IMAGES=true` — reserved for endpoints whose selected model accepts the same image input contract.

## Budget semantics

The Portal computes an admission/runtime ceiling and aborts the HTTP request at that runtime. It also sends:

- `X-3DVR-Max-Runtime-Ms`
- `X-3DVR-Max-Job-Usd`

Those headers are part of the 3DVR worker contract. A provider-specific RunPod/Modal worker should enforce the ceiling server-side and terminate/cancel the underlying job when the deadline is reached. An HTTP abort alone is not proof that a third-party GPU stopped billing.

That provider-side cancellation is required before calling this a hard billing cap.

## Next steps

1. Deploy one scale-to-zero text endpoint and configure these variables.
2. Verify a manual "use our own model" Operator turn end to end.
3. Add a provider-specific cancellation receipt.
4. Add a separate media worker for FFmpeg + open image/video models.
5. Add tool execution only through the existing Operator permission/audit contracts.
