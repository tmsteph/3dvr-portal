# I Gave ChatGPT a Body — Without Giving It Root Access

**Building a permissioned bridge from an AI assistant to a real Android phone**

*Thomas Stephens · 3DVR Engineering · August 15, 2026*

AI agents are getting very good at using computers. Phones are next.

There is already excellent work in this space. [AppAgent](https://github.com/TencentQQGYLab/AppAgent) treats an agent like a smartphone user, learning to tap and swipe through apps. [Mobilerun](https://github.com/droidrun/mobilerun), [mobile-mcp](https://github.com/mobile-next/mobile-mcp), [Android-MCP](https://github.com/CursorTouch/Android-MCP), [phone-mcp](https://github.com/hao-cyber/phone-mcp), and [Ghost in the Droid](https://github.com/ghost-in-the-droid/android-agent) expose increasingly capable mobile automation to language models. [Open Interpreter's 01](https://github.com/openinterpreter/01) explores the broader idea of an open assistant that can operate computers and devices.

So the interesting question is not whether an AI can control a phone.

It can.

The question we care about at 3DVR is:

> **How do you give an AI useful agency without quietly giving it unlimited authority?**

That question led us to build **3DVR Companion**.

## The first rule: no arbitrary remote shell

The easiest architecture would have been to hand an agent ADB, Accessibility, or a shell and say: go.

That is powerful. It is also a huge authority boundary.

Instead, Companion exposes a small vocabulary of named capabilities. Examples include:

- `device.status`
- `url.open`
- `app.open_known`
- `notification.metadata.read`

The remote side does not get to invent an Android package name, arbitrary shell command, screen coordinate, or Accessibility selector. It asks for a known capability. The phone decides whether that capability exists and whether the request is allowed.

The model is intentionally closer to a tiny operating-system API than remote desktop software.

## What the path looks like

Our current Android path is roughly:

```text
ChatGPT
   ↓
audited command transport
   ↓
Termux bridge
   ↓
authenticated loopback HTTP
   ↓
3DVR Companion
   ↓
named Android capability
```

Companion binds its local control server to loopback rather than the LAN. Requests require a bearer token generated on the phone. The Android app stores its pairing identity privately so a normal app restart or update does not require creating a new trust relationship.

The external command transport is deliberately auditable. It can request a narrow named action, but sensitive phone data does not need to travel through that transport.

This is slower and less magical than simply handing an agent full ADB access.

That is partly the point.

## The moment it became real

On August 15, 2026, after a fairly ordinary collection of Android problems — background-process restrictions, app signing, persistent pairing, and package-launch behavior — we sent a command from a ChatGPT conversation to a Samsung Android phone.

The request moved through the bridge, reached Companion's authenticated local API, and invoked the allowlisted Android Settings capability.

**The Settings app opened.**

Nobody touched the phone to make it happen.

It was a tiny action, but it proved the architecture end to end.

The more important detail was what *didn't* happen: the AI did not receive root access, an arbitrary shell, or permission to click anything it wanted.

## Why app automation alone is not enough

A lot of mobile-agent research focuses on a difficult and useful problem: make an agent understand a screen and behave like a person.

That is important for applications that expose no machine-readable interface.

But if the goal is a long-lived personal assistant, reproducing human taps for every action is not always the best primitive.

Humans use screens because screens are the interface available to humans.

Agents can have a different interface.

For common actions, we would rather expose:

```text
open_known_app("calendar")
```

than:

```text
find the calendar icon
estimate its coordinates
tap it
wait
inspect the screenshot
hope the launcher did not move
```

We still expect bounded UI automation to matter. We just do not want it to become the universal security model.

## Sales Mode made the permission problem obvious

The first practical application we want is helping operate 3DVR from a phone.

Sales is a useful stress test because the difference between *assist* and *act* matters immediately.

We split a sales interaction into separate capabilities:

1. **triage** — recognize that an inbound event probably belongs to a lead
2. **draft** — prepare a possible response
3. **open** — navigate to the known conversation
4. **prepare** — place the draft into the right surface
5. **send** — actually transmit the message
6. **log** — record the outcome for CRM/audit history

Those are not treated as equivalent actions.

Our early policy allows useful preparation while keeping outbound send as a higher-risk capability. It also includes suppression, expiry, empty-message rejection, and a default per-contact outreach limit.

The design rule is simple:

> **Authority should increase one capability at a time, not all at once.**

## Where other projects are stronger

We should be clear about this too.

Projects such as Mobilerun, Ghost in the Droid, mobile-mcp, phone-mcp, and Android-MCP are already much more capable at generic UI interaction than Companion. They can inspect screens, tap, type, swipe, execute multi-step workflows, and in some cases support both Android and iOS.

AppAgent also has a much deeper research story around an agent learning how to operate unfamiliar apps.

Open Interpreter has a much larger community and a broader vision for natural-language computer control.

We do not need to rebuild all of that.

The opportunity for 3DVR is to make **permissioned device agency** a composable layer that can use the best existing automation underneath it.

## A possible convergence: MCP underneath, capability policy above

The Model Context Protocol ecosystem is becoming a common way to expose tools to agents. Several mobile-control projects already speak MCP.

That suggests a better long-term architecture than treating every part of Companion as proprietary plumbing:

```text
AI / agent
     ↓
3DVR policy + approvals + audit
     ↓
capability registry
     ↓
MCP / native adapter / platform API
     ↓
phone
```

In that model, 3DVR does not need to win the race to build the best generic Android tapping engine.

We can integrate one.

What we keep owning is the layer that answers:

- Who requested this action?
- What capability was requested?
- What data may leave the device?
- Does this action need approval?
- How long is that approval valid?
- Is this contact suppressed?
- Has this action already happened?
- What should be written to the audit log?
- How does the user revoke the authority later?

That layer becomes more valuable as underlying agents become more powerful.

## Why this fits 3DVR

3DVR's broader goal is not to make another closed assistant.

We want open infrastructure that ordinary people can understand, modify, host, connect, and revoke.

That means the phone should not be treated as a mysterious peripheral the model secretly controls.

It should be a node with explicit capabilities.

The same model can eventually apply to laptops, servers, home automation, shop equipment, show-control systems, and small open hardware.

Each device can say:

> Here is what I can do. Here is what you are allowed to ask me to do. Here is what requires a human decision.

That is a much more interesting foundation than unrestricted remote control.

## What comes next

Our next Android work is deliberately practical:

- reliable background recovery
- better allowlisted app and intent resolution
- inbound notification triage without exporting unnecessary message content
- SMS and email **prepare** actions that do not send
- a local approval surface with short-lived tokens for consequential actions
- CRM/audit integration
- exploration of MCP-compatible adapters so we can reuse rather than duplicate the growing mobile-agent ecosystem

We also intend to talk to the people already building this space.

If another open project has already solved a lower layer well, our default should be to contribute, integrate, or collaborate rather than rebuild it for branding reasons.

## The thesis

The exciting future is not an AI with unlimited access to your devices.

It is an AI that can become dramatically more useful because its authority is **legible, bounded, revocable, and composable**.

The goal is not:

> AI can tap anything.

The goal is:

> **AI can do useful work while having exactly the authority you intended to give it.**

That is the direction we are exploring with 3DVR Companion.

---

### Related 3DVR work

- [Initial Companion cross-platform device agent](https://github.com/tmsteph/3dvr-portal/pull/1351)
- [Authenticated loopback phone bridge](https://github.com/tmsteph/3dvr-portal/pull/1352)
- [Android background keep-alive work](https://github.com/tmsteph/3dvr-portal/pull/1356)
- [Allowlisted app launch and notification metadata](https://github.com/tmsteph/3dvr-portal/pull/1358)

3DVR Research publishes working architecture openly. This is a field report, not a claim that the system is finished or uniquely invented.