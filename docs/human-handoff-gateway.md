# Human Handoff Gateway contract

The Portal handoff page is only the client. The live gateway runs beside the persistent browser on the user's agent server and never exposes raw VNC to the Internet.

## API

- `POST /handoffs` — agent creates a handoff for a specific browser session. Returns an opaque one-time URL and expiry.
- `POST /handoffs/:id/open` — exchanges the capability for a short-lived websocket credential after account authentication.
- `WS /handoffs/:id/session` — authenticated proxy to that handoff's private display only.
- `POST /handoffs/:id/resolve` — revokes interactive access and signals the paused agent to resume.
- `POST /handoffs/:id/cancel` — revokes without resuming the protected action.

## Runtime rules

Tokens are generated with a CSPRNG, only hashes are stored, default lifetime is five minutes, and opening a handoff rotates the capability. Resolution/expiry closes websocket clients. The gateway binds its VNC-side connection to localhost/private overlay only. Never log tokens, page contents, passwords, MFA codes, CAPTCHA responses, cookies, or browser storage.

The browser automation and human viewer MUST address the same persistent browser/display. A handoff cannot launch a replacement browser because that would lose the challenged session.

## Phone UX

The Portal owns orientation, reconnect, keyboard and Done controls. The remote display is fit-to-screen by default with pinch zoom available. Backgrounding the phone may reconnect with the same short-lived websocket credential until expiry.

## First acceptance test

1. Persistent Upwork browser reaches Cloudflare human verification.
2. Agent creates an Upwork handoff.
3. Thomas opens the handoff URL on a phone.
4. The exact challenged viewport is visible and touch-enabled.
5. Thomas completes verification and taps Done.
6. Gateway revokes viewer access.
7. Agent resumes in the same authenticated browser session and snapshots the Upwork page.
