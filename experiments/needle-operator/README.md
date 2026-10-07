# Needle Operator Edge Prototype

Small, isolated experiment for using Cactus Compute Needle 3 as Operator's local edge router.

## Goal

Test a hybrid path:

```
user/device -> Needle (local) -> safe local tool OR Operator/cloud escalation
```

Needle is intentionally not treated as a general chat model. Its job here is fast local intent/tool routing, structured extraction, and a confidence signal. Consequential actions remain behind Operator's existing approval boundaries.

## Safety boundaries

- Prototype only; not wired into production Operator.
- No secrets or production credentials.
- No autonomous messaging, deployment, purchases, or other consequential actions.
- Telemetry is disabled by default in the demo.
- Low-confidence or unsupported requests escalate instead of guessing.

## Try it on a Linux server

Python 3.9+:

```sh
cd experiments/needle-operator
python -m venv .venv
. .venv/bin/activate
pip install cactus-needle
python prototype.py
```

The first run downloads the Needle runtime/weights. After they are cached, inference can run locally.

## What to measure

1. Correct tool selection for common Operator commands.
2. Correct argument extraction.
3. False-positive tool calls on unsupported requests.
4. Confidence distribution and a useful escalation threshold.
5. Latency and memory on representative edge hardware.
6. Behavior with network unavailable after model setup.

## Next integration step

If the experiment is reliable, expose the same small tool schemas used by Operator and let Needle produce a proposed local route. Operator remains authoritative: local safe/read-only calls may execute directly; low-confidence, complex, or consequential requests escalate to the existing Operator path.
