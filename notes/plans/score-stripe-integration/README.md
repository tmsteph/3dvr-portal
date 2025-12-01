# Score + Stripe Integration Outline

## Objectives
- Tie score balances directly to Stripe activity so every purchase or subscription grows the shared pool.
- Add safeguards that keep the Stripe account from being drained while still enabling controlled redemptions.
- Enable a future marketplace where people can buy score (minting against new cash inflows) and sell score back into the pool.

## Data model (Gun-first)
- Anchor Stripe-facing data under `gun.get('stripe')`:
  - `gun.get('stripe').get('customers').get(<customerId>)` → metadata: `email`, mapped `userPub`, `lifetimeGross`, `lastPaymentAt`, `lastEventId`, `latestSubscriptionStatus`.
  - `gun.get('stripe').get('events').get(<eventId>)` → normalized webhook payload, dedup flag, processed timestamp.
- Track score ledger entries under `gun.get('score').get('ledger')` with each entry shaped as `{ eventId, source: 'stripe', customerId, amount, currency, pointsAwarded, ruleVersion, createdAt }`.
- Cache derived aggregates for UI under `gun.get('score').get('totals').get(<currency>)` so dashboards can read `poolGross`, `poolReserve`, `pointsInCirculation`, `pendingRedemptions`, and `lastCalculationAt` without re-scanning the ledger.

## Earning rules
- **One-time payments**: award `Math.floor(netCharge / 100) * basePointsPerDollar` where `basePointsPerDollar` defaults to 10. A configurable `currencyMultiplier` map lets us dampen or boost specific currencies before points are minted.
- **Subscriptions**: grant a recurring bonus when an invoice is paid. Default: `monthlySubscriptionBonus = 250` points per active subscription, applied after `invoice.payment_succeeded` and capped at one bonus per billing period.
- **Referrals**: if a `referrerPub` is stored on the customer record, mirror 10% of the subscriber’s monthly bonus to the referrer ledger entry.
- All point minting writes go through the ledger and increment `pointsInCirculation` by the awarded total.

## Redemption and anti-drain guardrails
- Keep a **reserve floor**: lock `reservePct = 0.35` of every available Stripe balance in `poolReserve`; redemptions can only draw from `poolGross - poolReserve`.
- Apply **pacing caps**: limit `redeemableToday` to the lesser of `(poolGross - poolReserve) * dailyUnlockPct` (start at 0.1) or a fixed ceiling (e.g., $1,000 equivalent) converted per currency.
- Enforce **cooldowns**: each `userPub` must wait `minRedemptionInterval` (default 7 days) between payouts; store `lastRedemptionAt` under `gun.get('score').get('redemptionMeta').get(userPub)`.
- Require **multi-check approvals** for large withdrawals: redemptions above `$500` equivalent must reference two approver pubs on the ledger entry before funds are marked `approved`.
- Add **rate-limit & replay protection**: never process a Stripe event twice (`lastEventId` and `events` map) and reject redemptions if requested amount exceeds `maxPointsPerRequest`.

## Buy and sell flows
- **Buying score**: users launch a Stripe Checkout/PaymentLink session tagged with their `userPub` in metadata. When `checkout.session.completed` or `payment_intent.succeeded` lands, map the `customer` to `userPub` and mint points using the one-time payment rule.
- **Selling score (redeeming)**: create a Gun record under `gun.get('score').get('redemptions').set({ userPub, pointsRequested, currency, createdAt, status: 'pending' })`. A server worker tallies eligibility against `poolGross`, `poolReserve`, and pacing caps, then marks the entry `approved` or `denied`. Approved entries flow into a Stripe `payout` or `transfer` batch that is logged back onto the ledger with `source: 'payout'` and negative `pointsAwarded`.
- **Marketplace pricing**: publish the computed `pointValue` per currency under `gun.get('score').get('pricing')`, derived from `(poolGross - poolReserve) / pointsInCirculation`. Buyers can see live prices; sellers receive the current `pointValue` minus a 2–5% sustainability fee that flows back into the pool.

## Stripe webhook handling
- Add a signed webhook endpoint that ingests `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, and `payment_intent.succeeded`.
- For each event:
  1. Verify the signature with `STRIPE_WEBHOOK_SECRET`.
  2. Deduplicate using `events` map; short-circuit if already processed.
  3. Normalize the payload, update `customers` metadata, and compute point awards based on the earning rules.
  4. Write ledger entries, update aggregates, and emit UI-friendly totals under `score/totals`.
  5. Persist `lastEventId` on the customer node.

## Incentives to grow the pot
- Publish a **growth multiplier** when the `poolReserve` climbs: e.g., +10% point bonus for weeks where net inflow grows by ≥15%.
- Launch **tiered referrals**: more active subscribers tied to a referrer unlock higher bonus percentages, incentivizing member acquisition instead of drain.
- Offer **rollover rewards**: members who defer redemptions for a quarter receive a compounding booster (e.g., +3% points) applied via a scheduled ledger entry.

## Next steps to implement
1. Ship a Stripe webhook route (Node/Next API) that performs signature verification, deduplication, and writes normalized events into Gun under the paths above.
2. Add a scoring service that converts Stripe amounts/subscriptions into ledger entries and updates aggregates with the guardrails (reserve, pacing caps, cooldowns).
3. Extend `points.html` and in-app dashboards to surface `poolGross`, `poolReserve`, `pointValue`, and redemption availability so users see how buying score or staying subscribed grows the pot.
4. Wire subscription creation flows to tag `userPub` in Stripe metadata so recurring invoices can award monthly subscription bonuses automatically.
