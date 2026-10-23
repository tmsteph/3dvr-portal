# Private Cell workspaces

The Cell page now creates account-private descriptions. Sign in through the existing
Portal sign-in flow, then open `/cell/`. The page uses Portal's verified SEA session
recovery rather than a cached username as permission. New accounts can create many
Cells with suggested sizes of 3, 10, or 15 people.

Cell records (including names, purposes, pillars, and timestamps) are encrypted with
the owner's SEA pair before persistence. The signed owner graph is
`user.get('cell-v1').get('cells').get(opaqueId)`. Each envelope contains ciphertext
only. The browser keeps one encrypted cache entry per account and Cell for relay
outages. No new keys, credentials, or plaintext descriptions are stored by Cell.
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
