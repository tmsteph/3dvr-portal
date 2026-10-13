# Operator Gun cache quota repair

Operator, its homepage entry and sign-in connections disable Gun's whole-graph localStorage adapter. Relay sync and encrypted account history remain active. This prevents a large shared `gun/` cache from producing a `localStorage max!` acknowledgement when queueing server work.

This does not disable SEA session recall or the separate device conversation cache. Existing browser keys, history and credentials are preserved; do not clear all site data to test this repair. Other local-first Portal apps keep their existing storage policy.

Verification: run Operator sync, conversation-tree, Forge and Gun peer configuration unit tests. CI runs homepage persistence and two-browser account sync against checkout-local servers for PRs. Manual production acceptance remains a separate workflow dispatch.

Manual check: retain existing storage, sign in, submit a server task and confirm its receipt; reconnect in a second browser and confirm account history. A full device conversation cache remains a separate failure case; this patch specifically removes the unbounded Gun graph cache from the Operator path.
