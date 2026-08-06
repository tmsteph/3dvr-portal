# 3DVR Companion

3DVR Companion is the device-side execution layer for a permissioned personal assistant.

The design goal is not unrestricted remote control. It is a capability-based system where every device exposes a small set of explicit actions, every action has an approval level, and every execution produces an audit record.

## Architecture

```text
ChatGPT / Life Ops
        |
        v
3DVR Terminal Bridge / future relay
        |
        v
3DVR Companion shared core
        |
        +-- Android adapter (deepest device control)
        +-- iOS adapter (App Intents / Shortcuts / app-owned actions)
        +-- future desktop adapters
```

## Shared capability model

Every action has:

- `capability`: stable machine-readable name
- `risk`: `green`, `yellow`, or `red`
- `requiresForeground`: whether the user must actively be in the app
- `requiresConfirmation`: whether Companion must obtain explicit approval
- `platforms`: where the action is supported
- `audit`: request, result, device, timestamp, and reason

### Green

Safe to automate after the user grants the OS permission.

Examples: battery state, network state, open a URL, open an app, read Companion-owned files, report bridge/server status.

### Yellow

Allowed only under a user-created rule or explicit confirmation.

Examples: interact with another Android app through Accessibility, fill a known form, change a calendar item, dismiss a notification, restart a known service.

### Red

Always requires an explicit user approval near the time of action.

Examples: spending money, deleting important data, changing credentials, sending sensitive messages, accepting contracts, or making commitments.

## Platform strategy

### Android

Android is the first deep-control platform. Native Kotlin services can expose:

- notification events through `NotificationListenerService`
- active-window structure through an explicitly enabled `AccessibilityService`
- taps/swipes through accessibility gesture dispatch
- app and settings launches through intents
- device state through normal Android APIs

The Accessibility service is opt-in and must remain visibly disableable by the user.

### iPhone / iPad

iOS intentionally offers a narrower model. Companion should use:

- App Intents
- Shortcuts
- Siri / Apple Intelligence surfaces
- deep links and universal links
- share extensions
- app-owned notifications and data

Companion should not claim arbitrary cross-app UI control on iOS. The product should expose the same high-level intent where possible, with a platform capability report explaining what is actually available.

## Shared implementation

Flutter provides the shared UI, capability registry, approvals screen, audit history, and transport protocol. Native platform adapters are reached through platform channels:

- Android: Kotlin
- iOS: Swift

The shared code never directly decides that a dangerous action is permitted. Platform adapters receive an already-evaluated request plus a local approval token where required.

## v0.1 milestone

1. Shared capability/approval protocol.
2. Companion home screen showing platform and available capabilities.
3. Android platform channel for battery + open URL.
4. Android Accessibility service skeleton with no remote gesture execution enabled yet.
5. Android notification listener skeleton that stores only local normalized metadata.
6. iOS App Intent example for opening the Companion dashboard.
7. Bridge transport schema for future signed device tasks.

## Security rules

- No arbitrary shell command field.
- No arbitrary Accessibility node selector supplied by a remote task in v0.1.
- No passwords, tokens, notification bodies, or UI dumps committed to Git.
- Device permissions are granted locally in the OS.
- Dangerous capabilities default to disabled.
- Every remote action must have an idempotency key and expiration.
- The user can disable the bridge or Companion independently.
- A future relay must authenticate devices independently instead of trusting a GitHub issue author alone.

## Development

This seed intentionally keeps generated Flutter platform boilerplate out of the first commit. On a machine with Flutter installed:

```bash
cd apps/companion
flutter create --org tech.3dvr --platforms=android,ios .
```

Then retain the files in `lib/`, `native-spec/`, and `docs/` from this branch while wiring the generated Android/iOS projects to the adapters described here.
