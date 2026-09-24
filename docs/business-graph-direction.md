# 3DVR Business Graph direction

## Purpose

3DVR should help people and organizations understand what they can do, what they need, and who can help.

The Business Graph is the coordination layer behind that idea.

Instead of treating every discovered business as a disposable sales lead, the system builds a living, evidence-backed profile that can participate in a wider network of customers, suppliers, collaborators, tools, and opportunities.

The long-term loop is:

> observe → understand → connect → test → learn → improve

## The core model

Every business can have:

- **Identity** — name, website, location, category, public contacts.
- **Capabilities** — products, services, equipment, skills, infrastructure, or capacity the business can supply.
- **Needs** — problems, gaps, inputs, or opportunities the business may need help with.
- **Evidence** — public sources that support factual claims.
- **Hypotheses** — cautious inferred needs that are labeled as inference, carry confidence, and are never presented as fact.
- **Relationships** — customers, suppliers, partners, contractors, referrals, and other useful connections.
- **Actions** — the smallest useful next step.
- **Outcomes** — what happened after a recommendation, introduction, experiment, or sale.
- **Corrections** — changes supplied by the business or discovered through better evidence.

A business can be both a buyer and a supplier at the same time.

## Why this changes outreach

Traditional lead generation asks:

> Who might buy what we sell?

The Business Graph asks:

> What is happening inside this business, what would help, and who is best positioned to provide it?

Sometimes that provider is 3DVR. Sometimes it is another business. Sometimes the correct action is to learn more and do nothing yet.

That makes outreach a research and coordination activity instead of a volume-only sales funnel.

## Current pipeline

The working path is:

> Lead Finder → Lead Vault → Need Radar → Campaign review → CRM → outcomes

Lead Finder gathers public evidence and produces a lightweight profile.

Lead Vault preserves the profile and lifecycle without pretending that a discovered business is already a relationship.

Need Radar aggregates repeated needs across businesses so patterns can become market intelligence.

Campaigns uses the evidence to prepare reply-first outreach.

CRM receives the profile when a real interaction begins.

## Matching layer

Capabilities and needs form the first useful edges in the graph.

A need such as:

> booking automation

can be compared against supplier capabilities such as:

> booking automation  
> calendar integration  
> CRM implementation

The system can then surface candidate providers.

Matches are suggestions, not guarantees. They should retain the supporting capability, match score, source, and business identity so a human or later validation step can inspect them.

## Meta-analysis

Individual profiles become more valuable when aggregated.

Repeated needs can reveal:

- services worth offering
- missing local suppliers
- referral opportunities
- software worth building
- common operational bottlenecks
- training needs
- infrastructure gaps
- underserved industries

The system should favor repeated, evidence-backed signals over one-off speculation.

## Decision rule: build, supply, connect, or learn

For each meaningful need, ask in order:

1. **Can an existing business already solve this well?** Connect them.
2. **Can 3DVR solve it efficiently with an existing capability?** Supply it.
3. **Is this a repeated unmet need?** Consider building a reusable product, service, or open-source tool.
4. **Is the evidence weak?** Learn more before acting.

This keeps 3DVR from trying to become every business itself.

## Evidence and privacy rules

The graph must distinguish:

- verified public facts
- attributed claims
- inferred hypotheses
- private relationship data

Inferred needs must carry evidence and confidence and must never be converted into factual outreach claims.

Anonymous prospect data remains local unless the user explicitly promotes or exports it.

Private CRM data, messages, account information, and internal notes do not become part of a public graph by default.

Businesses should eventually be able to claim, correct, enrich, or remove public profile information where appropriate.

## Positive-sum direction

The desired outcome is not merely higher conversion.

The system should help route useful work toward capable people and organizations, expose unmet demand, reduce duplicated effort, and make it easier for small businesses to cooperate.

The graph becomes more useful as participants contribute better information and successful outcomes.

## Near-term roadmap

### Now

- enrich every discovered lead with capabilities, needs, evidence, confidence, recommended action, and solution route
- aggregate repeated needs in Campaigns
- preserve business intelligence through Lead Vault and CRM
- match public business needs against public business capabilities

### Next

- create durable supplier/capability profiles
- store candidate need → provider edges
- expose graph matches in the portal
- record accepted, rejected, and successful matches
- learn which capabilities actually solve which needs
- add business claim/correction workflows

### Later

- regional and industry-level Need Radar
- supplier discovery beyond the current lead batch
- automatic referral opportunities with approval boundaries
- product opportunity detection from repeated unmet needs
- open protocols so other systems can participate in the graph

## North star

> Map what people and organizations can do. Map what they need. Connect the two intelligently, transparently, and in ways that create more capability for everyone.
