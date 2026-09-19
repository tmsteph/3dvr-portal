# 3DVR Human Handoff

Human Handoff is the control-plane escape hatch for agent workflows that reach a human-only step such as CAPTCHA, MFA, OAuth consent, identity confirmation, or a sensitive approval.

## Product contract

The normal state is autonomous. When human input is required, the agent pauses the workflow and creates a short-lived handoff. The user receives a simple phone-first prompt: what needs attention, why, and roughly how long it should take. Opening it resumes the exact persistent browser session at the blocked screen. Completing the step returns control to the agent and revokes interactive access.

State machine: `agent -> needs_human -> human_active -> resolved -> agent` with `expired` and `cancelled` exits.

## Phone-first UX

Do not expose VNC, Linux desktops, ports, or infrastructure vocabulary. The primary surface is a large Continue button, task/service identity, short reason, and expiry. The remote viewport should fit the phone automatically, support portrait/landscape, native touch, pinch zoom, and the mobile keyboard only when needed. A persistent Done — return to agent action ends control. Reconnecting after app backgrounding must preserve the handoff.

### Guided handoffs

The default interaction should be a short guided checklist rather than asking the user to hunt through a full desktop page. The agent may attach ordered guide steps to a handoff. The phone shows only the current instruction (for example: “Read the arbitration agreement” → “Check the acknowledgement if you agree” → “Confirm certification” → “Submit”). When a step includes target text, the gateway scrolls the exact remote page element into the center of the viewport before the user acts. Back/Next changes the active instruction; the underlying browser remains the same persistent tab.

Guide steps are task metadata only. They must never contain passwords, MFA codes, CAPTCHA answers, cookies, or other secrets.

### Zoom and edge scrolling

Pinch zoom is local to the phone viewport. One-finger dragging pans the enlarged browser image. When local panning reaches the top or bottom limit, continued dragging turns into remote page scrolling so the user can keep moving naturally without first zooming out. This “pan until edge, then scroll” behavior is the standard mobile interaction for handoffs.

### Controlled form state

For React and other stateful application forms, visible DOM values are not sufficient proof that the site accepted a field value. Prefer native browser interactions (real pointer clicks, keyboard entry, and real autocomplete/option selection) over assigning DOM properties directly. After each critical custom field, verify the site-owned state when possible (for example `aria-pressed`, selected autocomplete option, or checkbox state after a real event). After submission, verify both the network-level submit action and the rendered success state. Never assume that an enabled button or visually filled field means the application was accepted.

## Security

Handoff URLs are opaque, single-purpose, short-lived and authenticated. Browser/VNC endpoints remain private. A gateway validates the handoff before proxying a specific session. Tokens are hashed at rest, expire automatically, and are revoked on resolution. Record creation/open/resolution/expiry in the audit log without recording passwords, MFA codes, CAPTCHA answers, or page contents. Prefer an authenticated 3DVR account plus a one-time capability token. Rate-limit attempts and never expose raw VNC directly to the public Internet.

## Runtime architecture

The browser remains on the user's agent server. A display/VNC bridge exposes only that session to a web client (noVNC is suitable for the first implementation; Guacamole is an option for a broader remote-access layer). The 3DVR control plane owns handoff lifecycle and authorization. The portal is the universal client, so Android, iPhone, tablets and desktops need only a modern browser.

Initial Upwork acceptance test: agent reaches Cloudflare -> creates handoff -> Thomas opens it on phone -> completes human verification -> taps Done -> handoff revokes -> agent continues in the same Upwork browser session.
