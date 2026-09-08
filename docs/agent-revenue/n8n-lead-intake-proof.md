# n8n Lead Intake Reliability Proof

This is a small, disarmed portfolio workflow for buyers evaluating 3DVR's automation work.
It is intentionally useful without requiring a buyer to share production credentials.

Import:

`examples/n8n/lead-intake-reliability.json`

## What it demonstrates

- POST webhook intake with an explicit response node.
- Input normalization and validation before downstream work.
- A 24-hour idempotency window keyed by `leadId`.
- Duplicate webhook acknowledgement without a second CRM mutation.
- Deterministic NC/SC routing before any optional model step.
- A production-shaped CRM upsert payload without making a live external write.
- Explicit 400, 200-duplicate, and 202-accepted outcomes.
- No credentials or secrets embedded in the workflow.

## Why it is disarmed

The demo stops at a `crmMutation` object instead of calling a real CRM.
A client can inspect the exact fields and acceptance behavior first, then replace the final response with an authorized CRM/API node inside their sandbox.

This keeps a portfolio demonstration honest: it proves workflow structure, validation, routing, failure behavior, and handoff quality without claiming a client deployment that did not happen.
## Test payloads

Accepted:

```json
{"leadId":"lead-1001","email":"buyer@example.com","state":"NC","source":"demo"}
```

Duplicate: send the accepted payload again within 24 hours. It should return `status: duplicate` and not produce another mutation.

Rejected:

```json
{"leadId":"","email":"not-an-email","state":"North Carolina"}
```

The rejected path should return HTTP 400 with validation errors.

## Production extension

For a paid sandbox project, the next node would be the buyer-authorized CRM/API write. The same `idempotencyKey` should also be persisted in a shared database when multiple workers can process the same source event; workflow static data is deliberately used here only to keep this proof self-contained.

An AI enrichment step can be inserted after deterministic eligibility checks. Its output should be schema-validated before any customer-facing or CRM-changing action, with retry and review paths kept separate from deterministic business rules.
