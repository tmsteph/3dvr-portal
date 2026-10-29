# Encore payroll access and password generation preference

Verified 2026-10-28 at Thomas's request.

## Working payroll sign-in

- Use existing owned servers, not Thomas's laptop or phone. OVH is the primary browser host.
- Canonical entry point shown by Encore's migration notice: https://encoreglobal-dl.ultipro.com . The old https://n21.ultipro.com/Login.aspx can show the migration notice and redirect.
- The upgraded sign-in uses welcome-us.ukg.net. Treat its Encore redirect as part of the legitimate sign-in flow rather than an automatic credential failure.
- The existing password-manager mirror entry named `n21.ultipro.com` worked on the upgraded login on 2026-10-28. No password reset was required. Keep username/password in the secrets broker, never in this document or queue output.
- Secret references: `vault.index`, then the matching `vault.item.<key>`. Only one UltiPro item was present in this mirror; that does not establish how many entries exist in the live vault.
- Persistent Encore browser lane is localhost CDP port 9333 on OVH. Successful sign-in returned to n21.ultipro.com/default.aspx.
- Optional 'Sign On Information' email/phone update appeared after login. Dismissed without changing account recovery or MFA details.
- Pay navigation is inside UKG shadow components: menu item id `MX_MENU_PAY_STATEMENTS` (Pay statements), alongside `MX_MENU_PAY_OVERVIEW`. Inspect the live page rather than assuming the previous classic menu.
- Authentication must be verified against the actual account UI, not merely a successful command exit or redirect.

## Independent server execution

Use the existing Open Runner before quota-based remote tools. Verified 2026-10-28: private tmsteph/3dvr-terminal-bridge queue -> Hetzner Open Runner -> `ssh 3dvr-ovh` works. See apps/agent/docs/open-remote-runner.md and open-runner-mesh-rollout.md. Never put credentials, codes, session URLs, or tokens into queue requests or results.

## Password generation preference

Thomas requests four randomly generated words, separated with hyphens: `word-word-word-word`, so passwords can be typed on different devices. Use unique independently generated passphrases. Follow site-specific case/number/length constraints when necessary. This is a preference for new or intentionally rotated passwords; it does not authorize bulk rotation of existing credentials or changing the Bitwarden master password.

Bitwarden target generator settings: Passphrase; number of words 4; separator `-`. CLI equivalent is `bw generate --passphrase --words 4 --separator -`. Do not print generated passwords in command output or GitHub.

On 2026-10-28 Thomas signed into the Bitwarden web vault through the 3DVR Human Handoff on OVH's general lane (9222). The handoff was resolved before automation resumed under its own browser lease. In Tools -> Generator, selected Passphrase and set Number of words 4, separator `-`, Capitalize off, Include number off. The visible UI confirmed these exact values. No saved passwords or account security settings were changed. Reloading the web vault immediately returned to the locked-vault screen; persistence across unlock/reload and propagation to other Bitwarden clients remain unverified. Future work should unlock through a fresh human handoff and inspect the existing preferences without assuming cross-device synchronization. The automation browser lease was released.

## Verified OpenBao-backed vault unlock — October 28, 2026 Pacific

Thomas supplied the Bitwarden master password using a one-time encrypted Secret Handoff. OpenBao key reference: `BITWARDEN_MASTER_PASSWORD`. Receipt status was `stored`; ephemeral handoff key material was removed. The actual value was never placed in chat or queue output.

A server-side test resolved the secret locally and successfully unlocked the existing Bitwarden web vault on OVH's general browser lane (9222). After the earlier page reload and vault lock, Tools -> Generator restored Passphrase selected, number of words 4, separator `-`, Capitalize false, and Include number false. Persistence across reload/unlock is now verified in this server browser. Phone/extension propagation remains unverified. The browser writer lease was released after the check.

For future authorized unlocks, resolve this key only on the trusted server, keep it out of tool arguments/responses/logs, and acquire the matching browser lane lease. Never change the master password or bulk-rotate saved credentials merely to restore a locked session.
