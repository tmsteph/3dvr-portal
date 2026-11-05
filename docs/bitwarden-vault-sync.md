# Password Manager automation sync

OVH runs `3dvr-bitwarden-vault-sync.timer` every fifteen minutes. It pulls the regular Bitwarden vault using its dedicated CLI profile, applies the existing automation mirror filters, and verifies the current values in both Bitwarden Secrets Manager and OpenBao. It is one-way: changes in the automation stores do not edit the human vault.

The master password is never saved. One owner login/unlock is necessary before activation:

```sh
sudo -n python3 /usr/local/lib/3dvr/unlock-bitwarden-vault.py
```

Run this in an interactive terminal on OVH. Enter the email, master password, and any Bitwarden MFA directly on that terminal, never in chat. The helper saves only the derived vault session in root-only `/etc/3dvr/secrets-broker/vault-session`; the dedicated encrypted CLI profile is `/var/lib/3dvr/bitwarden-vault-cli`. This session grants vault decryption while valid, so root access is privileged.

The worker reports `owner-unlock-required` if no session exists. Revocation, expiration, or account challenges stop sync and require another owner unlock. A successful timer invocation without a session does not mean the vault synced. Check the journal for `live-vault-sync` and `bothStoresVerified:true`.

Existing aliases remain stable on item rename. Removed or newly excluded items receive a tombstone in both stores so their current values no longer contain passwords. The index publishes only after all item read-backs pass. OpenBao historical versions retain their existing retention behavior; this is not historical erasure. Root/recovery credentials, cards, identities, SSH keys, passkeys and password history remain excluded by default.

`--checkpoint-existing` verifies and copies the already imported automation mirror to both stores. It does not fetch new Password Manager changes.

Install the two scripts beside the existing broker/importer and the units under `/etc/systemd/system`, then enable the timer. No master-password rotation is performed.

## Verified deployment — 2026-10-02

The timer is enabled on OVH. Eight focused mirror/sync tests passed, both systemd units validated, and the existing 21-item mirror passed read-back verification in both stores. The live vault pull remains awaiting owner unlock; the service explicitly reports that state.
