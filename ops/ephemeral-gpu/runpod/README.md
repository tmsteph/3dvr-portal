# RunPod Serverless target

RunPod Serverless is a good target for the 3DVR GPU worker because it is pay-per-second and designed to autoscale workers.

## Text

Deploy a vLLM-backed Serverless endpoint and expose an OpenAI-compatible chat-completions URL. Configure that exact URL as `THREEDVR_EPHEMERAL_LLM_URL`; 3DVR intentionally does not hard-code a RunPod URL shape.

Keep idle capacity at zero unless a real latency requirement later justifies warm workers.

## Media

Use a custom Serverless container that accepts the 3DVR worker contract. Internally it can route to ComfyUI, FFmpeg/NVENC, Whisper, or a video model.

The container must:

- honor `budget.maxRuntimeMs`;
- reject a task whose declared ceiling violates server policy;
- clean temporary input/output files;
- return durable output references rather than huge base64 payloads;
- provide a provider job ID for audit;
- terminate/cancel work when the runtime ceiling is reached.

Do not put 3DVR secrets into the container. If future tool use is enabled, the worker receives only short-lived scoped credentials for the exact allowed tools.

## No deployment yet

This directory contains architecture only. Creating an endpoint, adding a payment method, or uploading a provider API key is a separate explicit infrastructure action.
