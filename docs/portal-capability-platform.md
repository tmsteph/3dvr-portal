# Portal Capability Platform

Status: north-star product architecture, September 17, 2026.

## Thesis

3DVR Portal should behave less like a traditional website and more like a personal operating environment built from small, composable capabilities.

A useful shorthand is:

> **Portal = identity + data + capabilities + automation + agents + devices**

The user should be able to open the Portal from nearly any internet-connected device and immediately use the system. The underlying implementation may involve browser-local code, cloud services, connected accounts, remote machines, or agents, but the user should not have to think in those terms for ordinary work.

## Inspiration

Footrue is a useful UX reference because it presents many small utilities as immediate tools instead of forcing users through a large application workflow.

3DVR should adopt the useful part of that pattern — fast, obvious, single-purpose tools — and extend it into an open, personal, agent-operable computing environment.

Footrue is an inspiration, not a dependency or architectural foundation.

Reference: https://footrue.com/

## The capability model

A **capability** is the fundamental unit of the Portal.

Examples:

- convert an image
- edit or combine a PDF
- transcribe audio
- search contacts
- send or draft a message
- create a calendar event
- update work availability
- apply for a job
- run a server action
- control a remote browser
- invoke local AI
- generate a website
- create or update a project
- move money/revenue work through an approved workflow

Every capability should be usable through the same underlying contract even when its implementation differs.

Ideally, each capability can be invoked in three ways:

1. **Human-operated** — a simple UI in the Portal.
2. **Workflow-operated** — another Portal capability or automation calls it.
3. **Agent-operated** — Operator or another authorized agent calls it.

This prevents us from building separate systems for “the UI version,” “the automation version,” and “the AI version.”

## UX principle

The Portal should expose **intent**, not implementation.

Bad:

> Go to the IATSE page, log in, find availability, compare it with Lighthouse, and update the dates.

Better:

> **Update Availability**

The Portal can resolve the required systems underneath.

Likewise, users should not need to know whether a tool runs:

- locally in the browser,
- in WebAssembly,
- on an OVH/DO/Hetzner worker,
- through a connected SaaS account,
- on a personal device,
- or through a remote browser session.

Those are execution details.

## Portal as the shell

The Portal is the persistent shell around these capabilities. It owns or coordinates:

- identity
- authorization and scoped permissions
- personal data
- files and knowledge
- contacts
- projects
- messages and communications
- schedules
- capability discovery
- execution history
- automation
- agent access
- device access
- provenance and audit history

The Portal should therefore not become one giant monolithic app. It is the environment in which many small tools feel like one coherent system.

## Capability contract

Over time, capabilities should converge on a shared manifest/contract containing concepts such as:

- stable capability ID
- human-readable name and description
- inputs
- outputs
- permissions required
- execution location
- privacy/locality preference
- whether human confirmation is required
- whether agents may invoke it
- expected cost/resource class
- status/health
- provenance/logging behavior
- optional UI surface

This should connect naturally with the existing 3DVR abilities/access registry.

## Local-first, cloud-available

Prefer the smallest trustworthy execution environment.

A capability that can safely run entirely in the browser should usually do so. This improves privacy, speed, cost, offline support, and portability.

Cloud or remote execution remains appropriate when a capability requires:

- persistent compute
- credentials that should not live in the browser
- browser automation
- external APIs
- heavy workloads
- scheduled execution
- shared state
- reliable always-on operation

The user should experience these as the same system.

## Agent-native without being agent-dependent

AI should make the Portal more powerful, not become a prerequisite for using it.

A person should still be able to click **Update Availability**, **Convert Image**, **Send Invoice**, or **Find Work** directly.

An agent should be able to invoke those exact capabilities under the user's permissions.

This gives 3DVR a durable architecture even as models and AI providers change.

## Device independence

The long-term interface is the Portal itself.

Any authorized device should be able to become a useful terminal into the user's computing environment. A laptop, phone, tablet, thin client, or borrowed computer should not need to contain the user's entire setup locally.

Remote machines and personal devices can register as capability providers.

That makes a browser-inside-the-browser / remote Operator experience a natural extension of the same architecture rather than a separate product.

## Product rule

Before adding another top-level app, ask:

> Is this actually a new product, or is it a capability, workflow, view, or provider inside the Portal?

Default to capability.

Top-level products should exist only when they represent a durable user mental model such as Operator, Guide, Projects, Growth, or Forge.

## Near-term implementation direction

1. Treat the current `/abilities/` registry as the seed of a real capability registry.
2. Define a minimal capability manifest that humans, workflows, and agents can all use.
3. Build a simple searchable **Tools / Capabilities** surface in the Portal.
4. Start by wrapping capabilities we already have rather than inventing new ones.
5. Prefer local/browser execution for lightweight utilities.
6. Route remote/browser/server actions through the existing 3DVR control layer.
7. Record execution history so the digital twin can remember what the system actually did.
8. Gradually collapse multi-site workflows into intent-level actions.

## Example: work booking

Current implementation may involve Lighthouse, IATSE, Encore/UKG, email, messages, calendars, and browser sessions.

The user-facing model should become a small set of capabilities such as:

- **Sync Work Schedule**
- **Update Availability**
- **Review Opportunity**
- **Accept Booking**
- **Request Time Off**
- **Prepare for Job**

Those capabilities can coordinate the underlying systems while preserving explicit approval boundaries.

## North star

**One interface. Many capabilities. Any device. Human or AI operated.**

3DVR Portal is not merely a website containing tools.

It is the user's portable computing environment.
