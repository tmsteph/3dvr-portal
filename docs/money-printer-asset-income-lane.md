# Money Printer: Asset Income Lane

## Why this exists

Money Printer already models the service/business loop well:

> Demand → offer → customer → workforce → delivery → reputation → better demand data

There is a second legitimate path that should not be forced into a client-service model:

> Skill or insight → reusable asset → distribution → many small purchases → feedback → better asset

Examples include digital templates, presets, sound packs, small software utilities, paid datasets, educational assets, niche tools, serialized media, and other products that can be sold repeatedly without custom work for each buyer.

This lane is not "passive income." The work moves upstream into creation, packaging, distribution, support, experimentation, and portfolio management.

## Core principle

3DVR should help a person build **income-producing systems around what they already know**, not merely teach a fashionable "high-income skill."

A $5 asset sold 500 times can be more useful than a $2,500 custom project if it compounds, teaches us about a market, and creates reusable distribution.

Money Printer should therefore support a portfolio of small, cheap-to-test assets alongside services and SaaS products.

## Asset Capsule

Use the existing Venture Capsule as the canonical container. An asset-oriented capsule should additionally record:

- `revenueModel`: `one_time`, `subscription`, `usage`, `marketplace_royalty`, `pay_per_use`, or `hybrid`
- `distributionChannel`: first-party store, marketplace, app store, content platform, affiliate channel, partner channel, or other approved channel
- `unitPriceCents`
- `estimatedUnitCostCents`
- `creationCostCents`
- `supportCostEstimateCents`
- `unitsSold`
- `grossRevenueCents`
- `refundsCents`
- `platformFeesCents`
- `conversionRate`
- `trafficOrImpressions`
- `repeatPurchaseRate`
- `ownedAudienceCaptured`
- `platformDependencyScore`

These fields should remain optional so service experiments do not become more complicated.

## Portfolio strategy

Discovery can remain broad while execution stays bounded by the existing Venture Capsule portfolio limits.

The system should continuously generate and evaluate many possible capsules, but only spend meaningful attention on a small number at once. Most capsules should die cheaply. Winners earn deeper automation and distribution.

A useful default portfolio has three lanes:

1. **Cash lane** — near-term services or contracts that can generate money quickly.
2. **Asset lane** — reusable low-ticket or recurring products with asymmetric upside.
3. **Infrastructure lane** — capabilities that make future capsules cheaper to launch, fulfill, measure, and support.

The goal is not to maximize the number of businesses. The goal is to maximize the number of **cheap, measurable shots on goal** while preserving focus.

## Evaluation

Asset experiments should be judged by realized economics and learning, not vanity metrics.

Primary metrics:

- time to first dollar
- contribution margin after platform fees and support
- revenue per hour of ongoing maintenance
- conversion rate
- repeat purchase or retention
- evidence of organic distribution
- customer-support burden
- portability of the audience/customer relationship
- reuse of code, content, workflow, or distribution in future capsules

An asset with modest revenue can still be valuable when it creates reusable distribution or substantially lowers the cost of later experiments.

## Platform dependence

Marketplace and algorithmic distribution can be powerful, but they are rented land.

The preferred progression is:

> Use external distribution → validate demand → earn trust → capture permitted first-party relationships → diversify channels → reduce platform dependency

Money Printer should never assume a platform will continue distributing an asset at the same rate. Each capsule should have a platform-dependency score and an exit/diversification path when traction becomes meaningful.

## First 3DVR candidate capsules

These are hypotheses, not commitments. Money Printer should validate them against real demand before substantial build work.

### 1. AV Booking Agent

- Revenue model: subscription
- Target: freelance and union AV technicians
- Starting price hypothesis: $20/month
- Product: schedule ingestion, availability synchronization, job/opportunity tracking, and bounded booking-agent assistance
- Advantage: directly connected to workflows 3DVR is already building
- Success condition: one paid user outside the founder account, then retention through a full booking cycle

### 2. AV Workflow Micro-Tools

- Revenue model: one-time or low-cost subscription
- Target: technicians who do not want a full booking agent
- Possible assets: rate/day calculators, availability templates, job packet generators, show-file checklists, invoice/COI helpers, and portable profile kits
- Success condition: first independent purchase plus evidence that one tool leads users toward the larger booking product

### 3. Audio Creator Assets

- Revenue model: one-time marketplace/direct sales
- Target: musicians, producers, and live-audio creators
- Possible assets: original preset banks, sound-design tools, templates, signal-flow utilities, educational packs, or small open-source tools with paid convenience/support
- Success condition: first five paid units with low support burden

### 4. Automation Starter Kits

- Revenue model: one-time product with optional support/subscription
- Target: freelancers and very small businesses that want practical AI/automation without a custom consulting engagement
- Product: narrow, installable workflows with documentation and a clear outcome
- Success condition: one template sells repeatedly without custom implementation being required for every buyer

### 5. 3DVR Infrastructure as a Product

- Revenue model: subscription/managed service
- Target: people who want their own portable personal AI/booking/organizing agent
- Product: hosted 3DVR Agent with clear limits, user-owned data/export, and a path to self-host
- Success condition: one non-founder user pays for a managed instance and completes onboarding without founder intervention

## Immediate implementation work

1. Extend the Venture Capsule schema with optional revenue-model and distribution fields.
2. Add asset economics to portfolio summaries without changing service experiments.
3. Add an `asset` experiment kind to Opportunity Engine / Money Printer.
4. Let Market Pulse create asset hypotheses from repeated problems, search demand, marketplace gaps, and first-party user requests.
5. Add explicit kill conditions for low-ticket assets so experiments do not linger because creation was emotionally expensive.
6. Track owned-vs-rented distribution and customer portability.
7. Keep external publishing, spend, and new-account creation behind the existing approval gates.

## Operating rule

Money Printer should always be able to answer:

> What is the cheapest useful thing we can create or sell this week that teaches us something and could earn again without repeating all of the work?

That question belongs beside the existing question:

> Who has a real problem we can genuinely help solve right now?

Together they give 3DVR both immediate cash flow and compounding leverage.
