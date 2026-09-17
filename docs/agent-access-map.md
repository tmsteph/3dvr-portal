# 3DVR Agent Access Map

Last reviewed: 2026-09-16

This document is the canonical human-readable map of the ways an AI agent can reach 3DVR systems, Thomas's authorized services, and connected devices. It complements `abilities/abilities.json`, which is the machine-readable capability/status registry.

The goal is simple: **before an agent says it cannot reach something, it should know every existing access path and test the least invasive appropriate one.**

Access can change with provider sessions, plugin state, device power, network reachability, and user permissions. This map records the architecture and known paths; runtime health/authentication must still be verified.

## Operating rule

Use the narrowest durable path that already exists:

1. Native ChatGPT connector/API.
2. Existing 3DVR service or structured control path.
3. Persistent authenticated browser lane.
4. 3DVR Companion on the device.
5. Termux/SSH/device mesh for advanced Linux-side work or recovery.
6. Human checkpoint only when the provider or OS genuinely requires user presence, MFA, CAPTCHA, pairing, consent, or another owner-only action.

Do not ask Thomas to repeat credentials, reconnect a service, or manually redo setup until the documented path has been checked.

## Native connected services

These should be preferred over browser automation when the required action is supported:

- **GitHub** — repositories, code, issues, pull requests, commits, and authorized file updates.
- **Gmail** — mail search/read, threads, attachments, drafts, and supported explicit mail actions.
- **Google Calendar** — schedules, availability, and supported event changes.
- **Google Contacts** — people, addresses, phone numbers, organizations, and identity resolution.
- **Google Drive / Docs / Sheets / Slides** — connected files and office documents.
- **Microsoft Outlook** — connected mail search/read and supported mail workflows.
- **Finances** — linked-account analysis when financial accounts are connected and synced.
- **Stripe** — supported business/payment/product workflows.
- **DigitalOcean** — supported cloud infrastructure operations.
- **Vercel** — projects, deployments, logs, domains, and supported configuration/deployment workflows.
- **Remote Desktop Commander** — authorized remote-computer filesystem/terminal access when the connected machine is online.
- **Web research** — public web search and browsing.
- **ChatGPT automations** — reminders, recurring tasks, and condition watches.
- **Conversation/Library files** — files attached to ChatGPT or stored in the user's ChatGPT file library when surfaced through the file tools.

`abilities/abilities.json` remains the source of truth for current status labels, verification dates, operator rules, health checks, and fallbacks.

## 3DVR server/control access

### Open Runner

The open-source **3DVR Open Runner** is the general-purpose assistant-to-server control path:

```text
ChatGPT/GitHub connector
        -> private command issue
        -> Hetzner Open Runner
        -> local shell and/or SSH mesh
        -> result
```

This is independent of proprietary remote-desktop tooling and is the preferred escape hatch when direct connector actions are insufficient.

### SSH mesh

Known cloud aliases:

- `3dvr-ovh` — portal/control/recovery anchor and persistent browser state.
- `3dvr-hetzner` — agent/worker runtime and Open Runner.
- `3dvr-do` — lightweight emergency fallback.

Roaming devices can join through OVH using `3dvr device mesh` and reverse SSH.

### Structured control

Where available, prefer the 3DVR MCP/control gateway and Portal/Operator surfaces over arbitrary shell work for repeatable actions.

## Persistent authenticated browser access

OVH owns durable browser identity. Reuse these profiles instead of creating fresh sessions:

| Lane | Purpose | CDP |
| --- | --- | ---: |
| `general` | IATSE, Encore SharePoint/Connect, Lighthouse, general authenticated web work | `9222` |
| `encore` | Encore UKG / UltiPro | `9333` |
| `messaging` | WhatsApp Web + Google Messages/SMS | `9444` |
| `training` | Encore University / training | `9555` |

Browser tooling on OVH connects directly to these local CDP ports. The former Docker/network-namespace CDP bridge is retired. State-changing browser automation must still respect the cooperative writer lease documented elsewhere in the repo.

### Messaging host ownership and current state

The durable messaging browser belongs on **OVH**, not the laptop. The laptop may be used as a temporary operator/fallback browser, but future agents should first inspect OVH CDP `9444` and the durable `messaging` profile.

Verified 2026-09-16: OVH CDP `9444` is live with the correct durable profile, but Google Messages is at `/web/welcome` and is not paired there. The `tmsteph` laptop Brave session was separately verified paired at `/web/conversations`. Independently, OVH can reach the Android phone through `3dvr-termux-phone` on reverse port `22106`, and `termux-sms-list` works. Therefore the current server-first messaging order is: OVH messaging lane when paired -> OVH-to-phone Termux SMS read path -> Companion notification/message capabilities as they come online -> laptop Brave only as a fallback/human pairing surface.

A running browser lane is only process health, not proof of provider authentication. Always inspect the target page state before declaring Google Messages usable.

Known workflows using these lanes include:

- IATSE Local 122 member portal
- Encore UKG / UltiPro
- Encore SharePoint / Connect
- Encore Lighthouse
- Encore University/training
- WhatsApp Web
- Google Messages / SMS
- other freelance/staffing/job portals as they are onboarded

## Android: 3DVR Companion

**3DVR Companion is the preferred Android device connector and daily-control path.** It is not merely a demo app.

Architecture:

```text
AI / Portal / Digital Twin
        -> 3DVR relay / control plane
        -> 3DVR Companion
        -> explicit Android capabilities
```

The Companion shared core lives in `apps/companion/`, with native Android implementation under `apps/companion/native-spec/android/`.

Current documented Android foundation includes:

- always-on native localhost recovery bridge;
- authenticated direct relay with Android Keystore-backed credentials;
- workload-identity command routing;
- bounded device-status actions;
- known-app launch;
- HTTPS URL launch;
- notification-listener integration;
- opt-in Accessibility integration for approved cross-app workflows;
- persistent signed releases and self-update verification;
- Android Assistant / VoiceInteractionService foundation;
- capability-based approvals and audit records.

Remote requests must expose named, bounded capabilities rather than arbitrary shell commands or unrestricted UI selectors.

**Companion should be considered before Termux for normal Android interaction.** Termux remains the advanced Linux shell, development environment, SSH endpoint, and recovery/debug path.

Canonical Companion references:

- `apps/companion/README.md`
- `apps/companion/BOOTSTRAP.md`
- `apps/companion/docs/TRANSPORT.md`
- `apps/computing/platforms/android.md`
- `3dvr-desktop/ARCHITECTURE.md`

## Termux / Android Linux-side access

Termux complements Companion rather than replacing it.

Use Termux for:

- Linux shell/process access;
- repository/development tooling;
- SSH and reverse tunnels;
- device-mesh enrollment;
- recovery/debugging when Companion or relay infrastructure needs repair.

The expected `termux-phone` reverse port is currently `22106` unless explicitly changed. See `docs/infrastructure-topology.md` for recovery details.

## Other device surfaces

- **Laptop** — thin client/operator environment; can join the device mesh, while durable services should remain server-first.
- **LicheePi 4A** — RISC-V Debian/upstream test and future edge/output node; network recovery remains unfinished.
- **Future iOS Companion** — narrower App Intents/Shortcuts/deep-link model, preserving the same high-level capability contract where the platform permits it.
- **Future desktop adapters** — should expose the same named capability model rather than inventing an unrelated control system.

## Credentials and authentication

- Prefer existing connected APIs and stored authenticated sessions.
- Credentials belong behind the 3DVR secrets broker / approved Bitwarden path.
- Never print secrets, tokens, cookies, or private keys into chat, logs, issues, or documentation.
- Provider-enforced MFA, CAPTCHA, device pairing, consent, and OS permission prompts are legitimate human checkpoints.
- A dead process or new ChatGPT conversation is **not** evidence that authentication is lost.

## What future agents should do first

For any request involving an external account, server, website, phone, or other device:

1. Check `abilities/abilities.json` for the capability, health rule, and fallback.
2. Check this access map for alternate transport/device paths.
3. Check `docs/access-continuity.md` before requesting reconnection.
4. For server routing, check `docs/infrastructure-topology.md`.
5. For workforce sites, check `docs/workforce-access-runbook.md`.
6. For Android interaction, check 3DVR Companion before assuming only Termux/browser control exists.
7. Verify the path with a harmless read/health check before declaring it unavailable.

## Design principle

3DVR should behave like one portable personal computing system with many interchangeable transports. ChatGPT connectors, APIs, browsers, Companion, Termux, SSH, Open Runner, Portal/Operator, and future local agents are different doors into the same capability graph—not separate islands that must be rediscovered in every conversation.
