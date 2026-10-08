# Universal Credit Network — prototype v0.1

Tracks issue #3087. Experimental accounting model; not a cryptocurrency, bank, wallet, or payment service.

## Design
Each IOU identifies its issuer, creditor, face amount in integer USD cents, terms digest and due date. An ordered stream of events describes acceptance, creditor-confirmed simulated settlement, dispute and closure. The pure TypeScript reducer rejects duplicate IDs, unauthorized actors, overpayment and invalid state transitions.

**Not yet implemented:** cryptographic signatures, identity/key management, canonical event ordering, GunJS replication, privacy encryption, external payment verification, UI, and regulatory review. Event input must be treated as untrusted; this reducer alone provides no authentication. Do not use with real money.

## Next implementation
1. Add canonical signed event envelopes and Ed25519 verification, including key revocation.
2. Add deterministic conflict resolution and replay-safe synchronization.
3. Add tests covering authorization, double processing, partial payments and offline convergence.
4. Add two-user mobile sandbox; settlement remains simulated.
5. Conduct threat modeling and legal review before any real-world financial functionality.

## Existing approaches to investigate
Mutual-credit networks, Stellar issued assets, Ripple trust lines, and Lightning payment rails. Distinguish USD-denominated debts from redeemable stablecoins.
