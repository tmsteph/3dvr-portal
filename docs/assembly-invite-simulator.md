# Assembly Local Invite Simulator

The invite simulator exists to test the human experience of scoped access before real sharing exists.

It is intentionally local-only.

## What it does

An Assembly owner can prepare a draft invitation by choosing:

- recipient principal ID
- authorization profile: Viewer, Editor, or Owner
- expiry window: 1 hour, 24 hours, or 7 days

The simulator binds those values to the current stable workspace ID and a transitional local-owner issuer ID, then renders the exact invitation JSON.

The user may export that JSON as an `.assembly-invite-draft.json` file for inspection or development testing.

## What it does not do

The draft contains no issuer proof. It therefore cannot pass `validateWorkspaceInvite()` and cannot create a grant.

The simulator does not:

- send email or messages
- upload the invite
- create a public URL
- open a socket
- sign the payload
- accept an invitation
- modify access grants
- enable sync

The UI labels the artifact clearly:

> Unsigned draft — this cannot authorize access.

## Why build this first

Sharing systems are easy to make confusing before they are secure. This simulator lets us evaluate whether a person can understand:

1. who is being invited;
2. which workspace they are joining;
3. what they will be allowed to do;
4. when the invitation expires;
5. the difference between organizational roles and authorization profiles.

Only after that flow is understandable should a kernel identity provider supply real signing, delivery, acceptance, and revocation persistence.
