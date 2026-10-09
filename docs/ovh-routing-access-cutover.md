# OVH Portal routing and persistent credentials

## Deployed and verified on 2026-10-02

- Portal A record now points to OVH `40.160.137.41`. Authoritative DNS, Cloudflare and Google resolvers agree.
- Public HTTPS is valid. The public homepage SHA-256 matches `/opt/3dvr-portal-production/current/index.html`; runtime health reports release `589b31e58724d3f15da102d7e79009d74565a937`, `operatorApi: native`, and primary mode.
- Operator, Access and Secret Handoff pages returned 200 on direct OVH HTTPS. Following the dedicated Operator redirect returned 200. Authenticated owner flows were not exercised in this cutover.
- Caddy, Portal, OpenBao and Secrets Broker remain active. Port 4320 remains bound to loopback.
- Only `sudo` was removed from OVH Desktop Commander's block list. Other blocked commands and settings were verified unchanged; `sudo -n true` passed.
- Desktop Commander's settings tool recommends a separate configuration chat; it does not require one. Thomas explicitly authorized the targeted change here.
- DNS belongs to team `3dvr`; the canonical Vercel fallback project belongs to `tmstephs-projects`. Existing CLI authentication works when the correct scope is used. No password was reset.

## TLS and renewal

`ops/caddy/portal-ovh.Caddyfile` is the installed configuration. It preserves the HTTP origin for the existing edge/fallback mesh and adds HTTPS with a dedicated Portal certificate.

Certbot used DNS-01 before the traffic switch. The original CNAME followed a target whose CAA policy permitted Let's Encrypt. After cutover, a Portal-only CAA record permits Let's Encrypt renewal; whole-domain nameservers and CAA policy were not changed.

- Certificate lineage: `/etc/letsencrypt/live/portal-ovh-bootstrap`, expires 2026-12-31.
- Caddy certificate files: `/etc/caddy/portal-tls/fullchain.pem` and `privkey.pem`; the key is root-owned, readable only by root and the Caddy group.
- DNS hooks: `/usr/local/lib/3dvr/portal-acme-dns-hook.py` on OVH calls the authenticated Hetzner DNS helper through the existing SSH mesh.
- DNS helper: `/root/.3dvr/deploy/portal-dns-20261002.py` on Hetzner. The repository copy preserves the executed operation.
- Renewal deploy hook: `/etc/letsencrypt/renewal-hooks/deploy/3dvr-portal.sh` copies renewed files, validates Caddy and reloads gracefully.
- `certbot.timer` is enabled. Real issuance, the deployment hook and a renewal dry run passed; challenge TXT records were cleaned up.

Vercel does not permit changing a DNS record's type through PATCH. The cutover removed the captured CNAME and immediately created the replacement A record, with recreation of the original on an A-record creation failure.

## Credential checkpoints

The native Vercel CLI's OAuth state is checkpointed under `VERCEL_CLI_AUTH_HETZNER` in OpenBao and **Bitwarden Secrets Manager**, project `3dvr Agent`. It includes refresh state; it is not a static Vercel API token.

The server-side writer authenticates to the DNS API, writes both stores and compares both read-backs with the original in memory. It prints only status, the key name and expiry. Credential values stay out of chat, command arguments and Git.

`3dvr-vercel-credential-sync.timer` runs hourly on Hetzner. Its service invokes the native CLI so it can refresh its session, then checkpoints through the OVH writer. A manual service run passed, including the unchanged-state path. No redundant vault version is written when both stores already match.

- Client helper: `/root/.3dvr/deploy/checkpoint-vercel-client.py` on Hetzner.
- Writer: `/usr/local/lib/3dvr/checkpoint-vercel-cli.cjs` on OVH, root-only.
- Source: Hetzner's existing native CLI auth file, retained in place.
- Health: `systemctl show 3dvr-vercel-credential-sync.service -p Result -p ExecMainStatus` and `systemctl is-active 3dvr-vercel-credential-sync.timer`.
- Restore after losing the source auth file is not automated by these helpers. Retrieve the checkpoint through an authorized recovery path, write it privately into the native CLI auth location and verify the CLI before resuming. Provider revocation or MFA may still require owner interaction.

Bitwarden Password Manager is separate from Secrets Manager. The normal vault mirror in OpenBao contains 21 items and was generated on September 15. These changes do not establish continuous synchronization of arbitrary human-vault edits.

## Rollback and remaining dependencies

- Original Caddyfile: `/etc/caddy/Caddyfile.before-portal-https-20261002` on OVH.
- Captured DNS records: `/root/.3dvr/deploy/portal-dns-20261002/before.json` on Hetzner.
- New address identity: `new-address.json` in that same directory.
- DNS rollback: run the Hetzner helper with `rollback`; it verifies the new address identity and restores the original CNAME/value/TTL. Keep working OVH HTTPS available during DNS cache expiry.
- Restore the saved Caddyfile only if the new configuration is faulty; validate it and reload gracefully.
- Vercel DNS hosting and legacy API/fallback deployment remain. Self-hosted legacy API fallback is retained; this was not a deletion of every Vercel dependency.
- Cross-device chat synchronization, newer release deployment and full authenticated Operator E2E remain separate work.
