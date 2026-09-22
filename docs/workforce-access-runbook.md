# 3DVR Workforce Access Runbook

Updated: 2026-09-22

This runbook records the working access architecture and recovery procedures for IATSE Local 122, Encore UKG/UltiPro, Encore SharePoint, Encore Outlook email, and Lighthouse. It exists so future agents recover existing access instead of rebuilding it from memory or asking Thomas to sign in again prematurely.

## Current verified state

The following were verified from the canonical OVH browser profiles, with SharePoint/Outlook and UKG time-off re-verified end-to-end on 2026-09-18:

| Service | Verified state | Canonical path |
| --- | --- | --- |
| IATSE Local 122 | Authenticated | `https://member.iatse.io/avail` |
| Encore UKG / UltiPro | Authenticated | `https://n21.ultipro.com/default.aspx` |
| Encore SharePoint / Connect | Authenticated | `https://psav.sharepoint.com/SitePages/Home.aspx` or Connect site |
| Encore Outlook email | Authenticated through same Microsoft session | `https://outlook.office.com/mail/` |
| Encore Time Off Calendar | Authenticated through UKG Time & Attendance launch | `https://avsgi.ultiprotime.com/ta/top/timeOffCalendar.jsp...` |
| Lighthouse | Authenticated; My Schedule verified | `https://lighthouse2.psav.com/schedule/loc/9036/asOf/YYYY-MM-DD` |

These are session states, not guarantees that providers will never expire cookies or require MFA again. Always verify the live page before reporting authentication.

## Prime directive

Access is infrastructure. Preserve it.

- Do not create replacement browser profiles as a recovery shortcut.
- Do not ask Thomas for passwords that already exist behind the secrets broker.
- Do not print credentials, session cookies, broker tokens, Bitwarden values, reusable MFA secrets, one-time passcodes, recovery codes, or approval tokens into chat, logs, docs, shell history, or Git.
- An ephemeral Microsoft Authenticator number-match value displayed by the provider is not a credential or reusable MFA secret. Surface only that short-lived number to Thomas when required for provider-enforced approval, then discard it.
- Ask Thomas only for provider-enforced human checkpoints such as Microsoft Authenticator number matching, CAPTCHA, device pairing, or legal consent.

## Canonical runtime topology

Persistent authenticated browser state lives only on OVH. Hetzner is the normal agent/worker node and reaches OVH through the SSH mesh.

| Lane | CDP | Host profile | Purpose |
| --- | ---: | --- | --- |
| `general` | `9222` | `/home/debian/.config/google-chrome-for-testing` | 3DVR Portal, IATSE, Encore SharePoint, Encore Outlook, Lighthouse, general authenticated web work |
| `encore` | `9333` | `/home/debian/.config/3dvr/browser-profiles/encore` | UKG / UltiPro |
| `messaging` | `9444` | `/home/debian/.config/3dvr/browser-profiles/messaging` | Google Messages / WhatsApp |
| `training` | `9555` | `/home/debian/.config/3dvr/browser-profiles/training` | Encore training; inactive when last verified |

The lane launcher is `/usr/local/bin/3dvr-browser-lane-start`. Before changing browser state, acquire the matching writer lease with `/usr/local/bin/3dvr-browser-lease` and release it after the write sequence. Read-only inspection may be concurrent.

A reachable CDP port is only process health. It is not proof that the provider session is authenticated.

## Secrets architecture

The 3DVR Secrets Broker runs on OVH as `3dvr-secrets-broker.service` under the restricted `threedvr-secrets` identity and listens on its local Unix socket. Routine browser logins use the local-only browser-login action; secret values are never returned to the calling shell.

The installed first-class commands are:

```text
3dvr-browser-login portal
3dvr-browser-login iatse
3dvr-browser-login ukg
3dvr-browser-login lighthouse
3dvr-lighthouse-schedule 2026-09-21
```

The Portal owner-login procedure is documented canonically in `docs/access-continuity.md`; it shares the same broker and persistent OVH browser infrastructure.

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

Do not treat TouchBase / `ultiprotime.com` as a generic time-clock-only dead end. The safe request-off path is launched from authenticated UKG and lands in the Encore Time Management module on `avsgi.ultiprotime.com`. The rule is: **never touch clock-in, clock-out, transfer, or time-entry controls unless Thomas explicitly asks for time-clock work; use only the Time Off Calendar / request-off controls for leave requests.**

### Verified Encore time-off request workflow

Verified end-to-end on 2026-09-18:

1. Use the dedicated `encore` lane on CDP `9333`.
2. If UKG is logged out or at `PostLogout.aspx`, run `3dvr-browser-login ukg` and verify `https://n21.ultipro.com/default.aspx`.
3. From UKG, open **Time & Attendance**. This launches the authenticated Encore Time Management module on `https://avsgi.ultiprotime.com/`.
4. Ignore the default Daily Timesheet / clock controls.
5. Open **Time Off Calendar**.
6. Click the target date cell. The modal is **New Time Off**.
7. Resolve the **Type** field through its legacy lookup widget. For an unpaid/non-paid day off, the verified Encore code is **UNPAID VACATION**.
8. Confirm the From and To dates are the same target date for a one-day request and leave **Partial Day** unchecked for a full day.
9. Add a neutral comment if needed; `Unpaid day off.` was accepted on 2026-09-18.
10. Click **OK** to stage the request. Verify the calendar row shows `UNSUBMITTED <TYPE>` on only the intended date.
11. Before pressing the calendar-level **Submit** button, enumerate all `UNSUBMITTED` request rows. If any unrelated request is present, stop instead of bundling it accidentally.
12. Submit only when the intended request is the only unsubmitted item. Verify the target row changes to `PENDING <TYPE>` / Pending Approval.

For the 2026-10-01 test, the staged row was `UNSUBMITTED UNPAID VACATION`; after submission it became `PENDING UNPAID VACATION`. No clock or timesheet controls were touched.

## Encore SharePoint / Connect

SharePoint is the reliable Microsoft/Encore session bootstrap for Lighthouse.

Canonical start: `https://psav.sharepoint.com/` or the Connect site.

When Microsoft asks for an account, use the corporate **Login ID** from the secured Encore identity record, not the public/default Encore email address. The account-reactivation notice distinguishes these identities. Do not store the actual Login ID in this public repository; resolve it from the secured identity source when needed.

If Microsoft Authenticator number matching appears, surface only the ephemeral displayed number to Thomas and wait for approval. Never surface a TOTP, recovery code, push-approval token, or other reusable/authenticating secret. After approval, choose **Stay signed in: Yes** so the persistent `general` profile retains the Microsoft session.

Verify success by reaching the Connect home site and seeing signed-in SharePoint navigation, not merely by observing Microsoft cookies.

## Encore Outlook email

Encore email uses the same Microsoft 365 session as SharePoint and belongs in the **OVH `general` lane on CDP `9222`**.

Canonical mail URL: `https://outlook.office.com/mail/`.

### Account-selection rule

Do not assume the ChatGPT/Microsoft Outlook connector is the Encore mailbox. On 2026-09-18 the connected Outlook connector returned Thomas's personal `outlook.com` / IATSE mailbox, not the Encore work mailbox.

When Thomas asks for **Encore Outlook**, **Encore email**, a message from an Encore manager, or schedule email from the property:

1. Use the OVH `general` lane on CDP `9222`.
2. Verify `https://psav.sharepoint.com/` is authenticated first. The signed-in SharePoint page should show Thomas's Encore identity.
3. In the same browser profile, open `https://outlook.office.com/mail/`.
4. Verify the title/account is the Encore Microsoft 365 mailbox before reading or acting on mail.
5. If Outlook redirects to Microsoft sign-in, recover the SharePoint session first rather than creating a new profile or asking for credentials prematurely.
6. If Microsoft requires Authenticator, surface only the provider's ephemeral number-match checkpoint and preserve the resulting session.

### Manchester Grand Hyatt two-week schedule email workflow

Observed schedule-mail pattern for property **9036 – Manchester Grand Hyatt San Diego**:

- Sender: **Steve Habeeb**.
- Subject pattern: `Schedules for the weeks of <week 1> and <week 2> at the Manchester Grand Hyatt 9036`.
- The message contains **two weekly schedule PDF attachments**, one for each week.
- The schedule is described in the email as the **next 2 weeks**.
- Observed recent cadence is Thursday morning, but treat the actual newest email timestamp as authoritative instead of assuming a fixed publication time.
- Weekly schedules overlap between releases, so the newer email can revise the nearer week. Steve's email explicitly says to review next week's schedule closely because there may have been changes.

To answer “does the current two-week schedule cover DATE?”:

1. Open Encore Outlook through the authenticated `general` lane.
2. Search mail for `schedule`.
3. Select the newest Manchester Grand Hyatt 9036 schedule email from Steve Habeeb.
4. Read its subject/body and attachment filenames.
5. Treat the two PDF filenames/week labels as the covered schedule weeks.
6. Determine whether the requested date falls in either seven-day week.
7. If the user asks what they are actually scheduled to work that day, open the matching weekly PDF and inspect Thomas's row/assignment; do not infer the shift from the email body alone.

Verified example on 2026-09-18:

- Newest schedule email received: **2026-09-17 10:08 AM**.
- Subject: **Schedules for the weeks of September 21st and 28th at the Manchester Grand Hyatt 9036**.
- Attachments:
  - `GridWeeklySchedule-9036 - Manchester Grand Hyatt San Diego-09212026 (1).pdf`
  - `GridWeeklySchedule-9036 - Manchester Grand Hyatt San Diego-09282026.pdf`
- Therefore the release covers **2026-09-21 through 2026-10-04**.
- **2026-10-01 is covered** by the week-of-2026-09-28 PDF.

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

### Lighthouse My Schedule — source of truth

For Thomas's actual Encore work schedule, use **My Schedule**, not the flowsheet event list and not a previously copied calendar event.

Canonical route for Manchester Grand Hyatt 9036:

```text
https://lighthouse2.psav.com/schedule/loc/9036/asOf/YYYY-MM-DD
```

The installed reader is:

```sh
3dvr-browser-login lighthouse
3dvr-lighthouse-schedule 2026-09-21
```

The reader uses the authenticated OVH `general` browser lane on CDP `9222`, opens the requested schedule week, selects the signed-in employee's **My Schedule** row, maps the seven timeline columns to their displayed dates, and returns only safe schedule fields: date, shift title/time/role, notes, publication status, and scheduled-hours summary. It never returns browser cookies, access tokens, or the Microsoft identity used during SSO.

Treat live Lighthouse My Schedule as authoritative when it disagrees with a copied Google Calendar event or older email/PDF schedule. After every successful refresh, reconcile the working calendar: update changed Encore shifts, add newly published shifts, and remove stale Encore-only events that Lighthouse no longer shows. Do not touch unrelated personal appointments while reconciling.

The reader and the SharePoint-first login path were verified live on 2026-09-22.

### Assistant/server route

Persistent browser state remains on OVH. From Hetzner, use the `3dvr-ovh` SSH alias. On the current `tmsteph` desktop, the existing `debian-web` alias lands on Hetzner; from there, hop to `3dvr-ovh`. Do not mistake that desktop alias for the DigitalOcean node. The browser itself stays on OVH; the intermediate host is only the control path.

### Why SharePoint first matters

Direct Lighthouse login exposed two identity quirks:

- Lighthouse copy says Encore employees may use a username or Encore email, but the first HTML input is `type=email`, so a non-email UKG-style username is rejected by browser validation and disables **Continue**.
- The downstream Microsoft guest-tenant flow did not accept the default Encore email as the tenant login name. The actual corporate Microsoft Login ID is different.

SharePoint is already the normal human entry point and establishes the correct Encore tenant session. Once that session was established on 2026-09-15, Lighthouse successfully consumed an SSO auth code and loaded the flowsheet dashboard.

The `3dvr-browser-login lighthouse` runner now treats the active SharePoint Microsoft session as the Lighthouse identity source. It reads the corporate UPN only inside the local browser process, never emits it, opens SharePoint first when that identity is absent, and returns `human_required: sharepoint-session-required` instead of guessing with a UKG-style username. The Lighthouse email form also receives the `blur` event required by its current Angular validation before **Continue** is clicked.

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
3dvr-browser-login portal
3dvr-browser-login iatse
3dvr-browser-login ukg
3dvr-browser-login lighthouse
```

The command response must be treated as a hint and followed by a page-level verification of the expected authenticated route/content. This rule exists because the UKG PostLogout false positive proved that URL classifiers can be wrong.

## Recovery matrix

| Symptom | Correct response |
| --- | --- |
| CDP port down, profile exists | Restart the same managed lane/profile; do not create a fresh profile |
| CDP HTTP works but protocol calls time out | Treat Chrome target as stale; restart the same managed lane/profile and re-test |
| Secrets broker down | Recover `3dvr-secrets-broker.service` before touching provider sessions |
| Bitwarden read fails | Check native SDK/environment/config; do not grant Docker group access |
| Portal shows sign-in | Run `3dvr-browser-login portal`; verify the signed-in Portal route and owner UI in the same `general` profile |
| IATSE shows login | Run broker-backed IATSE login; verify `/avail` |
| UKG shows Login.aspx | Run broker-backed UKG login; verify `/default.aspx` |
| UKG shows PostLogout/sessiontimeout | Treat as logged out, return to login, authenticate, verify dashboard |
| Lighthouse shows `/login` | Verify SharePoint session first, then retry Lighthouse in the same `general` profile |
| Microsoft asks for Authenticator | Surface only the ephemeral number-match value; Thomas approves; preserve resulting session. Never surface OTP/recovery/approval secrets. |
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

- Add an end-to-end Lighthouse test that recognizes Microsoft MFA as `human_required`, resumes after approval, and verifies both an authenticated Lighthouse route and My Schedule extraction.
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
