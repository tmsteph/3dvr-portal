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
