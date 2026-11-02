# Agent accounts and user forks

Thomas's rule: user accounts can be **forked**. He forks his own user and
gives the fork some or all of his permissions. Each AI agent gets its own
Portal account this way: a fork of Thomas, never more powerful than Thomas,
revocable without touching his account, and attributable (every signed action
carries the fork's own SEA public key).

## What exists today

- `src/agents/fork-contract.js` — the fork record and its rules.
  - Record: `{ format, version, forkId, parentAlias, parentPub, childAlias,
    childPub, permissions, createdAt, revokedAt, note }`.
  - `createForkRecord` rejects any permission the parent does not hold
    (subset enforcement), unknown permission names, and self-forks.
  - `revokeFork` stamps `revokedAt`; revoked forks resolve to no permissions.
  - `resolveForkPermissions(forks, identity)` unions the permissions of a
    child's active forks.
  - Permission vocabulary: the operator set (`suggest`, `edit`,
    `github_write`, `admin`) plus the Assembly workspace capabilities
    (`workspace.read`, `workspace.write`, `workspace.export`,
    `workspace.manage_access`, `workspace.sync`).
- `src/operator/developer-access.js` — operator developer access now checks
  fork records after SEA proof verification. An identity with a fork record
  resolves from the fork (active fork = exactly its recorded operator
  permissions; revoked fork = none). Identities without a fork record follow
  the existing builtin/env bindings, unchanged. Records load from the
  `THREEDVR_FORKS` env JSON (an array of fork records); unset means no forks.
- `src/agents/sea-signer.js` + `scripts/agent-sea-proof.mjs` — an agent
  signs Portal auth proofs headlessly: sign in to Gun as the agent account
  (`AGENT_ALIAS` / `AGENT_PASSWORD` from the environment, sourced from the
  secrets broker at runtime) and emit `{ authPub, authProof }` in the format
  `src/auth/sea.js` verifies.
- `src/agents/chat.js` — the agent-to-agent channel convention: room
  `agents` under the existing `3dvr-chat` Gun root, using the portal chat
  message shape. Chat sender fields are unsigned today, so the room is for
  coordination, not for security-sensitive instructions.

## Pilot: claude@3dvr

1. Create the account from Thomas's admin session (profile.html coworker
   flow) with a generated password, and store that password in the OVH
   secrets broker. Do not put the password in the repo, env files, or chat.
2. Read the account's SEA public key after a first sign-in.
3. Record the fork by adding this record to `THREEDVR_FORKS` in
   `/home/debian/.3dvr/config/portal.env` (fill in `childPub`):

   ```json
   [{
     "format": "3dvr-user-fork",
     "version": 1,
     "forkId": "fork_claude_pilot",
     "parentAlias": "tmsteph@3dvr",
     "parentPub": "Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg",
     "childAlias": "claude@3dvr",
     "childPub": "<claude-sea-pub>",
     "permissions": ["suggest", "workspace.read", "workspace.write"],
     "createdAt": 0,
     "revokedAt": null,
     "note": "Pilot agent fork for Muse"
   }]
   ```

   Pilot permissions are deliberately minimal: `suggest` only in the
   operator, plus read/write in the pilot workspace scope. No `edit`,
   `github_write`, or `admin`.
4. Restart the portal service so the env is picked up, then verify with a
   signed proof from `scripts/agent-sea-proof.mjs`: operator access should
   resolve as contributor with `viaFork: true`.

## Revoking a fork

Set `revokedAt` on the record (or remove it) in `THREEDVR_FORKS` and restart
the portal service. The fork immediately resolves to no permissions. Note:
a Gun account itself cannot be deleted; revocation cuts its granted access,
which is the part that matters.

## Rollback

This feature is additive. Remove `THREEDVR_FORKS` from the portal env and
restart to disable forks entirely; operator bindings behave exactly as
before. The code change itself reverts cleanly with `git revert` of the
merge commit.
