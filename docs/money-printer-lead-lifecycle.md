# Money Printer lead lifecycle

Campaigns should be effortless at the front door without collapsing every prospect into CRM.

The canonical lifecycle is:

> discovered → selected → review → sent → replied → customer

## Lead Vault

Lead Vault is the prospect layer. Every verified public-business result from Campaigns is stored here before outreach.

A Lead Vault record keeps:
- business/contact name and public business email
- website and location
- why the prospect matches
- source evidence and source URL
- a lightweight business profile summary and publicly evidenced capabilities
- ranked business needs, each marked observed or inferred with supporting evidence and confidence
- the smallest recommended next action and a solution route: 3DVR, partner, either, or unknown
- overall analysis confidence
- the offer and outreach draft used at discovery time
- first-seen and last-seen timestamps
- lifecycle status

## Business intelligence layer

Lead discovery is also business research. Every discovered business should gradually become a reusable profile, not a disposable email address.

The system keeps three classes of information separate:

1. **Facts** — public business details and capabilities supported by a source.
2. **Needs** — observed problems or cautious inferred opportunities. Inferred needs must never be presented as facts.
3. **Actions** — the smallest useful next step, plus whether 3DVR could supply it, a partner may be a better fit, either could work, or the route is still unknown.

Campaigns can aggregate the structured needs from the current search into a **Need Radar**. Repeated needs are an early market signal: they can influence outreach, reveal referral opportunities, or become candidates for a reusable 3DVR product or service.

The longer-term Business Graph should connect businesses to capabilities, needs, suppliers, outcomes, and corrections while preserving evidence and provenance. Public facts may be broadly reusable; private account data and anonymous users' local prospect data must not be promoted into a shared graph without explicit permission.

Records deduplicate by normalized business email.

## Why it is separate from CRM

A search result is not yet a relationship.

- **Lead Vault** answers: “What prospects have we found?”
- **Review queue** answers: “What are we considering contacting?”
- **CRM** answers: “Who are we actually interacting with or serving?”
- **Opportunity Engine** answers: “Where is there evidence-backed demand worth acting on?”

This keeps AI discovery from flooding the CRM or falsely implying a relationship.

## Current persistence

Anonymous use stays zero-setup and device-local under:

`3dvr.moneyPrinter.leadVault.v1`

When an existing Portal/Gun identity is available, Campaigns and Money Printer automatically reconcile that local vault with the signed-in user's encrypted Gun/SEA node:

`user → money-printer → lead-vault-v1`

The payload is encrypted with the signed-in user's SEA keypair before it is written to the relay. The pages merge by normalized email, preserve the furthest lifecycle status, and reconcile live remote updates so another signed-in device can see new leads without turning anonymous data into a shared public graph.

Selected leads also enter the Money Printer message-review queue, and successful/failed sends update lead state.

## Remaining persistence work

Cross-device Lead Vault sync is now implemented. The next durability/privacy work should add:
- append-only status/event history rather than only current state
- suppression state preserved across devices
- explicit export/delete controls
- recovery/backup semantics for account loss
- CRM promotion only after a meaningful relationship event

Do not put anonymous visitors' prospects into a shared global 3DVR graph. Anonymous use remains device-local until the user signs in or explicitly exports/promotes the data.

## Location targeting

Campaigns treats location as optional.

- Blank location asks the browser for approximate geolocation. Coordinates are rounded before reverse lookup, then converted to a city/region label for the lead search.
- Raw browser coordinates are not stored in Lead Vault.
- A typed city, state, ZIP, or place is resolved before the paid lead search runs.
- Ambiguous city-only input (for example, `Springfield`) presents location choices instead of silently choosing a state.
- If browser location is unavailable or denied, Campaigns continues with a broad search and tells the user.
- The normalized location label is shown before/while searching so the user can see the exact geographic interpretation.
