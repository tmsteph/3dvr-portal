# Secure Access and Authorization Passthrough

Updated: October 2, 2026. Status: proposed integration contract built on existing 3DVR access documentation. No credentials are included.

## What passthrough means

Carry the user's authorized intent from Operator to the worker and service adapter. Do not forward an unrestricted owner credential to every agent.

The model requests a named action. A trusted executor validates authority, obtains only the necessary credential locally, performs the action, and returns a redacted result.

## Keep four things distinct

| Item | Meaning |
| --- | --- |
| Portal identity | Who is asking |
| Task authorization | Which action that person permits |
| Provider credential | How an adapter authenticates to the external service |
| Provider session | Authentication state that may expire independently |

Being signed into Portal does not automatically grant access to another account. A running browser does not prove that the target service is authenticated. A password does not bypass MFA.

## Proposed execution contract

Every delegated action should carry an owner identity, task ID, target account/service, allowed operation, expiration, and approval reference where required. Enforce scope at each privileged boundary rather than relying on model instructions.

Authorization must be cryptographically authenticated and bound to the actual action. Changing the account, recipient, amount, or operation invalidates the previous approval when those details were part of it.

Record decisions and receipts without storing secret values. The task store keeps credential references, not credentials.

## Existing secrets foundations

The repository already documents a Secrets Broker and an encrypted, expiring handoff flow. Preserve their contracts rather than creating another vault:
- [Secret handoff protocol](/docs/secret-handoff-protocol.md)
- [Bitwarden machine access](/docs/bitwarden-machine-access.md)
- [Control MCP](/docs/3dvr-control-mcp.md)

Bitwarden Password Manager and Bitwarden Secrets Manager are distinct products. A machine token does not unlock the personal vault. A deliberate automation mirror also needs a refresh/rotation procedure.

The handoff protocol describes OpenBao as a possible configured backend and Bitwarden Secrets Manager as a compatibility backend. Determine the actual broker configuration before claiming either is active. The recovery vault remains a separate root-of-trust boundary.

## Credential lifecycle

- Enroll through the existing owner-gated handoff; never request a password pasted into chat.
- Store in the configured backend with a scoped alias and explicit account identity.
- Prefer a named executor action over returning plaintext to a general agent.
- Keep OAuth refresh tokens and browser cookies protected as credentials.
- Refresh only using a provider-supported mechanism and the existing approved scope.
- On rotation, update the matching reference and verify a low-risk operation.
- On revocation, deny further credential use, revoke provider tokens where possible, and invalidate affected sessions. Vault revocation alone may not end an existing cookie session.

## Human handoff

Preserve the task while the user completes MFA, CAPTCHA, account attestation, or required consent. Show one concrete next step, the service involved, and the task waiting for it.

Use a protected handoff surface on the canonical server. Do not include passwords, cookies, or capability-bearing links in public documentation or logs. Resume only after checking the actual target account.

## Account creation and appointments

Account creation should record provider, identity/email, approved terms or required human consent, credential destination, and a confirmation receipt. Generating a password is only one step in creating a usable account.

For bookings, preserve timezone, provider, date, cancellation terms, and the scope of the user's instruction. Verify the provider confirmation before reporting completion. Reconcile ambiguous submissions before retrying to avoid duplicate appointments.

## Isolation and recovery

OVH remains the documented home of persistent browser profiles. Acquire the matching writer lease before changing browser state. Workers should call the canonical adapter rather than copy its credentials or launch replacement authenticated profiles.

Follow the existing configured → reachable → operational → authenticated → writable verification ladder. Recover the failed layer first.

## Acceptance evidence

Prove that an unauthorized worker is denied; an expired authorization cannot execute; another user's credential cannot be selected; secrets stay out of model context and logs; a handoff resumes the same task; and revoked access cannot perform a new operation.

Run these checks with test credentials and a non-production target first.

## Related documents

- [Open package vision](/research/digital-twin-open-package/)
- [Reliability and affordable operation](/research/digital-twin-reliability/)
