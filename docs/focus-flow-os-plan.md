# Focus Flow OS Plan

Status: planning seed  
Last updated: 2026-06-03  
Working rule: Sell first. Build second. Keep it simple.

## Core Idea

Focus Flow OS is a cross-device portal layer for moving from regulation into real work without losing momentum.

The sequence:

```txt
Body -> Breath -> Attention -> Intention -> Work Gate -> External Action -> Return -> Reflection
```

The problem this solves is not a lack of ideas. The hard part is the transition after a good portal, Codex, or
ChatGPT session: leaving the regulated, inspired state to send messages, post on Facebook, log in to another platform,
create an account, answer email, or complete the actual customer-facing work.

Focus Flow OS should act like a small operating layer for attention. It starts with body and breath, narrows the next
action, opens the outside system, keeps the mission recoverable, then helps the user return and log what happened.

## Subdomain Direction

Start inside the portal first:

```txt
https://portal.3dvr.tech/focus-flow/
```

After the MVP is useful, add a subdomain alias:

```txt
https://focus.3dvr.tech/
```

Recommended subdomain: `focus.3dvr.tech`.

Why:

- Practical enough for productivity and customer work.
- Broad enough to include breath, posture, meditation, tasks, sales, and research.
- Easier to explain than a more mystical name when the goal is getting real work done.

Alternate names:

- `flow.3dvr.tech`: better for an immersive, game-like experience.
- `dojo.3dvr.tech`: good if the experience becomes a training space.
- `align.3dvr.tech`: good if the wellness and consciousness framing stays primary.
- `work.3dvr.tech`: most direct, but less distinctive.

## Existing Portal Foundations

Focus Flow OS should reuse and connect the recent portal sections instead of replacing them.

- Body Mode: sensory-friendly entry point for posture, breath, reflection, and action.
- Seated Spine Reset: first concrete body reset for neck, shoulders, spine, hips, and breath.
- Inner Alignment: Three.js practice runner for body, breath, attention, imagination, insight, and action.
- Intention Lab: state check, intention card, grounding timer, action bridge, GunJS sync, and export.
- Portal Lab: mystical but grounded research tone, local practice gates, journaling, and reality checks.
- Attention Visualized: education and visual attention language.
- Meditation: longer breathing and grounding work.
- Tasks, Notes, Contacts, CRM, Money AI, Sales: likely sources for real work targets.

## Product Shape

This should feel like a cross between:

- a game level select screen,
- a meditation room,
- a mission control cockpit,
- a productivity launcher,
- a lightweight personal operating system.

The app should not become a generic to-do list. It should be a transition system that preserves state while moving the
user from inner alignment to external action.

## Primary User Flow

1. Open Focus Flow on any machine.
2. Choose a short entry sequence: breathe, stretch, meditate, or jump straight to work.
3. Check state quickly: calm, focus, energy, resistance.
4. Pick one mission from Tasks, CRM, Notes, Money AI, or a manual entry.
5. Convert the mission into one outside action.
6. Open the external target in a new tab or split-screen friendly flow.
7. Keep a small mission card recoverable in the portal tab.
8. Return and mark the action completed, blocked, or too large.
9. If blocked, generate a smaller next action.
10. Save the session to GunJS so it can resume on another device.

## Modes

### 1. Regulate Mode

Purpose: calm the nervous system enough to start.

Inputs:

- 30, 60, or 180 second breathing.
- Seated spine reset.
- Eye and jaw release.
- Reduce Motion setting.
- Low-glare Three.js focus object.

Sources to reuse:

- Body Mode.
- Seated Spine Reset.
- Inner Alignment.
- Meditation.

### 2. Focus Mode

Purpose: choose the work target and reduce ambiguity.

Inputs:

- What am I trying to move forward?
- What platform or person is involved?
- What is the smallest visible action?
- What friction is stopping me?

Outputs:

- One mission title.
- One external URL.
- One message, account, post, task, or delivery step.
- One fallback smaller step.

### 3. Work Gate

Purpose: launch the real-world action without dropping the state.

Examples:

- Send one email.
- Reply to one Facebook message.
- Log in to one tool.
- Create one account.
- Post one update.
- Check one invoice or billing issue.
- Add one CRM note.
- Ask one customer a clear question.

The app should make the next step feel like entering a level, not leaving the portal.

### 4. Split-Flow Mode

Purpose: support leaving the portal while keeping the mission alive.

MVP behavior:

- Open external target in a new tab.
- Keep Focus Flow open as the mission home.
- Copy the mission prompt to clipboard.
- Show a return checklist.
- Save progress immediately before opening the external site.

Laptop and desktop behavior:

- Layout works in a narrow split-screen column.
- Mission card stays readable at 320-420 px wide.
- Keyboard shortcuts support done, blocked, smaller step, and timer controls.

Future behavior:

- Optional pop-out mission window.
- Optional browser side panel or extension.
- Optional notifications for return prompts.
- Optional launcher links for Gmail, Facebook, Stripe, GitHub, Vercel, and CRM.

No browser extension should be required for the first version.

### 5. Return Mode

Purpose: capture what happened quickly.

Buttons:

- Done.
- Planned.
- Blocked.
- Too big.
- Need smaller step.

Prompts:

- What changed?
- What did I complete?
- What blocked me?
- What is the next visible step?

### 6. Recovery Mode

Purpose: prevent shame spirals or abandoned sessions.

If the user returns blocked or avoids the external action, the app should reduce scope:

- Send one sentence instead of a full email.
- Open the platform and stop there.
- Find the login page only.
- Draft, but do not send.
- Ask ChatGPT or Codex for the smallest next message.
- Move the task to a better time with a concrete reason.

## Three.js Experience

The visual layer should be useful, not decorative.

Initial scene:

- A calm dark chamber.
- A breathing orb.
- A vertical spine line.
- A distant portal gate.
- A mission beacon that becomes brighter as the action becomes clearer.
- Minimal motion by default.
- Respect `prefers-reduced-motion`.

Interaction ideas:

- Breath expands the orb.
- Choosing a mission lights the gate.
- Starting the external action opens the gate.
- Returning marks the gate as complete, blocked, or still open.
- Repeated sessions build a simple path or constellation of completed actions.

VR headset direction:

- WebXR mode can become a quiet focus chamber.
- Large targets.
- No fast movement.
- Hands-free or gaze-friendly controls where practical.
- A short session should still work without controllers.

## Device Strategy

### Phone

- PWA install.
- One-thumb controls.
- Quick start to breath, stretch, or one action.
- Works as a companion while the real work happens on laptop.

### Laptop

- Best first target.
- Split-screen mission panel.
- Fast links to external platforms.
- Keyboard shortcuts.

### Desktop

- Wide mission cockpit.
- Cross-app dashboard.
- Three.js scene can be richer without becoming distracting.

### VR Headset

- Future mode.
- Start with WebXR-compatible rendering only after the normal app is useful.
- The goal is calm focus, not novelty.

## GunJS Data Model

GunJS should be the source of truth for anything that should follow the user between machines.

Primary node:

```txt
gun.get('3dvr-portal').get('focus-flow')
```

Suggested paths:

```txt
3dvr-portal/focus-flow/sessions/{sessionId}
3dvr-portal/focus-flow/missions/{missionId}
3dvr-portal/focus-flow/actions/{actionId}
3dvr-portal/focus-flow/authors/{authorId}/sessions/{sessionId}
3dvr-portal/focus-flow/authors/{authorId}/missions/{missionId}
```

Use `window.ScoreSystem.ensureGun` and `window.ScoreSystem.ensureGuestIdentity` when available.

Session shape:

```js
{
  id: "flow_...",
  app: "focus-flow",
  version: 1,
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
  author: {
    id: "guest_or_pub",
    pub: "optional",
    alias: "optional",
    isGuest: true
  },
  state: {
    calm: 3,
    focus: 3,
    energy: 3,
    resistance: 3
  },
  practice: {
    mode: "breath",
    seconds: 60,
    completed: true
  },
  missionId: "mission_...",
  externalActionId: "action_...",
  status: "active"
}
```

Mission shape:

```js
{
  id: "mission_...",
  title: "Send one follow-up email",
  sourceApp: "manual",
  sourceId: "",
  platform: "email",
  externalUrl: "https://mail.google.com/",
  nextStep: "Send a three-sentence follow-up to the client.",
  smallerStep: "Open Gmail and find the thread.",
  reason: "Move one customer conversation forward.",
  status: "ready"
}
```

Action attempt shape:

```js
{
  id: "action_...",
  missionId: "mission_...",
  openedAt: "2026-06-03T00:00:00.000Z",
  returnedAt: "2026-06-03T00:05:00.000Z",
  status: "completed",
  blocker: "",
  notes: "Sent the message and added the next follow-up.",
  artifactUrl: "",
  privateNotes: ""
}
```

## Privacy And Safety

- Do not store passwords.
- Do not scrape external platforms.
- Do not automate third-party sites in v1.
- Do not save sensitive message contents unless the user explicitly writes them into notes.
- Default to saving mission metadata, not private communication bodies.
- Make external links transparent before opening them.
- Add export/delete controls for sessions.
- No third-party analytics.

## Cross-App Data Pulls

Phase one can support manual missions only.

Phase two should optionally pull from:

- Tasks: open tasks and next actions.
- CRM/Contacts: people to follow up with.
- Notes: captured ideas that need action.
- Intention Lab: latest intention and action bridge.
- Inner Alignment: recent practice completions.
- Money AI/Sales: ranked revenue actions.
- Calendar: upcoming commitments.

Each imported item should become a Focus Flow mission without mutating the source app until the user acts.

## MVP

Route:

```txt
/focus-flow/
```

Subdomain later:

```txt
focus.3dvr.tech
```

MVP features:

- Static app shell with calm dark Three.js scene.
- Reduce Motion toggle.
- Breath/body preflight timer.
- Manual mission card.
- External action launcher.
- Return capture.
- Done/blocked/smaller-step flow.
- GunJS session save with local fallback only for temporary drafts.
- Links to Body Mode, Inner Alignment, Intention Lab, Tasks, CRM, Notes, and Money AI.
- PWA manifest.

MVP acceptance criteria:

- User can start on phone, laptop, or desktop.
- User can create one mission in under 60 seconds.
- User can launch an external platform without losing the session.
- User can return and mark the result in under 15 seconds.
- The session syncs through GunJS when available.
- The app remains usable in a 360 px wide split-screen panel.
- No medical, supernatural, or guaranteed productivity claims.

## Build Phases

### Phase 0: Planning

- Keep this document in the repo.
- Decide canonical route and subdomain.
- Choose final product name.

### Phase 1: Local Prototype

- Create `/focus-flow/`.
- Build static UI.
- Add Three.js focus chamber.
- Store draft state locally.
- Add portal dock card.

### Phase 2: GunJS Sync

- Save sessions, missions, and action attempts under `3dvr-portal/focus-flow`.
- Add author indexes.
- Resume active session across browsers.

### Phase 3: External Action Bridge

- Add platform presets for email, Facebook, GitHub, Stripe, Vercel, CRM, and custom URLs.
- Add copy-to-clipboard mission prompt.
- Add return flow.
- Add blocked-to-smaller-step helper.

### Phase 4: Cross-App Imports

- Pull open tasks.
- Pull CRM follow-ups.
- Pull Intention Lab next actions.
- Pull Money AI ranked opportunities.
- Pull notes marked as actionable.

### Phase 5: Subdomain And PWA

- Add `focus.3dvr.tech` alias.
- Tune manifest and service-worker behavior.
- Add install prompts.
- Add resume shortcut.

### Phase 6: Immersive Mode

- Add WebXR-compatible mode.
- Use controller, gaze, or simple keyboard inputs.
- Keep it optional.

### Phase 7: Companion Layer

- Consider pop-out window, browser side panel, or extension only if the web app cannot solve the context-switch issue.

## Naming Options

Recommended product name:

```txt
Focus Flow
```

Alternates:

- Work Gate.
- Flow Gate.
- Momentum Chamber.
- Action Gate.
- Focus Dojo.
- The Return Room.

Suggested first-screen line:

```txt
Breathe, choose one mission, leave to do the work, and return without losing the thread.
```

## Product Principle

The app should not try to make every task inspiring. It should protect the transition from insight to action.

The deeper promise:

```txt
Do not just feel aligned. Leave the portal and move one real thing.
```
