# Operator prospect discovery — initial verified source queue

Date: 2026-10-20. Research only. Do not send outreach without human approval. Do not touch Tom's infrastructure.

The following are **source-verified job signals**, not confirmed qualified leads. Check each original post for availability, geography, budget and contact channel before importing into the private funnel. Do not store prospect personal data in this public repo.

| Candidate | Source | Fit | Verification needed |
|---|---|---|---|
| Paid n8n QA and stress testing | https://community.n8n.io/c/jobs/13 | Reliability testing and monitoring | Original post, buyer identity, status, budget |
| Reliable n8n developer, ongoing maintenance | https://community.n8n.io/c/jobs/13 | Maintenance and incident prevention | Original post, current opening and rate |
| Shopify tracking + n8n, $35/hr + revenue share | https://community.n8n.io/c/jobs/13 | Integrations, recurring work | Original post, scope and economics |
| n8n/GHL insurance lead pipeline | https://community.n8n.io/c/jobs/13 | Lead capture, workflows, operations | Original post, access and budget |
| Restaurant tech startup automation engineer | https://community.n8n.io/c/jobs/13 | Vertical integrations and monitoring | Original post, contract conditions |
| Small RFQ-to-quote prototype | https://community.n8n.io/c/jobs/13 | Bounded paid automation prototype | Original post and budget |
| Household CTO: n8n, Notion, local LLM | https://community.n8n.io/c/jobs/13?page=1 | Self-hosted personal AI systems | Original post and location requirements |
| Two-way Craft/Todoist sync | https://community.n8n.io/c/jobs/13?page=1 | Bounded API integration | Original post and whether still open |
| Small paid SME automations, Singapore | https://community.n8n.io/c/jobs/13 | Repeatable service work | Geography and eligibility |
| AI automation workflow, flat fee | https://community.n8n.io/c/jobs/13 | Starter fixed-price engagement | Original post, scope, budget |

## Next safe execution
1. Fetch individual original posts, filter closed/paused listings and verify eligibility.
2. Deduplicate against private automation funnel on OVH; do not seed unverified candidates as qualified.
3. Import only verified buyer records via the authenticated funnel interface; no secrets in GitHub.
4. Prepare three personal, helpful drafts; hold for approval.
5. Log discovery time, source, and next action; do not auto-send.

Existing code: `scripts/growth/collect-automation-buyers.mjs`, `docs/automation-funnel.md`, `growth-desk/funnel.js`, and `src/lead-finder/api.js`. Reuse these, not a new CRM.
