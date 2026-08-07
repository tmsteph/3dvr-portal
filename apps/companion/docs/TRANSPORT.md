# Companion task transport v1

The Companion transport is intentionally separate from the current GitHub Issue queue. The Issue bridge can carry these envelopes during development, but the long-term relay should use authenticated device channels.

## Request envelope

```json
{
  "version": 1,
  "id": "01J...",
  "device": "phone",
  "capability": "device.status",
  "createdAt": "2026-08-06T23:00:00Z",
  "expiresAt": "2026-08-06T23:02:00Z",
  "reason": "Build the Life Ops morning brief",
  "arguments": {},
  "approval": null
}
```

Rules:

- `id` is globally unique and is the idempotency key.
- `device` is a locally enrolled device identifier.
- `capability` must match the local registry exactly.
- expired requests are rejected before execution.
- unknown fields may be logged but must not grant capabilities.
- remote input never contains arbitrary shell, Accessibility selectors, JavaScript, Swift, Kotlin, or executable code.

## Approval envelope

Yellow/red actions require a local approval record.

```json
{
  "requestId": "01J...",
  "capability": "ui.perform_known_action",
  "approvedAt": "2026-08-06T23:00:30Z",
  "expiresAt": "2026-08-06T23:01:30Z",
  "scope": {
    "knownAction": "open_navigation_to_calendar_event"
  }
}
```

An approval token must be bound to the request/capability/scope and expire quickly. A generic permanent "yes to everything" token is not supported.

## Result envelope

```json
{
  "version": 1,
  "id": "01J...",
  "ok": true,
  "finishedAt": "2026-08-06T23:00:42Z",
  "output": {
    "batteryPercent": 71
  }
}
```

Results should be small, structured, and redacted before leaving the device.

## Android Accessibility boundary

Remote tasks may request only locally implemented named actions, for example:

```text
ui.perform_known_action / open_navigation_to_calendar_event
```

They may not submit arbitrary coordinates, text selectors, XPath-like expressions, package-specific scripts, or gesture sequences. The local implementation owns those details and can require foreground confirmation.

## iOS boundary

A capability is supported only if Companion itself can implement it through an Apple-supported surface such as App Intents, Shortcuts, deep links, app extensions, or app-owned APIs. Unsupported cross-app Android capabilities must return `unsupported_on_platform`, not silently degrade into brittle UI automation claims.

## Audit record

Every accepted request creates a local record containing:

- request id
- capability
- risk level
- requester/transport identity
- reason
- approval reference when applicable
- start/end time
- result status
- redacted output summary

Audit retention and export are user-controlled.
