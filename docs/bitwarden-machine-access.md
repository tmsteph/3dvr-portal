# Bitwarden Machine Access Runbook

## Purpose

3DVR uses Bitwarden Secrets Manager for machine-readable automation credentials. This is separate from Thomas's normal Bitwarden Password Manager vault.

The goal is to let approved automation use selected credentials without putting a Bitwarden master password, machine token, or site password in chat, Git, logs, or general server environment files.

## Verified state — 2026-09-15

- Canonical secrets control node: OVH `vps-2b6a0420`.
- Broker service: `3dvr-secrets-broker.service`, enabled and running.
- Broker socket: `/run/3dvr-secrets-broker/broker.sock`.
- Bitwarden Secrets Manager CLI: `/usr/local/bin/bws` (`2.1.0` when verified).
- Machine credential file: `/etc/3dvr/secrets-broker/bitwarden.env`.
- Credential variable: `BWS_ACCESS_TOKEN`.
- The file is protected for root + the dedicated secrets group. Never print its value.
- Bitwarden Secrets Manager project: `3dvr Agent`.
- The machine token is valid and can list that project.
- At verification time the `3dvr Agent` project contained **zero secrets**.

That last point is why a valid machine token did not unlock IATSE: there was nothing in Secrets Manager to retrieve.

## The important distinction

The Bitwarden machine access token is **not** a key to Thomas's Password Manager vault.

It authorizes a Bitwarden Secrets Manager machine account to the project(s) granted to that account. It cannot silently unlock the normal Bitwarden web vault, browser extension, or master password.

The Password Manager and Recovery Vault remain human/recovery systems. Secrets Manager is the automation lane.

## Architecture

```text
Thomas / owner
  |
  | save selected automation credential once
  v
portal.3dvr.tech/access/
  |
  | owner-signed HTTPS request
  v
OVH 3DVR Secrets Broker
  |
  | BWS_ACCESS_TOKEN (broker only)
  v
Bitwarden Secrets Manager / 3dvr Agent
  |
  | scoped alias + approval/lease
  v
approved automation/browser task
```

The machine access token stays on OVH. Individual agents authenticate to the broker with their own hashed bearer identity and receive only capabilities/scopes allowed by policy.

## Recovery Vault boundary

The 3DVR Recovery Vault is a separate break-glass system for root credentials such as the Bitwarden master password. Its design remains passkey-gated and client-side: servers and AI should not receive or persist the decrypted master password.

Do not put the Bitwarden master password into Secrets Manager simply to make browser automation easier.

## Automation secret naming

Use stable, descriptive keys in the `3dvr Agent` project. For IATSE:

```text
IATSE_PORTAL_USERNAME
IATSE_PORTAL_PASSWORD
```

The broker supports stable key locators, so policy can reference project name + key rather than hard-coded Bitwarden secret UUIDs.

Example:

```json
{
  "backend": "bitwarden",
  "locator": {
    "projectName": "3dvr Agent",
    "key": "IATSE_PORTAL_PASSWORD"
  },
  "capability": "secret.read",
  "scopes": ["site:iatse"]
}
```

## Correct IATSE handoff

1. Open `/access/` while signed in as the 3DVR owner.
2. Use **Save to 3DVR Secrets**.
3. Save the IATSE username as `IATSE_PORTAL_USERNAME`.
4. Save the IATSE password as `IATSE_PORTAL_PASSWORD`.
5. Confirm only secret metadata from the server: project, key names, IDs, timestamps. Never echo values.
6. Grant a dedicated browser/operator identity `secret.read` only for `site:iatse`.
7. Let the browser helper consume the values locally and report only success/failure and resulting authenticated state.

The AI should not need to display either credential to perform the login.

## Safe verification commands

These commands verify infrastructure without printing secrets.

```bash
systemctl status 3dvr-secrets-broker.service
sudo stat /etc/3dvr/secrets-broker/bitwarden.env
sudo grep -q '^BWS_ACCESS_TOKEN=' /etc/3dvr/secrets-broker/bitwarden.env && echo configured
```

To verify the machine token against Bitwarden, load it only inside a privileged shell and print project metadata, not the token:

```bash
sudo bash -lc 'set -a; . /etc/3dvr/secrets-broker/bitwarden.env; set +a; bws project list'
```

When checking project contents, filter to IDs and key names. Do not dump raw secret JSON into chat or CI logs.

## Failure diagnosis

### Broker says Bitwarden is not configured

Check that `bitwarden.env` exists, contains the variable name, and is readable by the broker service account. Do not print the value.

### Machine token works but a site credential cannot be found

List the target Secrets Manager project and confirm the required key names exist. A machine token does not import Password Manager items automatically.

### Password Manager web vault is locked

This does not imply the Secrets Manager machine token is broken. They are separate authentication systems.

### A site session expired

First try the canonical persistent browser profile. If a real credential login is required, use the broker-backed automation secret. Ask for human input only when the credential has never been handed into Secrets Manager or when MFA/CAPTCHA/provider approval requires it.

## Rotation

- Rotate the Bitwarden machine token in Bitwarden Secrets Manager when compromised or intentionally cycling credentials.
- Hand the replacement to `/access/` using the owner-gated **Connect Bitwarden** flow.
- Never paste a replacement token into chat.
- Rotate individual site passwords independently; update only the corresponding Secrets Manager key.
- Keep audit records free of values.

## Current IATSE status

As of 2026-09-15:

- server connectivity is restored;
- OVH persistent Chrome is reachable;
- `member.iatse.io` is reachable from OVH;
- the Bitwarden Secrets Manager machine credential is present and valid;
- the `3dvr Agent` project is empty;
- therefore IATSE cannot yet be re-authenticated through Secrets Manager.

The remaining one-time handoff is to save the IATSE username/password into the `3dvr Agent` project. After that, machine access can be policy-scoped and repeatable without relying on the normal Bitwarden vault session.
## Bulk Password Manager mirror

When Thomas wants broad automation access, use the persistent OVH Firefox workspace for the one-time Password Manager login. The browser profile persists under the freelancer workspace volume and the streamed browser is the human checkpoint for login, MFA, CAPTCHA, and export confirmation.

The canonical workspace currently used for Thomas is `fw-thomas-pilot`. Its host-side download directory is:

```text
/var/lib/3dvr/freelancer-workspaces/fw-thomas-pilot/config/Downloads
```

The Bitwarden tab should be opened inside that workspace. Thomas enters the master password directly into Bitwarden; it must never be copied into chat, shell history, Git, or the Secrets Manager project.

### What is mirrored by default

A plaintext Bitwarden JSON export is consumed locally by `scripts/ops/import-bitwarden-export-to-secrets-manager.mjs`. The mirror is intentionally broad but not absolute. By default it includes:

- login usernames and passwords;
- TOTP seed URIs;
- login URIs;
- custom fields;
- secure notes;
- ordinary item notes and metadata.

It deliberately strips password history and FIDO2/passkey credential material. It also excludes Bitwarden/root-recovery items, payment cards, identities, and SSH keys unless an owner deliberately opts those classes in.

This keeps the server useful for automation without making the machine credential the only root of trust for the entire digital identity.

### Storage model

Each mirrored vault item becomes one structured JSON secret with a stable key:

```text
VAULT_ITEM__<TYPE>__<NAME>__<SOURCE_ID>
```

A separate `VAULT_INDEX` secret contains only lookup metadata: item names, types, source IDs, URIs, and corresponding secret keys. It contains no password values.

The broker exposes these through scoped aliases:

```text
vault.index
vault.item.VAULT_ITEM__LOGIN__EXAMPLE__ABC123
```

Only the dedicated OVH browser helper has `secret.read` plus `secrets:password-manager-mirror`, so routine mirrored credential reads are automatic for that trusted identity. Normal agents do not get the scope. Recovery/root items remain excluded from the mirror and keep their separate owner-controlled recovery path.

### One-time migration command

After a plaintext JSON export lands in the workspace Downloads directory, run from OVH with the machine token loaded only inside the privileged process:

```bash
sudo bash -lc '
  set -a
  . /etc/3dvr/secrets-broker/bitwarden.env
  set +a
  node /opt/3dvr/secrets-broker/import-bitwarden-export-to-secrets-manager.mjs \
    --input /var/lib/3dvr/freelancer-workspaces/fw-thomas-pilot/config/Downloads/<export>.json \
    --delete-source
'
```

The importer never logs values. It creates or updates secrets by stable key, writes/updates `VAULT_INDEX`, prints counts only, and deletes the plaintext export after a successful run. `shred` is attempted first, with deletion as a fallback.

Before a real import, `--dry-run` can report only counts and excluded classes.

### Optional classes

Use these only when there is a concrete reason:

```text
--include-cards
--include-identities
--include-ssh
--include-root
```

`--include-root` is intentionally exceptional. It can include items that the default root-of-trust filter would keep human-only. Do not use it merely for convenience.

### After migration

1. Confirm the importer summary contains counts only.
2. Confirm the Password Manager export no longer exists in Downloads.
3. Confirm `VAULT_INDEX` and `VAULT_ITEM__*` metadata exist in the `3dvr Agent` project without printing values.
4. Test one low-risk login through the broker/browser helper.
5. Keep the original Password Manager vault as the human source of truth; Secrets Manager is the automation mirror.

Future password changes should update the mirror through the same process or a dedicated sync path. Do not assume Password Manager edits automatically propagate into Secrets Manager.
