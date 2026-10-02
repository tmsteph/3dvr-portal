# OVH Portal routing and persistent credential handoff

## Verified on 2026-10-02

- OVH `40.160.137.41` runs Portal on loopback port 4320; Portal, OpenBao and Secrets Broker services are active.
- Direct HTTP for `portal.3dvr.tech` works; direct HTTPS for that hostname fails. Its live Caddy site is explicitly HTTP-only.
- `operator.3dvr.tech` already points to OVH and has working HTTPS; it redirects to Portal.
- Portal still resolves through Vercel. DNS management belongs to team `3dvr`, while the canonical fallback project belongs to `tmstephs-projects`.
- The authenticated Hetzner Vercel CLI can list the DNS zone with `--scope 3dvr`. A failure with the other scope is not proof that another login is needed.
- OpenBao can resolve the mirrored `VAULT_INDEX` through the authorized browser-vault broker identity. Live Bitwarden synchronization and Vercel-token storage in OpenBao are not yet verified.
- OVH Desktop Commander's `blockedCommands` explicitly includes `sudo`. This is a connector restriction; OS admin access has not been tested.

## Access prerequisite

Desktop Commander's configuration tool says: “Should be used in a separate chat from file operations and command execution to prevent security issues.” Use a separate configuration-only chat to authorize removing only `sudo` from OVH's command block list; preserve every other block. Do not change the server account, reset passwords, use another host to evade the block, or disable broader safeguards.

Once permitted, test `sudo -n true` on OVH. If that fails, repair the account's existing administrative authorization through the owner recovery path before proceeding.

## HTTPS and DNS cutover gates

1. Save the live Caddyfile and the complete current Portal DNS record, including TTL, plus any existing Portal-specific CAA records. Keep Vercel's fallback deployment and existing mesh running.
2. Inspect current certificate storage, Caddy DNS modules, effective CAA policy and any API routes that still depend on Vercel. Port 4320 must remain private.
3. Prepare a trusted certificate for `portal.3dvr.tech` before routing visitors to OVH. Prefer DNS-01 using the existing authenticated DNS access; never copy a credential into a command argument or log. If necessary, allow the selected issuer with CAA at the Portal hostname only. Do not change whole-domain CAA or nameservers.
4. `ops/caddy/portal-ovh.Caddyfile` is a candidate, not an installed configuration. Adapt it, validate with the actual certificate/issuer configuration, reload gracefully and verify direct HTTPS with `curl --resolve portal.3dvr.tech:443:40.160.137.41`. No certificate-error bypass is acceptable.
5. Only after direct HTTPS passes, replace the Portal CNAME with A `40.160.137.41` in the `3dvr` DNS scope. Re-read authoritative DNS and public resolvers; preserve the original record for rollback.
6. Verify the public root SHA-256 against `/opt/3dvr-portal-production/current/index.html`, public health SHA against that deployed release, `operatorApi: native`, Operator authentication, and required API routes. A fresh health response alone is insufficient.
7. On TLS, root-artifact or API failure, restore the captured Portal DNS record and re-check the public fallback. Retain working OVH HTTPS during DNS cache expiry. Restore the saved Caddyfile only if the new configuration itself is faulty, then validate and reload it gracefully. Restore any scoped CAA changes only once their issued certificates are no longer needed.

## Persistent credentials

Bitwarden Password Manager remains the human/recovery source; OpenBao is the automation store. Bitwarden Secrets Manager is a separate machine product, not access to the human vault.

For the owner-approved Vercel automation credential, verify team access and persist through the existing owner-authorized broker. Confirm the write receipt, server-side read-back and an authenticated API request without displaying its value. Keep DNS scope `3dvr` separate from deployment scope `tmstephs-projects`.

Verify a selected credential update in Bitwarden propagates to the intended OpenBao record and the broker-backed consumer. If there is no implemented sync path, report that explicitly; do not assume an old vault import stays current. Keep master passwords, recovery keys and unseal shares outside routine automation.

Do not reset any working password merely to repair a team-scope error. If a credential rotation is needed, verify the replacement and both intended storage destinations before revoking the working credential.

## Completion criteria

Admin operations work through the authorized server tool; Portal has valid direct HTTPS and public root/runtime proof; the Vercel credential survives a new consumer session; and the Bitwarden/OpenBao update path is tested. Until these pass, describe this change as prepared, not migrated.
