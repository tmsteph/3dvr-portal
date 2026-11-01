# Treasury and supporter accountability charter

Status: proposed v0.1, prepared 2026-10-31. Not a signed investment agreement or a deployed financial control.

## Purpose

Grow 3DVR through useful paid services and accountable reinvestment. Protect customers, contributors, supporters, and the founder through the same documented money rules. Historical promises and records must be preserved.

## Money rules

1. Every payment has a source, purpose, currency, settled amount, fees, refunds, and associated delivery obligation. Record customer payments, founder funding, borrowing, and any legally documented investment separately.
2. Founder-funded purchases are reported separately from outside-customer demand. Financing and unrelated customer revenue never mint founder points.
3. A Stripe payout is movement of money, not proof of profit or permission to spend it. The business ledger must follow the money into bank accounts.
4. Protect taxes, refunds/disputes, prepaid delivery obligations, approved operating costs, debt obligations, and the adopted operating reserve before discretionary founder draws or supporter distributions. Calculate overlapping reserves once.
5. Budget founder compensation explicitly. The founder cannot approve their own discretionary compensation increase, distribution, or exception. Payments for previously approved delivered work remain distinct from profit distributions.
6. No supporter distribution without a reconciled contribution record, verified entitlement and applicable agreement, approved amount, independent approval, and a fresh reserve check.
7. Preserve historical points, payments, and promises. Do not erase or silently reclassify possible rights. Service usage balances, participation scores, and any contractual financial rights must be reconciled without double counting.
8. New financial promises require a documented structure and qualified legal/accounting review. Do not add a token, ownership promise, or automatic return formula to resolve ambiguous historical language.
9. Rule changes require a version, written reason, independent approval, and seven calendar days' notice to affected participants before taking effect. Do not reduce existing contractual rights through a policy update.
10. Emergency action may stop outflows immediately; it may not create an exception to pay the founder. Log the reason and review within two business days.

## Reserve and distribution calculation

All monetary calculations use integer minor units, separately per currency. Never add different currencies without an explicit recorded conversion.

- Reconciled unrestricted settled cash: verified business cash after bank/Stripe reconciliation, excluding pending funds, amounts already committed/in transit, restricted funds, and duplicate counts across accounts.
- Protected obligations: non-overlapping tax provision, refund/dispute provision, prepaid work and supplier obligations, due debt, and approved near-term operating needs.
- Operating reserve target: proposed initial target of two months of reconciled recurring essential operating expenses. The actual target and expense baseline require adoption; missing information is unknown, not zero.
- Candidate distributable surplus = max(0, unrestricted settled cash - protected obligations - operating reserve).
- An approved reward pool is an explicit allocation from surplus subject to agreements and verified approvals. It is never the entire Stripe balance divided by leaderboard points.
- Missing or stale reconciliation, unresolved obligations, or missing approvals blocks a new discretionary distribution. Unknown surplus must display as unknown, not an asserted zero entitlement.

No reserve percentage, founder compensation amount, ownership split, return rate, or supporter payout is adopted by this document.

## Independent approval

An approver must be a named, verified human distinct from the requester and beneficiary. A second founder-controlled login, AI agent, or unsigned checkbox is not independent approval.

Before activation, record:
- Approver identity, scope, conflict-of-interest rules, appointment and removal process.
- Monthly founder compensation budget and operating reserve target.
- Who may execute payments, change payout destinations, change API keys, or change roles.
- Which banking controls actually require another approver.
- A recovery and successor process that cannot silently bypass those controls.

The request must bind beneficiary, amount, currency, purpose, policy version, reserve snapshot, expiry, and one-use request ID. Any material edit invalidates approval. The executing service verifies approval and current reserves immediately before payment, with idempotency and durable receipts.

If one owner can bypass all app controls in Stripe or the bank, record that limitation. App rules alone do not make the founder unable to override them. Binding governance requires appropriate signed documents and provider controls, reviewed for the operating entity and jurisdictions.

## Private contribution register

Keep personal financial records and correspondence in a private server-backed ledger or private owner records, never public Gun nodes, source files, issues, or PRs.

Minimum fields:
- Stable internal participant ID; private source-to-person identity evidence.
- Source payment/charge/invoice IDs and currency.
- Gross captured amount, refunds, disputes, fees, settlement and net cash.
- Original payment purpose and any promise, with dated source reference.
- Services delivered, points minted/spent, and prior distributions.
- Proposed classification, uncertainty, reviewer and approval history.

Use append-only corrections. Maintain backups and demonstrate restore. Import payment events idempotently. Paid invoices alone are insufficient to establish net cash, equity, debt, or financial entitlement.

## Reporting

Monthly close must show:
- Outside-customer revenue, founder-funded receipts, and financing separately.
- Collected recurring revenue, active subscriptions, cancellations and failed collections.
- Delivery costs, infrastructure/AI costs, founder delivery hours and compensation.
- Refunds/disputes, taxes provision, debt, reserve target and actual reserves.
- Founder draws, supporter distributions, reconciliation exceptions and rule changes.

Participant reports expose only the recipient's records and approved aggregates. Public reports omit private participant and customer data.

## Growth experiment

Use the existing scoped service funnel rather than launching another financial product.

- Focus: owner-operated service businesses with concrete website, intake, follow-up, or automation needs.
- Offer: one bounded launch/automation job, followed by recurring support only for defined continuing work.
- First milestone: three outside paying customers through the same offer, with delivery hours, direct costs, support burden, and collected payments verified.
- Before increasing spend, show contribution margin after direct costs and realistic founder labor.
- Prepare outreach for approval; do not send automatically.
- Budget for new paid ads, software, debt, and infrastructure in this experiment is zero until explicitly adopted.
- Track qualified leads, approved contacts, replies, paid conversions, repeat business, delivery time, net margin, and retention weekly.
- Existing customer commitments and production reliability take priority over new sales.

## Implementation backlog and acceptance

1. Reconcile the private register with charges, invoices, refunds, disputes, historical promises, and points. Preserve uncertain records for review.
2. Audit `points-ratio/pool-ratio.js`: current source adds Stripe available and pending balances and derives dollar values from Gun leaderboard totals. Do not present that calculation as an approved redeemable reward balance. Preserve historical records and explain any display change.
3. Identify authoritative authenticated payment execution paths before adding policy checks; document and close alternative routes.
4. Extend the existing server-backed approval/ledger mechanisms where possible. No new public endpoint or duplicate currency by default.
5. Enforce requester/beneficiary separation, replay prevention, concurrency-safe reserve checks, server-authoritative permissions, and immutable audit history. Fail closed on stale or unknown financial data.
6. Configure provider-side authority separation and document any owner override. No production role, destination, payout schedule, or ownership changes as part of this draft.
7. Demonstrate tests: founder self-approval denied; alternate founder identity denied; missing reserves denied; pending cash excluded; multi-currency mixing denied; changed request invalidates approval; duplicate execution prevented; concurrent approved requests cannot overspend; policy downgrade cannot silently bypass review; recovery cannot authorize an unreviewed founder payment.
8. Review historical promises and proposed participant terms with appropriate professionals before activating financial rewards.
9. Stage and verify the full approval-to-receipt flow with synthetic data before a separately reviewed live cutover.

Related: [existing points ledger work #1613](https://github.com/tmsteph/3dvr-portal/issues/1613), [customer discovery #3289](https://github.com/tmsteph/3dvr-portal/issues/3289), [startup measurement #3243](https://github.com/tmsteph/3dvr-portal/issues/3243).

## Activation checklist

- [ ] Private reconciliation signed off; uncertainty and historical promises retained.
- [ ] Operating entity and applicable agreements reviewed.
- [ ] Independent approver appointed and conflicts addressed.
- [ ] Founder budget, reserve baseline and policy adopted.
- [ ] Payment and policy-change authority mapped and restricted.
- [ ] Backend controls and failure/replay/concurrency tests pass.
- [ ] Bank/Stripe bypass limitations understood and addressed.
- [ ] Participant disclosures reviewed and approved.
- [ ] Synthetic full-flow demonstration passes.
- [ ] Live cutover separately reviewed; rollback and audit retention verified.

Until these are complete, label this charter proposed and controls not active.
