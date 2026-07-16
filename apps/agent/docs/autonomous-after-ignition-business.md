# Autonomous-After-Ignition Business

## Goal and boundary

3DVR can test operational autonomy: give an agent compute, a signed charter, a machine identity, a simulated treasury, and a durable journal, then measure whether it can design and operate a useful service without routine human labor.

Operational autonomy is not legal personhood. A human or legal entity remains the lawful sponsor, owns regulated accounts, defines delegated authority, and can stop the system. The IRS currently requires an EIN responsible party to be a person except for government entities.

The target loop is: discover demand -> propose an offer -> acquire a customer -> receive payment -> deliver value -> pay costs -> preserve state -> continue operating. The first implementation does **not** execute that loop in the world. It produces auditable simulation evidence for review.

## Identity and architecture

The venture has two identities:

1. **Machine identity:** an Ed25519 signing key and public fingerprint generated locally. It establishes continuity after migration.
2. **Lawful economic identity:** authority delegated by 3DVR or another legal entity for contracts, regulated accounts, taxes, and customer activity.

A self-custodial wallet is a separate capability, not the machine identity. Ethereum accounts can be created from locally generated private keys, but that does not grant legal authority. This pilot creates no wallet.

```text
3DVR governance and control plane
  charter, sponsor, budgets, approvals, audit, emergency stop
                    |
isolated venture runtime
  agent loop, workspace, machine identity, journal, ledger
                    |
capability adapters
  model, web, email, publishing, payment, infrastructure
```

OpenClaw can be a runtime adapter. Its Gateway supports paired nodes and declared capabilities, but its security guidance treats a Gateway as one trusted-operator boundary, not hostile multi-tenancy. Pilot ventures should use separate containers and OS users; higher-risk ventures should use separate hosts or accounts.

No prompt is a security boundary. Enforcement belongs in capability allowlists, network policy, filesystem isolation, transaction limits, approvals, and independently written audit records.

## Autonomy levels

| Level | Authority |
| --- | --- |
| 0 | Local simulation and drafts only |
| 1 | Human-reviewed research and proposed actions |
| 2 | Approved publishing and one-to-one communication |
| 3 | Bounded fulfillment and spending through isolated adapters |
| 4 | Self-funding operation within charter and reserve rules |
| 5 | New ventures or material expansion, always sponsor-approved |

Promotion is explicit and reversible. Revenue alone does not earn permissions.

## Charter and treasury

Each venture needs a versioned, signed charter defining purpose, prohibited conduct, truthful AI disclosure, outreach limits, privacy and retention, customer support and refunds, financial limits, approvals, sponsor and amendment authority, evidence, backups, and shutdown rules.

The default policy blocks publishing, outreach, account creation, wallet creation, transaction signing, spending, contracts, fulfillment, and refunds. A missing policy is a denial.

The sandbox uses `USD_SIMULATED`; ledger entries represent no funds or customers. Before a real treasury is connected, require legal and accounting review, a lawful sponsor, vendor approval, customer terms, and a recovery drill. A later wallet pilot should isolate the signer, separate operating and reserve wallets, enforce transaction and daily limits, delay large transfers, retain an offline recovery path, and reconcile every transaction. Custodial and fiat accounts remain sponsor-owned and must follow provider verification.

## Lifecycle

1. Verify the charter, generate identity, initialize state, and journal the birth.
2. Compare narrow services using demand, delivery reliability, acquisition cost, and downside risk.
3. Draft scope, exclusions, price, example output, terms, and support procedure.
4. Begin with reviewable inbound or restrained outreach; never impersonate a person or evade opt-outs.
5. Record authorization, inputs, work, corrections, liabilities, and delivery evidence.
6. Reconcile costs, reserves, refunds, runway, and sponsor distributions.
7. Test encrypted off-site backup and restoration on a clean machine.
8. Stop safely when insolvent, unauthorized, or uncertain; preserve records and obligations.

## Simulation pilot

```bash
npm run venture:simulate -- --state-dir /tmp/3dvr-venture-sandbox --reset
```

The state directory contains a deny-by-default `charter.json`, machine identity and mode-`0600` private key, hash-chained `events.ndjson` and `ledger.ndjson`, `state.json`, and `latest-report.md`.

The pilot makes no network requests. A successful run reports zero external actions, zero contacted customers, no published offer, and `realOperations: false`.

## Graduation gates

- Named lawful sponsor and reviewed charter
- Threat model, isolated runtime, approval UI, and emergency stop tested
- Customer disclosure, terms, privacy, refund, and support policies approved
- Separate signer and limits tested with valueless assets
- Backup restored successfully after replacing the VM
- Audit export and accounting reconciliation reviewed
- One narrow offer tested under human approval
- Explicit approval naming the single external capability enabled next

Do not enable several external capabilities at once. The first real pilot should require manual approval for every message, publication, transaction, and delivery.

Long-term success means revenue covers every cost and liability, 60-90 days of runway exists, customers understand the service is AI-operated, the venture can restore after losing its VM, and it suspends safely when authority or solvency is unclear.

## Primary references

- [IRS: Responsible parties and nominees](https://www.irs.gov/businesses/small-businesses-self-employed/responsible-parties-and-nominees)
- [Ethereum: Accounts](https://ethereum.org/developers/docs/accounts/)
- [Cloudflare: Email Routing API](https://developers.cloudflare.com/email-service/api/route-emails/)
- [OpenClaw: Gateway architecture](https://docs.openclaw.ai/concepts/architecture)
- [OpenClaw: Security](https://docs.openclaw.ai/gateway/security)

This is an engineering plan, not legal, tax, investment, or financial advice.
