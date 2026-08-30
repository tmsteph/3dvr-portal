# 3DVR Growth Plan — Passion to Income

## North star

Help someone discover what they care about, turn it into something useful, earn their first small amount of money, and gradually automate the boring work around the skills they enjoy.

The child-simple flow:

**What sounds fun? → Who could this help? → Want to try making your first $20?**

Then:

**Discover yourself → Help someone → Make $20 → Make $100 → Get a repeat customer → Automate what works.**

## Product flow

1. **Discover** — ask simple questions about interests, strengths, frustrations, and what people already ask for.
2. **First useful project** — Launch Room turns a vague interest into one tiny project or service.
3. **First money** — pick a simple money path, find up to 10 relevant prospects, prepare specific outreach, and track replies.
4. **Delivery** — turn the first yes into a clear checklist and useful result.
5. **Learn** — record what people responded to and what worked.
6. **Repeat** — move from first $20 to first $100 to a repeat customer.
7. **Automate** — automate research, outreach, scheduling, intake, follow-up, website generation, invoicing, and CRM while the person keeps doing the work they enjoy.

## Current build

- Growth Operator has five guided campaign presets: **AV Freelance, Web Design, Lead Generation, Market Research, My Own Skill**.
- AV Freelance targets production companies, AV vendors, venues, hotels, event agencies, and labor providers that book freelancers.
- My Own Skill reads saved Launch Room context so purpose can flow directly into a money experiment.
- Campaigns reuse the existing CRM, Growth Operator, outreach pipeline, and autopilot instead of creating parallel systems.
- Working branch: `codex/growth-campaign-presets-20260825`.
- Not merged or deployed yet.

## Immediate next engineering steps

- Finish the Portal homepage bridge: **Find my path → Make money → Build something**.
- Restore direct Growth Operator discoverability from the homepage.
- Run targeted tests and mobile user-testing for all five presets.
- Verify switching presets never overwrites manual user edits.
- Open one focused PR once green.
- Deploy deliberately to avoid unnecessary Vercel builds.
- User-test the live Portal after merge.

## Next product improvements

- Make sender identity and approved sender email user-specific instead of hardcoded to 3DVR.
- Let Lead Finder accept a campaign and preconfigure its research.
- Add simple metrics: researched, qualified, drafted, sent, replied, booked/paid.
- Add a first-$20 milestone and guided progress loop.
- Connect Web Design campaigns to verified public website problems and honest concept previews.
- Keep moving toward one guided flow instead of a collection of disconnected apps.

## AV freelancer campaign

- Let users choose roles such as A1, A2, video, LED, projection, breakout, general technician, or other specialties.
- Capture location/market, travel radius, day rate/minimum, availability, skills, credentials, gear, and portfolio/resume links.
- Target staffing coordinators, labor coordinators, production managers, technical directors, venue AV managers, and other public business contacts.
- Use public listings only; never guess names, emails, phone numbers, or business facts.

## Auto-development experiment loop

- Treat customer behavior as the deciding signal for low-risk product changes.
- Assign visitors deterministically so the same person keeps seeing the same variant until a winner is promoted.
- Use Gun at `3dvr-portal/growth/experiments/<experiment>/...` as the shared event/config source of truth.
- Compare unique visitors, not raw repeated clicks. Require minimum sample size, minimum conversions, meaningful lift, and a statistical confidence threshold before promotion.
- Auto-promote only allowlisted low-risk classes such as copy, layout, CTA wording, and discovery flows. Pricing, billing, privacy, auth, security, legal, or destructive changes require explicit review.
- Optimize for the deepest reliable customer outcome available. Revenue/paid conversion beats qualified leads, which beat activation, which beat engagement.
- First live reusable experiment: `av-freelance-hero`, optimizing visits from the AV Freelance Launchpad into the free Work Agent. The existing daily growth cron evaluates it alongside the homepage experiment.

## Product principles

- A third grader should understand the next action.
- Start with helping someone, not “starting a business.”
- Prefer the smallest real experiment over planning.
- Use public, verifiable information for outreach.
- No mass-email blasts, fake personalization, invented contact data, or guaranteed results.
- Let automation handle boring coordination; let people keep the human work they enjoy.
- Reuse the unified CRM and outreach system instead of adding duplicate systems.
- Open source should make the whole path easier to copy, improve, and own.
