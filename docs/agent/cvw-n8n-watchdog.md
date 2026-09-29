# CVW n8n Watchdog

## Goal

Detect workflows that have stopped doing useful work even when n8n itself is up and executions are marked successful.

The pilot is deliberately metadata-only. It must never collect client names, documents, form fields, message bodies, credentials, or execution payloads.

## Baseline

- 29 workflows total
- 18 active workflows
- n8n API reachable through the existing `cvw` control target
- Execution history is treated as a limited observation window, not proof of business correctness

## First watch list

Scheduled:
- CANARY — is n8n actually working
- Missing Docs — Approval & Email
- Hermes - Daily Morning Briefing
- Client Intake — Daily Reminder Emails

Event-driven:
- Document Intake Pipeline
- Cognito Forms — Send Return Link on Submit
- Client Intake — Credit Counseling Detector
- Client Intake — Appointment Booking Tracker
- Hermes - Error Notifications

## Tier 0: metadata watchdog

The control plane checks from outside Tom's n8n workflow logic:

1. API/health reachability.
2. Expected total and active workflow counts.
3. Presence and active state of the critical watch list.
4. Freshness of scheduled workflow executions.
5. Latest execution error state.

This catches deactivation, missing schedules, dead credentials that surface as errors, and broad regressions without reading execution data.

It intentionally does **not** infer that an event-driven workflow is healthy merely because it has successful executions.

## Tier 1: business-stage heartbeats

Critical event-driven workflows should emit tiny metadata-only heartbeats at meaningful boundaries:

```json
{
  "workflow": "stable-workflow-id-or-slug",
  "stage": "entered | progressed | completed",
  "runToken": "random-per-run-id",
  "ts": "ISO-8601 timestamp"
}
```

No case number, client identifier, filename, email address, document contents, form fields, or message text is permitted.

The useful signal is the transition between stages:

- **entered but not progressed**: trigger arrived and the flow likely no-op'd or stalled early.
- **progressed but not completed**: business work began but did not reach its intended outcome.
- **no entered heartbeat**: only meaningful when an independent upstream expectation exists; ordinary event inactivity is not itself an incident.

A heartbeat belongs immediately after a meaningful business checkpoint, not merely after the trigger node.

## Alerting

The observer and alert path should be independent of the n8n instance being monitored. During the pilot, findings should surface through the 3DVR control plane first rather than automatically messaging Tom.

Known pre-existing faults should be labeled as baseline findings until repaired; new state changes should be reported separately as regressions.

## Next production step

Before editing Tom's workflows, agree on the small heartbeat phase and the exact checkpoints for the four client-pipeline flows. Then add the heartbeat receiver and instrument one workflow first, prove it catches an intentional no-op, and expand only after that test passes.
