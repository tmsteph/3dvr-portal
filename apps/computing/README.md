# 3DVR Computing

3DVR Computing is the incubator for an open, agent-native family of computing products. The first shared primitive is deliberately small: a capability contract that lets the same 3DVR Agent request actions from a browser, Debian system, or Android device while preserving user authority and an audit receipt.

`tmsteph/3dvr-portal` is the canonical monorepo for this work. Platform pieces may become independently deployable, installable, or releasable as they mature, but **independent deployment does not imply a separate repository**. Keeping the shared contracts, Agent integration, tests, and product surfaces together makes cross-device changes easier to verify and reduces duplicate implementations.

A separate repository should be the exception: use one when a component must track an upstream project closely, has a genuinely independent contributor/release lifecycle, or is intentionally preserved as a public reference/archive. Otherwise, new computing work belongs here.

## Family

- **3DVR Agent** — intent, planning, policy, approvals, and receipts.
- **3DVR Browser** — Chromium/Brave-derived browser surface with agent tools exposed as explicit capabilities.
- **3DVR Desktop** — Debian-based desktop where system actions are exposed through narrow adapters instead of unrestricted shell access.
- **3DVR Mobile** — Android/AOSP-compatible surface that grows from the existing Companion bridge.
- **3DVR Shell** — one user-facing command surface across the family.

## Contract v0

Every device action is named as a capability such as `browser.open` or `os.notify`.

A policy returns one of three decisions:

- `allow` — execute through the registered adapter.
- `ask` — return `needs_approval` without executing.
- `deny` — return `blocked` without executing.

Every request returns a receipt. This makes automation observable before we add broader OS authority.

## Run it

```sh
npm --prefix apps/computing test
npm --prefix apps/computing run demo
```

From the repository root, `npm run test:all` also includes the Computing test suite.

The demo uses mock adapters so it is safe to run anywhere. Real Debian, Android, and browser adapters can implement the same contract without changing the policy layer.

## First vertical slices

1. Connect the existing Android Companion bridge to this capability contract.
2. Add a Debian adapter for a tiny allowlist: notifications, opening URLs, and launching approved apps.
3. Add a Chromium/Brave development shell exposing navigation, tabs, downloads, and page actions through explicit browser capabilities.
4. Persist approval choices and receipts through the existing Agent/Portal identity and event systems.

The rule is simple: **the agent may become powerful without becoming invisible.**
