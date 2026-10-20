# Operator

The control plane for a **self-hosted personal AI agent** — software that acts
on your devices only through explicit, signed, policy-checked steps.

This directory holds the working prototype of that control plane ("Gate 0"):
the safety spine every action flows through, before any real device control,
networking, or model integration exists. It lives in the 3DVR Portal monorepo
(`tmsteph/3dvr-portal`) alongside the Portal's Operator UI (`operator/`) and
runtime surface (`operator-runtime/`). Everything here runs locally with no
network and no database.

## The idea in one paragraph

An AI agent that can touch your phone, files, and accounts needs more than
good intentions — it needs a control plane that *cannot* skip the safety
checks. Here, every proposed action is wrapped in a signed envelope, scored
against a risk policy (R0–R4), approved by a live human-bound approval for
anything risky, executed exactly once, and recorded in a tamper-evident audit
chain. The demo below proves each of those properties.

## Layout

- `protocol/schemas/` — the contracts, as JSON Schemas: action envelopes,
  capability manifests, approvals (bound to the exact action hash), receipts
  (hash-chained), jobs, devices.
- `policy/` — risk tiers R0–R4 and the default owner policy. Policy is pure
  functions only (`operator-core/src/policy.ts`), so it can be tested and
  audited in isolation.
- `operator-core/` — the spine: types, policy engine, job state machine,
  device registry, fake executor, append-only audit store.
- `test-harness/` — reserved for replay and fault-injection tests (Gate 1+).

## Run it

```bash
cd operator-core
npm install
npm run demo   # golden path + fail-closed tests, 12 checks
```

## What the demo proves

1. A job travels intent → plan → policy → approval → execution → receipts.
2. Low-risk actions (R1) auto-allow; anything R2 or above needs a live
   approval tied to that exact action.
3. Forged or unsigned action envelopes are refused by the executor.
4. Delivering the same action twice produces one effect (with a receipt
   saying the duplicate was suppressed).
5. Revoked devices are blocked before anything runs.
6. An approval for action A can't be reused to authorize action B.
7. Every job's audit chain verifies end-to-end — tampering is detectable.

## Gate 1, Step 1 — model router (`operator-core/src/model/`)

A model layer that plugs into `OperatorCore.proposeActions`: providers return
raw text, the router parses and **validates every proposal against the devices
and capabilities the planner was actually given**, and only validated typed
proposals reach the core — where policy still decides. Hallucinated
capabilities, unknown devices, non-JSON output, and empty plans all fail
closed; an optional fallback provider is tried before giving up.

Providers: any OpenAI-compatible API (API-first), Ollama (local), and a fake
provider for tests. Config is server-side env only (`OPERATOR_MODEL_PROVIDER`,
`OPERATOR_MODEL_NAME`, `OPERATOR_MODEL_BASE_URL`, `OPERATOR_MODEL_API_KEY`,
`OPERATOR_MODEL_FALLBACK`) — see `src/model/config.ts`. Keys are never logged
or committed; in production they are delivered via the secrets broker.

**Production note:** nothing in the Portal imports this package yet. The
production Operator (`operator/`), the Hetzner agent (`apps/agent/`), and
`operator-runtime/` do not reference `operator-core/` — wiring it in is a
later, separate gate (Gate 1 Steps 2 and 5), not part of Step 1.

Run the tests: `npm test` in `operator-core/` (Gate 0 demo plus the router
suite in `src/model/router.test.ts`).

## Prototype notes

- Envelope signing is HMAC-SHA256 today, keyed by `OPERATOR_CORE_SECRET`
  (defaults to a dev-only placeholder when unset). The design calls for
  Ed25519 device identity before any pilot — this is a documented swap, not
  production crypto.
- The "planner" is a deterministic stub. A real model plugs into
  `OperatorCore.proposeActions` and still crosses the same policy boundary.
- No network, no database: everything is in-process. PostgreSQL and mTLS
  WebSocket transport arrive at Gate 1.

## License

GPLv3 — this package is part of the 3DVR Portal monorepo, covered by the
[LICENSE](../LICENSE) at the repo root. Built by [3DVR](https://3dvr.tech).
