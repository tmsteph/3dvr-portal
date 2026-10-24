# Private Cell workspaces

The Cell page now creates account-private descriptions. Sign in with a Portal username
and password, then open `/cell/`. OAuth-only accounts are explicitly blocked with
key-setup guidance; they are not provisioned ephemeral, device-only encryption keys. The page uses Portal's verified SEA session
recovery rather than a cached username as permission. New accounts can create many
Cells with suggested sizes of 3, 10, or 15 people.

Cell records (including names, purposes, pillars, and timestamps) are encrypted with
the owner's SEA pair before persistence. The signed owner graph is
`user.get('cell-v1').get('cells').get(opaqueRevisionId)`. Each envelope contains ciphertext
only. The browser keeps encrypted cache entries per account and revision for relay
outages. Pending ciphertext retries on reopen, network recovery, focus, and periodically
while the page is open. Immutable revision paths prevent a late retry from overwriting
a newer device edit. No new keys, credentials, or plaintext descriptions are stored by Cell.
A local save or relay acknowledgement does not prove a second device restored it.

Changing accounts/signing out clears the displayed records, search, form, and preview,
unsubscribes the old stream, and ignores late callbacks. Saves recheck the account
following encryption and before publishing. Encryption or storage failure never falls
back to the old public graph. Private IDs are not passed into Contacts/CRM/Finance,
whose current access rules do not provide private Cell isolation.

Cells start owner-only. Explicit recipient-bound invitations now grant read-only
access; only the owner edits descriptions and manages invitations. The target size
is a planning value, not a count of joined members. Existing public
entries in `3dvr-portal/cellHub` remain public; hiding them from this page cannot revoke
copies that peers already have. No automatic migration or deletion is performed.
The account public key and opaque graph IDs remain visible to relay infrastructure.

Validation: real SEA encryption/decryption and wrong-key rejection; encrypted-cache
restore; account changes during encryption; stale/foreign/closed-store callbacks;
relay timeout; storage/encryption failure; signed-out save rejection; 20 independent
Cells; slow-save/reset behavior. The mobile browser test uses disposable identities
and a session fixture with the real encryption/store module. It checks save, reload,
account switching, sign-out, plaintext absence, and horizontal overflow. Portal auth
recovery is covered separately by shared auth tests.

## Recipient-bound read-only invitations

A signed-in member copies their signed account code from `/cell/` to the owner.
The code contains only their public signing/encryption keys and a signature binding
them. The owner verifies the account code with the intended person, selects a saved
Cell, and creates a link. Creating a link does not send email or a message.

The link is an opaque reference to the owner's signed Gun graph, not a bearer secret.
Only the selected account's SEA pair can derive the recipient-specific decryption
secret. The owner signs each grant/update/revocation before encrypting it for that
recipient. Accept explicitly adds a signed reference to the member's encrypted
account journal. The member sees a read-only Cell and receives future owner updates.
There is no editor/admin role, public membership list, or access to other Portal apps.
The owner's list shows invitations, not a verified count of accepted members.

Shares use immutable events under
`user.get('cell-v1').get('shares').get(grantId).get(eventId)`. Encrypted owner grant
metadata and member references live in the account's separate `cell-sharing-v1`
journal. Pending owner share events retry after reopen, reconnect and periodic
wakeups. Sharing metadata, names, descriptions, and rosters are never written as
plaintext to Gun or the browser cache. Links and member codes contain public keys.

Revocation stops that recipient receiving new Cell snapshots and removes the live
view once its signed revocation arrives. It cannot erase previously downloaded
information; offline recipients may retain their last snapshot until reconnecting.
A grant cannot be restored after revocation; a fresh invitation uses a new grant ID.
Invitations remain usable by their bound account until revoked; this version makes
no expiry or remote-erasure promise. Existing public entries are still untouched.
