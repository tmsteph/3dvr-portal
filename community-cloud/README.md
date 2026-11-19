# 3DVR Community Cloud

**Like a crowdsourced AWS.**

> Canonical home: this folder in the 3dvr-portal monorepo, per Thomas's
> keep-everything-in-the-portal rule (2026-11-08). The standalone
> tmsteph/3dvr-community-cloud repository remains as a public pointer.

Do you have a computer sitting at home connected to the Internet? Sell
your spare network and space. All encrypted and private.

Members run a small agent on a machine they already own. The agent
offers that machine's spare disk and bandwidth to the network. Other
members store encrypted data and run work across those machines using
familiar cloud words — buckets, instances, credits — with a
compatibility layer so nobody has to learn new terms. Hosts get paid
for what they actually provided: bandwidth and storage, measured and
averaged over time.

Hosts only ever hold ciphertext. Data is encrypted on the owner's
machine before it leaves, split into pieces, and spread across hosts.
No host can read what it stores.

Part of 3DVR's long-term direction: AI that is local (your own box,
your own agent) plus a community cloud — shared infrastructure owned by
its members instead of a big-tech cloud. Local for freedom, community
for strength.

## How the pieces fit

- **Host agent** — runs on member machines; offers disk and bandwidth,
  stores encrypted chunks, meters itself, signs receipts.
- **Client** — encrypts and splits data on the owner's machine; keys
  never leave the owner.
- **Registry** — the phone book: hosts, offers, chunk placement,
  receipts. Gun carries identity (the existing 3DVR account/fork
  model); coordination and metering use boring queryable storage.
- **Compatibility gateway** — first an S3-compatible storage API, so
  existing tools point at a new address and keep working.
- **Payouts ledger** — signed, cross-checked metering receipts become
  balances, redeemable for in-network services (storage, bandwidth,
  AI time). Token placeholder name: "tommycoin". No token exists yet;
  see the design doc's open questions before believing otherwise.

Full design: [docs/DESIGN.md](docs/DESIGN.md).

## Status

- **Slice 0 — host metering agent: prototype built.** See
  [host-agent/](host-agent/). It measures disk offered/stored,
  bandwidth, and uptime, keeps rolling averages, and prints a JSON
  metering report. No networking, no uploads, no payouts yet.
  Run its check with `node host-agent/agent.js --self-test`.
- Slice 1 — encrypted chunk store on one host: not started.
- Slice 2 — multi-host distribution: not started.
- Slice 3 — S3-compatible gateway: not started.
- Slice 4 — payouts ledger: not started.
- Slice 5 — compute / boxes on member hosts: not started.

The first hosts will be 3DVR's own fleet (OVH, Hetzner, DigitalOcean),
Thomas's laptop, and a LicheePi 4A board. Dogfood before any public
invite.

## License and intent

Open source, like everything 3DVR ships. This is infrastructure the
portal and Operator can stand on — not a token sale, not an investment
offer, not financial advice.
