# Revenue System Handoff

Updated: 2026-07-25

This is the durable recovery note for moving the 3DVR revenue work to another
platform or a fresh agent context.

## Canonical code and documents

- Repository: `tmsteph/3dvr-portal`
- Production branch: `main`
- Revenue operating plan: `docs/revenue-operating-system-2026-07-25.md`
- Research queue: `docs/revenue-targets-2026-07-24.md`
- A/V profile: `ops/control-plane/home/AV-RESUME.md`
- Computer-science profile: `ops/control-plane/home/CS-RESUME.md`
- CRM/outreach handoff: `docs/clipboard-notes-crm-sync-handoff.md`

## Live assets

- Main portal: https://portal.3dvr.tech
- Growth Desk: https://portal.3dvr.tech/growth-desk/
- Growth Operator: https://portal.3dvr.tech/growth-operator/
- CRM: https://portal.3dvr.tech/crm/
- A/V career site: https://thomas-av.3dvr.tech
- CS career site: https://thomas-cs.3dvr.tech
- New-business launch offer: https://portal.3dvr.tech/new-business-launch/
- Technical systems offer: https://portal.3dvr.tech/technical-systems/
- Field-guide blog: https://portal.3dvr.tech/blog/

## Business lanes

1. A/V employment and freelance coverage for immediate cash: A1/audio lead
   first, V1/video operations second, and technical coordination/event-technology
   project-management roles third.
2. Career and project leverage: prove the Career Launch workflow on Thomas's
   own search before expanding it into a broader product that helps others
   advance their careers and start small projects.
3. 3DVR launch subscriptions for recurring revenue.
4. Technical systems support for diagnostics, fixed sprints, and retainers.

The verified A/V and CS resumes are downloadable from their respective career
sites. Do not invent credentials, dates, employers, rates, or project claims.

## Automation and safety state

- Direct-email outreach is logged to the canonical CRM with contact, exact
  message body, campaign, variant, timestamp, delivery status, reply, and
  follow-up.
- Deduplication uses email, site, then name.
- Commercial sending is limited to Monday-Friday, 8:30 AM-4:30 PM
  America/Los_Angeles.
- Campaigns use daily and total caps; forms, applications, social DMs, and
  page-only leads remain review-only.
- Weekly field-guide mail is consent-only, includes unsubscribe support, and
  has duplicate-send protection. It runs Mondays during Pacific business
  hours; the last recorded subscriber count was zero.

## Important truth to preserve

Deployment is not the same as a merged Git change. Before claiming a change is
complete, check `git status`, `git log origin/main`, and the live URL. The Gun
runtime cache under `radata/` is local operational data, not the canonical CRM
backup; CRM records live in the configured Gun relay and the portal CRM sync.
Do not commit the cache blindly.

## First recovery checks

```sh
git fetch origin --prune
git status --short --branch
git log --oneline --decorate -10 origin/main
npm test -- apps/agent/test/revenue-ops.test.js apps/agent/test/crm-sync.test.js
```
