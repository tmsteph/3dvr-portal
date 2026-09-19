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
- the offer and outreach draft used at discovery time
- first-seen and last-seen timestamps
- lifecycle status

Records deduplicate by normalized business email.

## Why it is separate from CRM

A search result is not yet a relationship.

- **Lead Vault** answers: “What prospects have we found?”
- **Review queue** answers: “What are we considering contacting?”
- **CRM** answers: “Who are we actually interacting with or serving?”
- **Opportunity Engine** answers: “Where is there evidence-backed demand worth acting on?”

This keeps AI discovery from flooding the CRM or falsely implying a relationship.

## Current persistence

The first implementation stores Lead Vault records in same-origin browser storage under:

`3dvr.moneyPrinter.leadVault.v1`

Campaigns and Money Printer share that store on the same browser. Selected leads also enter the Money Printer message-review queue, and successful/failed sends update lead state.

## Next persistence layer

Browser storage is useful for immediate zero-setup use, but it is not the final durable store.

The next storage layer should be signed-in, user-owned, cross-device sync with:
- one stable lead ID
- encrypted/private account scope
- provenance retained with every imported or discovered contact
- append-only status/event history
- suppression state preserved across devices
- export/delete controls
- CRM promotion only after a meaningful relationship event

Do not put anonymous visitors' prospects into a shared global 3DVR graph. Anonymous use stays device-local until the user signs in or explicitly exports/promotes the data.
