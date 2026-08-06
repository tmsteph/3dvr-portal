# Companion distribution boundaries

## Android

3DVR Companion has two distinct product modes in mind:

### Store mode

Designed for Google Play distribution.

- Prefer narrow Android APIs, intents, app integrations, and user-triggered actions.
- Accessibility-based automation must stay narrow, clearly disclosed, consented, and deterministic.
- An AI model must not autonomously plan and execute arbitrary Accessibility actions on the user's behalf.
- Accessibility is not presented as a disability accessibility tool unless that genuinely becomes the product's primary purpose.

### Power mode

A private/sideloaded build for the device owner.

- May expose additional local device capabilities after explicit OS permission.
- Still uses the same green/yellow/red approval protocol.
- Still rejects arbitrary remote code, arbitrary selectors, and unbounded gesture scripts.
- The user can disable Accessibility, notification access, Companion, or the bridge independently.

The v0.1 Android Accessibility skeleton is an experimental Power Mode component. Gesture dispatch is disabled.

## iOS / iPadOS

The store and private capability surface is fundamentally narrower than Android. Companion should use Apple-supported integrations such as App Intents, Shortcuts, Siri/Apple Intelligence surfaces, deep links, share extensions, and app-owned APIs.

Unsupported Android capabilities return an explicit unsupported result rather than claiming equivalent iOS control.

## Desktop

Future macOS, Windows, and Linux adapters should follow the same capability contract. Platform-native permissions and sandboxing stay authoritative.

## Product rule

The cross-platform abstraction is the user's intent, not a promise that every operating system exposes the same mechanism.

For example, `navigation.open_destination` might be fulfilled by an Android intent, an iOS App Intent/deep link, or a desktop URL handler. The Life Ops layer asks for the intent and Companion reports whether the local platform supports it.
