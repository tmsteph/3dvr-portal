# Operator installation

Install the independent app at https://operator.3dvr.tech/operator/.
The subdomain root redirects to that path on the same origin. Its manifest identity
and scope are `/operator/`, isolated from the Portal origin's root-scoped installed app.
The Portal's Install Operator button opens the independent origin.

The same OVH application serves both hosts, including native APIs and sign-in;
no additional server or frontend fork is needed. Root-relative assets and API
requests remain on the Operator origin. The original Portal path remains usable.

Browser storage and login recall are separate across these origins. Sign in on
Operator with the existing 3DVR account. Account-scoped encrypted Gun history is
shared through the existing relay; device-only unsynced drafts/history stay on
Portal until that device publishes them. Do not clear Portal storage to install.
OAuth provider callbacks have not been separately validated for the new origin;
username/password sign-in remains the existing same-origin path.

After a successful self-host production deployment, `operator-domain-ovh.yml`
validates the portable backend page, surgically replaces the old Caddy redirect,
validates configuration, reloads Caddy and checks HTTPS. It preserves all other
sites and restores the previous configuration on a reload/local verification failure.
Unknown configurations stop for inspection instead of replacing the whole file.
Existing Operator DNS/TLS are reused; this release does not change DNS.

Verify public `/` remains on Operator and reaches `/operator/`, the actual page
has no client redirect, the manifest and module assets load, and the native health
endpoint is available. Then sign in and check history on an actual device before
calling cross-origin account continuity verified. Android installation must be
confirmed on a device with Portal already installed.
