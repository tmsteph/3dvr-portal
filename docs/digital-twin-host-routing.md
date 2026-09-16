# Digital Twin Host Routing

Canonical rule: **OVH is the primary 3DVR digital-twin/control server.**

## Default execution order

1. Run digital-twin services, browser automation, persistent sessions, queues, secrets-broker access, orchestration, and long-lived state on OVH.
2. Use DigitalOcean and Hetzner as workers, redundancy, or recovery paths when OVH delegates work or needs help.
3. Use Thomas's laptop only when a task genuinely depends on laptop-local state, hardware, or a browser session that cannot yet be moved to OVH.
4. Never choose the laptop merely because its connector happens to be online or easier to reach.

## Browser/session rule

Authenticated web workflows should live on OVH whenever technically possible. The persistent server-side browser/session broker is the preferred identity surface. Laptop browser control is an exception and should be called out explicitly in the audit trail.

When a required session exists only on the laptop, first ask: can the session be established or migrated on OVH? If yes, fix OVH instead of normalizing laptop dependence.

## Failure behavior

If OVH's direct connector is unavailable, use the server mesh (for example Hetzner -> SSH -> OVH) before falling back to Thomas's laptop. A broken OVH access path is an infrastructure issue to repair, not a reason to silently move the digital twin onto the laptop.

## Portability

The architecture must remain portable enough to bootstrap onto another server or ordinary laptop if OVH disappears, but portability is disaster recovery, not the normal runtime placement.

Last clarified by Thomas: 2026-09-16.
