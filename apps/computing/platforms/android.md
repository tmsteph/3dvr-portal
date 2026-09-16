# 3DVR Mobile — Android/AOSP track

The existing **3DVR Companion** is the preferred Android connector and bridgehead. It should become the Android adapter for the same capability names used by Debian, the browser, Portal/Operator, and the Digital Twin.

The intended access chain is:

```text
AI / Portal / Digital Twin
        -> 3DVR relay / control plane
        -> 3DVR Companion
        -> explicit Android capabilities
```

Prefer Android platform APIs and explicit app integrations over simulated taps. Accessibility automation should be a fallback for capabilities that apps do not expose directly.

Companion and Termux have different jobs:

- **Companion** — normal Android app/device capabilities, permissions, notifications, Assistant integration, approved cross-app actions, and device-side execution.
- **Termux** — Linux shell, repositories, processes, SSH/device mesh, development tooling, and recovery/debugging.

For normal Android workflows, check Companion first. Use Termux when the workflow genuinely needs Linux-side execution or recovery.

The long-term product can graduate from Companion app -> launcher/system integration -> AOSP-derived image while keeping the capability and permission contract stable.

Canonical cross-device/access documentation lives in [`docs/agent-access-map.md`](../../../docs/agent-access-map.md) and [`docs/access-continuity.md`](../../../docs/access-continuity.md).
