# Clipboard, Notes, and CRM Sync Handoff

Date: 2026-05-11

## What shipped

- Added the private Clipboard app at `/clipboard/` for signed-in users.
- Added the Clipboard launch card to the portal home page.
- Added redirect support to `sign-in.html` so protected app links can return users to their requested tool.
- Added Clipboard coverage in `tests/clipboard-page.test.js`.
- Fixed production sync relay selection for shared Gun usage:
  - `gun-init.js`
  - `contacts/gun-init.js`
  - `calendar/gun-init.js`
  - `crm/app.js`
  - `notes/index.html`
  - `clipboard/app.js`
  - `sign-in.html`
- Removed fallback usage of the dead relay `wss://relay.3dvr.tech/gun`.
- Standardized active sync on `wss://gun-relay-3dvr.fly.dev/gun`.
- Added `tests/gun-peer-config.test.js` to prevent Notes, CRM, and Clipboard from falling back to the dead relay again.

Production commits pushed to `main`:

- `0af29eb Add private device clipboard`
- `5a9b53a Fix portal Gun sync relay selection`

## Verification run

Focused local tests passed:

- `npm test -- tests/clipboard-page.test.js tests/gun-peer-config.test.js`
- `npm test -- tests/gun-peer-config.test.js tests/crm-editing.test.js tests/crm-contacts-workflow.test.js tests/crm-contacts-import.e2e.test.js tests/sales-crm-handoff.test.js tests/meeting-notes-video-pack.test.js`
- `npm test -- tests/crm-email-operator.test.js tests/crm-sales-cockpit.test.js tests/crm-touch-log-real.test.js tests/sales-outreach-crm.test.js`
- `node --check clipboard/app.js`
- `node --check crm/app.js`
- `npm run playwright:smoke:linux`

Production browser sync probes against `https://portal.3dvr.tech` passed on 2026-05-11:

- Notes used `wss://gun-relay-3dvr.fly.dev/gun`.
- CRM used `wss://gun-relay-3dvr.fly.dev/gun`.
- Notes live cross-context sync passed.
- Notes late-reader replay passed.
- CRM live cross-context sync passed.
- CRM late-reader replay passed.

## Known gaps

- Clipboard still needs a real phone-to-laptop production retest in Brave after the relay fix. Earlier local tests showed Clipboard was less reliable than direct Notes/CRM probes because it combines login state, encryption, record discovery, and relay replay.
- The current Clipboard storage still depends on the Gun relay. For a command clipboard, the more durable long-term fix is a server-backed `/api/clipboard` with authenticated user ownership and persistent storage.
- Full `npm test` was not clean before this work because of unrelated existing failures:
  - `tests/playwright-install-runtime.test.js`
  - `tests/vercel-insights-tag.test.js` for unrelated pages

## Recommended next work

1. Retest `/clipboard/` on the actual phone and laptop in Brave while signed in as the same portal user.
2. If Clipboard still misses records, move Clipboard sync to a server-backed API instead of Gun relay persistence.
3. Keep Notes and CRM on the Fly relay for now; production probes passed, but a durable backend should be considered if these become business-critical.
