# Assembly Needs, Offers, and Support Receipts

Assembly treats support as a two-sided coordination problem.

- **Needs** describe what would unblock a person or group.
- **Offers** describe help, knowledge, equipment, space, introductions, compute, or another resource someone can provide.
- **Support receipts** preserve the fact that a need was resolved, including which offer helped when there was a match.

## Matching rule

An open need can be matched to an open offer. Matching resolves the need and stores the offer ID on the need as `matchedOfferId`.

The offer remains open after the match until its provider explicitly closes it. This is intentional: expertise, rooms, tools, introductions, and other resources may be reusable across several needs.

A need can also be resolved directly when help happened outside Assembly or no specific offer should be recorded.

## Privacy and portability

Needs, offers, and support receipts remain inside the same browser-local Assembly workspace and travel through the versioned `3dvr-assembly` export/import format.

On import, Assembly validates references. If a need points to an offer that does not exist in the imported workspace, the broken match is cleared rather than preserved as trusted state.

## Product boundary

This is coordination metadata, not inventory accounting or financial custody. An offer does not imply ownership transfer, payment, legal obligation, or a kernel permission. Future integrations with Finance, inventory, Contacts, Calendar, or capability policy should link to their authoritative records rather than duplicating them inside Assembly.

## Why this matters

A healthy group needs more than task tracking. It needs a visible way to ask for help, reveal available capacity, connect the two, and remember that support actually happened.
