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

## Individual source verification (2026-10-20)

These source URLs were checked at topic level. They remain **unconfirmed open opportunities**; no contact has been made, no CRM import has been performed, and no budget or authority has been inferred.

| Prospect / buyer signal | Original post | Why it fits | Next step |
|---|---|---|---|
| technaros, small AI consulting firm | https://community.n8n.io/t/seeking-a-reliable-n8n-developer-for-ongoing-project-based-work-build-maintain/296828 | Contracts for tested, documented n8n workflows in staging; recurring relationship possible | Check latest replies and confirm open before a helpful DM |
| Emma_Clark, growing internal automation team | https://community.n8n.io/t/looking-to-hire-n8n-developers-for-ongoing-automation-projects-what-should-i-look-for/294759 | CRM sync, lead routing, error handling and workflow architecture | Answer her vetting question substantively, not a hard pitch |
| Jyotirmoy_Das, freelancer/automation builder search | https://community.n8n.io/t/looking-for-an-n8n-freelancer-automation-builder/316359 | API, WhatsApp and LLM workflows; paid trial possible | Verify open, gather portfolio examples before DM |
| Nico_RevOps, sales tech agency | https://community.n8n.io/t/hiring-sales-tech-automation-specialist-ongoing-remote-work-crm-databases/300286 | CRM, databases, webhooks and ongoing maintenance | Check current status and time commitment |
| Nikolaos_Zissidis, e-commerce video automation | https://community.n8n.io/t/hiring-n8n-automation-specialist-paid-long-term-remote-e-commerce-shopify/284836 | Video/audio domain knowledge plus n8n, AI APIs | Check whether project still open |

### Drafts for approval (do not send)

**technaros**: “Hi, I saw your post about staging-first n8n delivery. I work on self-hosted automation and reliability, and I appreciate the separation of test credentials from production. Are you still looking for someone to take on a bounded, documented workflow project? Happy to share a relevant example.”

**Emma_Clark**: “For n8n vetting, I'd look for a candidate who can demonstrate retries, idempotency, failure alerts, and a staging-to-production handoff—not just screenshots of successful runs. I'm building those practices into my own automation work. Which part of your CRM and lead-routing stack is causing the most trouble?”

**Jyotirmoy_Das**: “Hi, I saw your n8n builder search. My background combines API integrations, self-hosted infrastructure, and AI workflows. Are you still evaluating people for the small paid test? I can share a specific example and discuss a tightly scoped deliverable.”

Do not imply these messages have been delivered. Verify availability, deduplicate against private records, then request approval before sending.
