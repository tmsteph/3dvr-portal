# Human-visible outcome verification

## Why this exists

A 3DVR action is not complete merely because an API, SMTP server, payment processor, browser automation step, or other transport returns success.

The system must verify the result that the person actually experiences.

This rule was formalized after the Campaigns Gmail incident on 2026-09-21:

- Google OAuth authenticated `tmsteph1290@gmail.com`.
- Gmail API was disabled in the Google Cloud project.
- Campaigns successfully fell back to SMTP.
- SMTP was configured for `3dvr.tech@gmail.com`, so that account—not the connected Gmail account—was the actual sender and owner of the Sent-folder copy.
- The UI reported the connected account without clearly distinguishing it from the actual transport/sender.
- Message-body personalization worked, but subject personalization was omitted, allowing a literal `{{name}}` token to be sent.
- Early testing checked HTTP/transport success but did not initially verify the human-visible mailbox result.

## Core rule

**Do not treat a successful transport response as proof that the user's intended action completed correctly.**

For consequential actions, verify the human-visible outcome whenever practical.

## Identity must remain explicit

Never collapse these into one concept:

1. **Authenticated identity** — who proved they are allowed to act.
2. **Connected account** — the account selected in the UI.
3. **Transport/provider** — the mechanism that performed the action.
4. **Effective actor/sender** — the account the outside world sees.
5. **Result location** — where the resulting record is stored.

For email, this means OAuth account, Gmail API/SMTP transport, From mailbox, and Sent-folder mailbox must remain separately observable.

## Verification checklist

Before reporting a consequential action as complete:

- Verify the exact production code/deployment handling the request.
- Verify the effective actor/sender, not just the authenticated identity.
- Verify recipient/destination.
- Verify rendered content after templating/personalization.
- Verify the result exists where the user expects it to exist.
- Surface fallback behavior explicitly.
- Record enough metadata to audit what happened.
- Prefer an end-to-end production smoke test over only unit tests when safe.

## Campaigns-specific rules

- Prefer the connected Gmail account through Gmail API.
- SMTP is a fallback, not a silent replacement for sender identity.
- When SMTP fallback is used, return and display:
  - `transport`
  - `senderEmail`
  - `connectedEmail`
  - `sentFolderAccount`
- Personalize both subject and body before sending.
- Campaign history must record the effective sender.
- Confirmation text must say "using Gmail connection" unless the actual sender is already known.
- Completion text must identify the real sender whenever fallback occurred.

## Testing principle

A test named "send succeeds" is insufficient if it only asserts HTTP 200.

For user-visible operations, tests should cover the full semantic contract. For email, assert at least:

- API is preferred when available.
- Fallback is used only when needed.
- Fallback reports its real sender.
- Personalization is applied to subject and body.
- Sent-folder expectations match the effective sender.

## Generalization

Apply this principle to other 3DVR systems:

- Calendar: confirm the event exists on the intended calendar.
- Payments: confirm the intended customer/account/amount and processor record.
- Job applications: confirm the application is attached to the intended profile and employer.
- Messaging: confirm the actual sending account/channel and resulting conversation.
- File writes: confirm the intended file/version/location changed.
- Deployments: confirm the intended production alias points to the tested commit.

**Success means the human-visible outcome is correct, not merely that the underlying request returned success.**
