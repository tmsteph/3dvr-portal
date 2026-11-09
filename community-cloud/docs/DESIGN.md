# 3DVR Community Cloud — Design

Status: founding document, 2026-11-08. Slice 0 (host metering agent) in progress.

## The pitch, in Thomas's words

> "Like a crowd sourced AWS. We could even have a compatibility layer so
> people don't have to learn new terms."
>
> "Do you have a computer sitting at home connected to the Internet? Sell
> your spare network and space. All encrypted and private."
>
> "You could get paid in tommycoin or whatever, bandwidth and storage
> space gets measured and averaged."

Local AI plus a community cloud is a stated long-term goal for 3DVR. The
mission frame: open source, every member of the world to be rich, local
for freedom and community for strength.

Plain version: members run a small agent on a computer they already own.
The agent offers that machine's spare disk and spare bandwidth to the
network. Other members store encrypted data and run work across those
machines using familiar cloud words (buckets, instances, credits). Hosts
get paid for what they actually provided, measured and averaged over
time. No big-tech cloud in the middle, and no host ever holds data they
can read.

## Principles

1. **Hosts hold ciphertext only.** Data is encrypted on the owner's
   machine before it leaves. A host stores and serves pieces it cannot
   read, combine, or identify.
2. **Familiar terms on top.** The compatibility layer speaks the words
   people already know from AWS-style clouds: bucket, object, instance,
   region, credits. Nobody learns what a shard or a relay is unless they
   want to.
3. **Measured and averaged, not spiky.** Payouts follow rolling
   averages of real contribution, not one lucky burst. Showing up day
   after day is what a cloud needs, and that is what gets paid.
4. **Attributable and revocable.** Every host, client, and agent acts
   under a signed identity. Access can be revoked; actions leave
   receipts. This follows the existing 3DVR account model: accounts fork
   from an owner's account, never exceed the parent's permissions, and
   are revocable.
5. **Dogfood first.** 3DVR's own machines are the first hosts. No public
   invite until our own fleet has run it, broken it, and been fixed.

## Architecture

### Pieces

- **Host agent** (runs on member machines): offers disk space and
  bandwidth, stores encrypted chunks, serves them back, meters itself,
  and signs metering receipts. Slice 0 is this agent's metering core,
  with no networking yet.
- **Client** (runs on the data owner's machine): encrypts, splits data
  into chunks, spreads chunks across hosts, reassembles and decrypts on
  read. Keys never leave the owner's side.
- **Registry / coordination layer**: the phone book. Who is a host, what
  they offer, where chunks live, who owes whom. Metadata about the
  network, never the data itself.
- **Compatibility gateway**: the familiar face. First surface is an
  S3-compatible storage gateway, so existing tools point at a new
  address and keep working. Compute surfaces ("instances") come later
  and reuse the per-member box design that already exists for Operator.
- **Payouts ledger**: turns signed metering receipts into balances.
  Recorded in the open; settled in a token (see Payouts).

### Encryption and distribution

- Client-side encryption per object, with keys held by the owner (and
  their forked agents, under the existing broker model).
- Objects are split into chunks. Distribution uses erasure-style
  redundancy: enough pieces exist that losing some hosts loses nothing,
  and no single host holds a whole readable object, even before
  encryption is counted.
- Chunk placement avoids putting all pieces of one object on one host,
  one home, or one network.
- Hosts can be audited: the network may ask a host to prove it still
  holds a chunk (a challenge against the stored ciphertext). Failed
  proofs lower the host's measured average.

### Registry: should it be Gun?

Gun.js already carries 3DVR identity (signed accounts, forks) and the
portal's shared state, and the team's hard-won rule applies here too:
Gun is a graph for small state and identity, not a bulk transport.

Verdict: **use Gun for identity and the signed receipt log; do not use
Gun as the chunk map or the metering store.**

- Identity: yes. Host and client identities are Gun accounts/forks,
  same as the portal today. Revocation and attribution come free.
- Registry metadata (host offers, availability heartbeats): a thin
  coordination service backed by ordinary storage is easier to query,
  audit, and meter against than a graph walk. The registry publishes
  signed snapshots that clients can verify, and mirrors its state into
  Gun for resilience, rather than treating Gun as the database.
- Chunk placement maps and metering samples: high-volume, append-only,
  and numeric. That is a log and a time series, not a graph. Keep them
  in plain files/tables under the owner's control, with signed receipts
  anchored periodically so history cannot be quietly rewritten.

Reason in one line: Gun is the identity layer we trust; coordination
and metering need boring, queryable storage, and mixing the two is how
the graph got saturated in past incidents.

### Compatibility layer

- Storage first: an S3-compatible gateway (buckets, objects, the usual
  verbs). Existing backup tools, photo apps, and scripts work unchanged.
- Words audit: every user-facing term gets checked against the words
  people already know. If the network has a special concept, it gets a
  familiar name or stays internal.
- Later: an instances surface backed by per-member boxes (the existing
  Operator "box of your own" design generalizes to: a box can live on
  any enrolled host, not just 3DVR servers).

## Metering

Metering is the trust core. If the numbers are gameable, the payouts
are fiction.

### What is measured

- **Storage offered**: bytes the host commits in its config.
- **Storage actually stored**: bytes of chunks physically present in
  the host's share directory, sampled over time. Offered-but-empty
  earns a small availability credit at most; stored-and-held is what
  pays.
- **Bandwidth served**: bytes in and out attributable to the agent,
  sampled from the OS network counters over the run window (slice 0
  reads /proc/net/dev on Linux).
- **Uptime**: the fraction of each window the agent was running and
  reachable.
- **Proof results**: storage challenges passed/failed (from slice 2).

### Rolling averages

- The agent samples once per minute into a local JSON state file.
- Hourly and daily rolling averages are computed for storage offered,
  storage stored, and bandwidth rate.
- Payouts are calculated from daily averages over a payout period, so
  a host is paid for sustained contribution, not spikes.

### Signed receipts and anti-gaming

- Each metering period produces a **receipt**: host identity, period,
  the averaged numbers, and a signature from the host's key. Receipts
  are what the ledger pays against; unsigned numbers are worth nothing.
- The registry cross-checks receipts against what clients observed
  (bytes actually fetched from that host) and against proof results.
  A host whose claims disagree with client-side observation gets
  flagged, not paid on faith.
- Identity is the cost of cheating: a kicked host loses its fork and
  its history. Reputation is an average too.
- Self-reported numbers alone never settle a payout; they are one of
  three views (host report, client observation, proof challenges).

## Payouts

- Hosts earn a token. Working placeholder name: **tommycoin**.
  That name is a placeholder only. No token exists, nothing has been
  issued, and no wallet is involved in any current slice.
- The token's value floor is usefulness inside the network: it is
  redeemable for in-network services, meaning storage, bandwidth, and
  AI time on the community cloud. A member can spend what they earn
  running their own backups and their own agent, so the coin is the
  money the system itself runs on, not only a speculative asset.
- The payouts ledger is slice 4. Balances are computed from signed,
  cross-checked receipts. Settlement mechanics (chain, custody,
  exchanges) are deliberately undecided until the research below is
  done.

### Open questions (must be researched before any real payout)

1. **Regulatory surface of paying people in a token.** Securities,
   money-transmission, tax reporting, and consumer-protection rules
   differ by place and by design choices (transferability, marketing,
   who issues, how it is redeemed). This needs real legal research
   before slice 4 ships anything of value. Nothing in this document is
   legal advice.
2. Token supply and pricing: fixed, minted against measured work, or
   pegged to service prices? Each choice changes incentives.
3. Custody: members hold their own keys, or accounts hold balances
   they can withdraw? Self-custody fits the philosophy; usability
   argues the other way. Probably balances first, withdrawal later.
4. Abuse economics: what does it cost to fake a host well enough to
   earn, and does the cross-checking above keep that cost above the
   payout at pilot scale?
5. Minimum viable host: how small can a home machine's contribution be
   and still be worth metering and paying?
6. Privacy of the ledger: balances are member business. What is public,
   what is visible to the network, what is visible only to the member?

## Pilot plan

First hosts, all ours:

- The OVH VPS (portal and Gun relay host).
- The Hetzner CX23.
- The DigitalOcean droplet.
- Thomas's laptop (Debian, host name tmsteph).
- The LicheePi 4A board (RISC-V; it is also the low-end test: if the
  agent runs well there, it runs anywhere).

Pilot rules:

- Enroll the fleet with the metering agent first (slice 0) and let it
  run for real weeks. Read its reports before building storage on top.
- Then one host holds encrypted chunks (slice 1), then the fleet
  distributes among itself (slice 2). Data in the pilot is our own
  backups and test data, never a customer's.
- The S3 gateway (slice 3) points at the fleet and gets used for a real
  3DVR backup job before it is called done.
- Payouts in the pilot are ledger entries only, no token, until the
  open questions above are researched.
- Public invites wait for: metering trusted, one real restore from
  multi-host storage proven, and the regulatory research read.

## Build slices, in order

- **Slice 0 — Host metering agent.** Measures disk offered/stored,
  bandwidth, uptime; keeps rolling averages; prints a JSON report.
  No networking, no uploads, no payouts. (In progress; prototype in
  this repo under `host-agent/`.)
- **Slice 1 — Encrypted chunk store on one host.** Client encrypts and
  chunks; one host stores and returns ciphertext; restore is proven.
- **Slice 2 — Multi-host distribution.** Placement, redundancy, host
  proof challenges, registry coordination.
- **Slice 3 — S3-compatible gateway.** Familiar surface over slices
  1–2; terms audit.
- **Slice 4 — Payouts ledger.** Signed receipts become balances.
  Token settlement only after the open-questions research.
- **Slice 5 — Compute / boxes.** Per-member boxes on enrolled hosts;
  the community cloud stops being storage-only.

## What this is not

- Not a product launch. It is a founding design plus a metering
  prototype.
- Not a token sale, not an investment offer, not financial advice.
- Not a replacement for the portal or Operator; it is infrastructure
  they can stand on.
