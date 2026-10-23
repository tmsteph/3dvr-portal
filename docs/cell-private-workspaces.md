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

This version is owner-only: it does not invite members or grant them decryption keys.
The target size is a planning value, not a count of joined members. Existing public
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
