# 3DVR Workforce Access Runbook

Updated: 2026-09-15

This runbook records the working access architecture and recovery procedures for IATSE Local 122, Encore UKG/UltiPro, Encore SharePoint, and Lighthouse. It exists so future agents recover existing access instead of rebuilding it from memory or asking Thomas to sign in again prematurely.

## Current verified state

On 2026-09-15 the following were verified from the canonical OVH browser profiles:

| Service | Verified state | Canonical path |
| --- | --- | --- |
| IATSE Local 122 | Authenticated | `https://member.iatse.io/avail` |
| Encore UKG / UltiPro | Authenticated | `https://n21.ultipro.com/default.aspx` |
| Encore SharePoint / Connect | Authenticated | `https://psav.sharepoint.com/sites/encore-connect` |
| Lighthouse | Authenticated | `https://lighthouse2.psav.com/flowsheets/...` |

These are session states, not guarantees that providers will never expire cookies or require MFA again. Always verify the live page before reporting authentication.

## Prime directive

Access is infrastructure. Preserve it.

- Do not create replacement browser profiles as a recovery shortcut.
- Do not ask Thomas for passwords that already exist behind the secrets broker.
- Do not print credentials, session cookies, broker tokens, Bitwarden values, or MFA artifacts into chat, logs, docs, shell history, or Git.
- Ask Thomas only for provider-enforced human checkpoints such as Microsoft Authenticator number matching, CAPTCHA, device pairing, or legal consent.

## Canonical runtime topology

Persistent authenticated browser state lives only on OVH. Hetzner is the normal agent/worker node and reaches OVH through the SSH mesh.

| Lane | CDP | Host profile | Purpose |
| --- | ---: | --- | --- |
| `general` | `9222` | `/home/debian/.config/google-chrome-for-testing` | IATSE, SharePoint, Lighthouse, general authenticated web work |
| `encore` | `9333` | `/home/debian/.config/3dvr/browser-profiles/encore` | UKG / UltiPro |
| `messaging` | `9444` | `/home/debian/.config/3dvr/browser-profiles/messaging` | Google Messages / WhatsApp |
| `training` | `9555` | `/home/debian/.config/3dvr/browser-profiles/training` | Encore training; inactive when last verified |

The lane launcher is `/usr/local/bin/3dvr-browser-lane-start`. Before changing browser state, acquire the matching writer lease with `/usr/local/bin/3dvr-browser-lease` and release it after the write sequence. Read-only inspection may be concurrent.

A reachable CDP port is only process health. It is not proof that the provider session is authenticated.

## Secrets architecture

The 3DVR Secrets Broker runs on OVH as `3dvr-secrets-broker.service` under the restricted `threedvr-secrets` identity and listens on its local Unix socket. Routine browser logins use the local-only browser-login action; secret values are never returned to the calling shell.

The installed first-class command is:

```text
3dvr-browser-login iatse
3dvr-browser-login ukg
3dvr-browser-login lighthouse
```

The Bitwarden Secrets Manager read path uses the native Bitwarden SDK. Do not grant the broker Docker access merely because `/usr/local/bin/bws` is implemented as a Docker wrapper. Docker membership would unnecessarily widen the broker's privileges.

Routine credential reads for the trusted OVH browser identity are automatic. Recovery/root credentials and other higher-impact secret classes remain separately gated. The systemd unit loads `/etc/3dvr/secrets-broker/bitwarden.env`; organization/project identifiers and machine credentials stay local to OVH and out of Git.

The browser runner may consume a mirrored login record internally, but it must never emit the username/password pair in its response. It should return only site, status, reason, and safe destination URL information.

## IATSE Local 122

Official member portal: `https://member.iatse.io/login`.

Normal path:

1. Use the `general` OVH lane.
2. Run `3dvr-browser-login iatse`.
3. Credentials are resolved from the Bitwarden password-manager mirror inside the broker.
4. The runner fills and submits the login form without returning credentials.
5. Verify the final URL is an authenticated member route such as `/avail` and that the member UI is present.

The old dedicated IATSE aliases previously pointed at stale OpenBao entries and produced backend 404s. The working path is the mirrored Bitwarden login record. Do not restore the obsolete OpenBao mapping merely because the alias names still exist in older configuration history.

A successful verification on 2026-09-15 reached `https://member.iatse.io/avail`.

## Encore UKG / UltiPro

UKG uses the dedicated `encore` lane on CDP `9333`.

Normal path:

1. Run `3dvr-browser-login ukg`.
2. The broker locates the mirrored UKG/UltiPro login record by provider host/name.
3. The runner fills the UKG form and submits it.
4. Verify the real authenticated destination is `https://n21.ultipro.com/default.aspx` and the signed-in UKG navigation is visible.

### UKG timeout/logout behavior

`PostLogout.aspx` is never an authenticated state. Older runner logic incorrectly treated any UKG page other than `Login.aspx` as authenticated, which caused a false positive after session timeout.

The corrected behavior is:

- Treat `PostLogout.aspx` and `PostLogout.aspx?r=sessiontimeout` as expired sessions.
- Navigate back to the real UKG login page.
- Re-run the broker-backed credential login.
- Report success only after reaching the real authenticated home page.

Do not use TouchBase / `ultiprotime.com` as a substitute for UKG. TouchBase is a time-clock surface. Schedule and request-off work belongs in UKG/UltiPro unless Thomas explicitly asks for time-clock work.

## Encore SharePoint / Connect

SharePoint is the reliable Microsoft/Encore session bootstrap for Lighthouse.

Canonical start: `https://psav.sharepoint.com/` or the Connect site.

When Microsoft asks for an account, use the corporate **Login ID** from the secured Encore identity record, not the public/default Encore email address. The account-reactivation notice distinguishes these identities. Do not store the actual Login ID in this public repository; resolve it from the secured identity source when needed.

If Microsoft Authenticator number matching appears, surface the displayed number to Thomas and wait for approval. After approval, choose **Stay signed in: Yes** so the persistent `general` profile retains the Microsoft session.

Verify success by reaching the Connect home site and seeing signed-in SharePoint navigation, not merely by observing Microsoft cookies.

## Lighthouse

The reliable Lighthouse path is **SharePoint first, then Lighthouse in the same `general` browser profile**.

Procedure:

1. Establish or verify the Encore Microsoft session through `psav.sharepoint.com`.
2. Complete Microsoft Authenticator if the provider requires it and keep the browser signed in.
3. Open `https://lighthouse2.psav.com/login` in the same OVH `general` profile.
4. Lighthouse's first screen asks for an email address. Use the Encore corporate email identity for this Lighthouse form.
5. Continue into Microsoft/Encore SSO. An already-established SharePoint session should satisfy the Microsoft identity layer or greatly reduce the challenge path.
6. Allow the OAuth callback to return to Lighthouse and give the Angular app time to consume the callback.
7. Verify an authenticated Lighthouse route such as `/flowsheets/loc/.../asOf/...` and confirm live flowsheet content is visible.

### Why SharePoint first matters

Direct Lighthouse login exposed two identity quirks:

- Lighthouse copy says Encore employees may use a username or Encore email, but the first HTML input is `type=email`, so a non-email UKG-style username is rejected by browser validation and disables **Continue**.
- The downstream Microsoft guest-tenant flow did not accept the default Encore email as the tenant login name. The actual corporate Microsoft Login ID is different.

SharePoint is already the normal human entry point and establishes the correct Encore tenant session. Once that session was established on 2026-09-15, Lighthouse successfully consumed an SSO auth code and loaded the flowsheet dashboard.

The current `3dvr-browser-login lighthouse` runner contains identity fallback logic but does not yet encode the complete SharePoint-first choreography. Treat SharePoint-first as the canonical recovery path until that sequence is folded into the runner and covered by an end-to-end test.

## Failure history and permanent fixes

The following failures were encountered while restoring access. They are recorded so future agents do not rediscover them by trial and error.

### Secrets broker directory traversal

The broker initially failed authenticated reads with `EACCES` on `/etc/3dvr/secrets-broker/agents.json`. The directory was mode `0700` even though policy/agent files were group-readable. The directory was corrected to `0750` so the restricted broker service can traverse it without making policy files public.

### Obsolete OpenBao IATSE mapping

Dedicated IATSE aliases still referenced an old OpenBao backend and returned 404. Routine login reads were moved to the working Bitwarden Secrets Manager mirror.

### Bitwarden CLI / Docker mismatch

`/usr/local/bin/bws` was a Docker-backed wrapper. The hardened `threedvr-secrets` service intentionally lacks Docker access. Rather than granting Docker privileges, broker reads were moved to the native Bitwarden SDK with organization/project metadata supplied through local configuration.

### Missing Bitwarden environment in systemd

The broker had a valid Bitwarden machine credential on disk but the service did not load `bitwarden.env`. The systemd unit now loads `/etc/3dvr/secrets-broker/bitwarden.env` directly.

### Stale general Chrome process / dead CDP protocol

Port `9222` once answered HTTP health requests while the old Chrome debugging target stopped answering CDP commands, producing `cdp-command-timeout`. Restarting the managed `general` lane with the same durable profile restored CDP without discarding browser state. Never infer session loss from a stuck CDP endpoint.

### Lighthouse identity mismatch

The default Encore email address and the Microsoft tenant Login ID are not necessarily the same identifier. A direct Microsoft attempt with the default email produced "This username may be incorrect." The correct tenant identity was recovered from an authoritative Encore account-reactivation record, then Microsoft Authenticator succeeded.

Do not put the actual identity or any temporary password from historical onboarding mail into Git. The operational lesson is the identity distinction, not the secret value.

### UKG logout false positive

The runner previously classified `PostLogout.aspx` as authenticated because the page lacked a password field and was not `Login.aspx`. PR #2477 corrected this by explicitly treating PostLogout as expired and restarting the login flow.

## Change record

Relevant access work landed through these pull requests:

- **#2469** — trusted-owner autonomy for routine browser credential reads and clearer owner access behavior.
- **#2471** — first-class local browser-login action so secrets stay inside the broker/browser boundary.
- **#2475** — native Bitwarden SDK reads, systemd environment wiring, and removal of Docker from the read path.
- **#2476** — Lighthouse may reuse the Encore/UKG identity for the initial identity step while explicitly preventing UKG password reuse on later SSO screens.
- **#2477** — UKG PostLogout/session-timeout recovery and authenticated-state verification fix.

Focused broker/browser tests passed after each access change; the final UKG fix passed 16/16 focused tests plus Agent Checks and Playwright Checks.

## Verification commands

From Hetzner, the normal read-only starting point is:

```sh
/root/.3dvr/bin/persistent-access-health
```

On OVH, safe process-level checks include:

```sh
systemctl is-active 3dvr-secrets-broker.service
systemctl is-active 3dvr-browser-lane@general.service
systemctl is-active 3dvr-browser-lane@encore.service
curl -fsS http://127.0.0.1:9222/json/version >/dev/null
curl -fsS http://127.0.0.1:9333/json/version >/dev/null
```

Then verify the provider page itself. Do not stop at process health.

For supported automated logins:

```sh
3dvr-browser-login iatse
3dvr-browser-login ukg
```

The command response must be treated as a hint and followed by a page-level verification of the expected authenticated route/content. This rule exists because the UKG PostLogout false positive proved that URL classifiers can be wrong.

## Recovery matrix

| Symptom | Correct response |
| --- | --- |
| CDP port down, profile exists | Restart the same managed lane/profile; do not create a fresh profile |
| CDP HTTP works but protocol calls time out | Treat Chrome target as stale; restart the same managed lane/profile and re-test |
| Secrets broker down | Recover `3dvr-secrets-broker.service` before touching provider sessions |
| Bitwarden read fails | Check native SDK/environment/config; do not grant Docker group access |
| IATSE shows login | Run broker-backed IATSE login; verify `/avail` |
| UKG shows Login.aspx | Run broker-backed UKG login; verify `/default.aspx` |
| UKG shows PostLogout/sessiontimeout | Treat as logged out, return to login, authenticate, verify dashboard |
| Lighthouse shows `/login` | Verify SharePoint session first, then retry Lighthouse in the same `general` profile |
| Microsoft asks for Authenticator | Surface only the number-match prompt; Thomas approves; preserve resulting session |
| Provider shows CAPTCHA/device attestation/legal prompt | Stop at the owner checkpoint and ask for that one action |

## Security and autonomy boundaries

The goal is maximum owner access with minimum ceremony, not removal of meaningful boundaries.

Routine login automation may automatically consume credentials for the trusted OVH browser identity when policy explicitly grants it. Higher-impact recovery, root, destructive, financial, or ownership-sensitive secret classes remain separately controlled.

Never:

- return a password or secret value from the browser-login API;
- put secrets into command-line arguments when a local broker action can consume them internally;
- grant the secrets service Docker/root-equivalent access to make a credential helper convenient;
- reuse the UKG password on Microsoft/Lighthouse pages merely because the same person owns both accounts;
- copy provider cookies between hosts;
- replace a persistent profile with a disposable one without explicit recovery intent.

The trusted-owner model should reduce unnecessary approval prompts for ordinary access while keeping secrets inside the narrowest component that needs them.

## Remaining engineering work

- Fold the proven **SharePoint-first → Microsoft SSO → Lighthouse** sequence into `3dvr-browser-login lighthouse`.
- Add an end-to-end Lighthouse test that recognizes Microsoft MFA as `human_required`, resumes after approval, and verifies a flowsheet route.
- Extend persistent-access health to distinguish UKG `Login.aspx`, `PostLogout.aspx`, and `/default.aspx` rather than only checking for a tab.
- Extend health to verify SharePoint signed-in state because it is now a dependency/recovery bootstrap for Lighthouse.
- Keep the `training` lane intentionally inactive unless a training workflow needs it; do not treat inactivity alone as an outage.
- Consider a safe identity alias for the Encore Microsoft Login ID so the runner never needs to rediscover it from email.

## Definition of done for future access changes

A workforce integration is not "working" merely because a tab exists. It is done when the canonical host/profile, secret source, automated path, authenticated-state test, timeout/logout behavior, recovery path, human checkpoint, and no-secret logging rule are all explicit and tested.

If a future agent learns a new provider-specific quirk, update this runbook in the same change that fixes the automation.

## Implementation map

The main repository components behind this workflow are:

| Path | Responsibility |
| --- | --- |
| `apps/agent/thomas-agent/node/browser-login.js` | Provider-specific browser-login orchestration and authenticated-state classification |
| `apps/agent/thomas-agent/node/secrets-broker.js` | Scoped secret policy and Bitwarden backend integration |
| `apps/agent/thomas-agent/node/secrets-broker-server.js` | Local broker/server routes including browser-login action |
| `apps/agent/thomas-agent/node/bitwarden-sdk-read.js` | Native Bitwarden Secrets Manager reads without Docker |
| `ops/secrets-broker/install.sh` | Installs broker/browser-login components and migrates policy |
| `ops/secrets-broker/3dvr-secrets-broker.service` | Hardened broker service and local Bitwarden environment loading |
| `scripts/ops/persistent-access-health.sh` | Read-only persistent-access health checks |
| `scripts/ops/browser-lane-lease.sh` | Cooperative single-writer browser-lane lease implementation |
| `docs/persistent-access-contract.md` | High-level persistence policy |
| `docs/access-continuity.md` | Recovery hierarchy and durable-state rules |
| `docs/infrastructure-topology.md` | Host roles and browser profile locations |

When behavior and this document disagree, verify the live system and update both the implementation and documentation in the same pull request. Do not let recovery knowledge live only in chat history.
