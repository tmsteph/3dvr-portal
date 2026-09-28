# Ephemeral GPU workers

This directory defines the future paid-by-use compute edge for 3DVR.

Nothing here provisions a GPU by itself. The Portal remains safe to deploy with all of these variables empty.

## Lanes

### Text / agent lane

Operator already supports an OpenAI-compatible text endpoint through `src/operator/ephemeral-compute.js`.

Use it for:

- open-weight chat/reasoning;
- code generation;
- model behavior that needs more owner control;
- future tool-capable models, with tools still gated by normal 3DVR permissions.

### Media lane

`src/operator/ephemeral-media.js` defines a provider-neutral job envelope for:

- image generation and edits;
- video generation;
- video editing;
- transcription/subtitles;
- future GPU-heavy transforms.

The worker contract is `worker-contract.schema.json`.

Media jobs default to a $4 admission ceiling and 30-minute runtime ceiling. Those are policy metadata until the provider-side worker enforces termination.

## Tool use

The job contract has a `toolPolicy` field. Its default is:

```json
{"mode":"none","tools":[]}
```

A future open model may receive tools only when 3DVR explicitly supplies an allowlist. Provider containers must never receive raw long-lived secrets. Tool execution should call the existing 3DVR control plane, which owns permissions, auditing, and secret access.

## Provider choices

- **Modal:** easiest path for a directly OpenAI-compatible LLM endpoint and scale-to-zero custom GPU services.
- **RunPod Serverless:** useful for custom GPU containers, vLLM, ComfyUI, and media pipelines with pay-per-second workers.

Keep both behind this contract so changing provider does not change Operator or the Digital Organism.

## Activation checklist

1. Choose one provider.
2. Deploy a text endpoint with zero idle replicas where supported.
3. Put its URL/token/model into the secret/config plane, not the repo.
4. Verify provider-side timeout/cancellation.
5. Make one manual text request.
6. Only then consider enabling `THREEDVR_EPHEMERAL_AUTO=true`.
7. Deploy media as a separate endpoint after text billing/receipts are trustworthy.

See `env.example` for configuration names.
