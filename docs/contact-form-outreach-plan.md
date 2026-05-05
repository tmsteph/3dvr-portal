# Contact Form Outreach Plan

## Problem

Many crawled leads do not have direct email addresses. The current pipeline can find `mailto:` links, visible emails,
contact pages, and forms, but it stores every contact target in one CSV `contact` field. That makes a form URL look
like a usable contact even though `ask-send --auto` can only send to direct email.

Current behavior:

- `thomas-agent/node/lead-crawl.js` pulls website, email, and phone data from OpenStreetMap tags.
- `thomas-agent/node/lead-enrich.js` upgrades a lead to `mailto:...` when it finds an email.
- If no email is found, `lead-enrich.js` may store a contact page or form URL in `contact`.
- `thomas-agent/scripts/ask-send` opens email drafts for `mailto:` leads.
- For form/page leads, `ask-send` copies the message and opens the URL for manual submission.

Goal:

- Prefer real emails when available.
- Keep non-email contact routes usable instead of treating them as failures.
- Add a form-filling path that can submit or stage contact-form outreach with human approval.

## Guiding Rules

- Do not auto-submit arbitrary forms without an explicit operator action.
- Keep direct email as the highest-confidence path.
- Treat contact forms as a separate contact type, not as a fake email.
- Avoid burning leads with broken, duplicate, or spammy form submissions.
- Preserve the existing CSV workflow until a migration is justified.

## Phase 1: Make Lead Contact Type Explicit

Files:

- `thomas-agent/node/lead-enrich.js`
- `thomas-agent/scripts/ask-send`
- `test/outreach-message.test.js`

Change:

- Keep the current CSV header compatible, but encode contact type in `variant` when enrichment updates a row.
- Use stable variant tokens:
  - `email` when `contact` starts with `mailto:`
  - `form` when `contact` is a page with a detected form
  - `contact-page` when it is only a likely contact/about/booking page
  - `site` when no better route was found
- Update `ask-send` to print the route clearly:
  - `Route: email`
  - `Route: form`
  - `Route: contact-page`
  - `Route: site`
- If `--auto` is used on a non-email route, print the exact next command instead of only failing:
  - `ask-send --form "Lead Name"` once Phase 3 exists
  - Until then: `ask-send "Lead Name"` for manual form/page outreach

Acceptance criteria:

- `ask-enrich --dry-run` clearly shows whether each lead became email, form, contact-page, or site.
- `ask-send --dry-run` shows route type for a mailto lead and a form URL lead.
- Existing email draft tests still pass.

## Phase 2: Improve Email Discovery Before Using Forms

Files:

- `thomas-agent/node/lead-enrich.js`
- `test/lead-enrich.test.js` (new)

Change:

- Add unit-testable exports from `lead-enrich.js` behind `module.exports` while keeping CLI behavior.
- Improve email extraction:
  - Decode common obfuscations: `name [at] domain [dot] com`, `name (at) domain (dot) com`.
  - Decode percent-encoded and HTML entity `mailto:` values.
  - Ignore asset, analytics, framework, and placeholder emails.
  - Prefer domain-matching emails over third-party emails.
- Crawl more candidate pages before giving up:
  - `/contact`
  - `/contact-us`
  - `/about`
  - `/booking`
  - `/estimate`
  - `/quote`
  - `/consultation`
- Cap page fetches per lead with an env var:
  - `THREEDVR_ENRICH_MAX_PAGES=4`

Acceptance criteria:

- New tests cover visible emails, obfuscated emails, mailto links, skipped placeholder emails, and form fallback.
- Enrichment never overwrites a real `mailto:` contact with a weaker form/page route unless `--refresh --prefer-form`
  exists and is explicitly used.
- `npm test` passes.

## Phase 3: Add Manual Form Outreach Command

Files:

- `thomas-agent/scripts/ask-send`
- `thomas-agent/scripts/ask-form` (new)
- `thomas-agent/node/contact-form-fill.js` (new)
- `package.json`
- `README.md`
- `test/contact-form-fill.test.js` (new)

Recommended dependency:

- Add Playwright as an optional operator dependency only if needed:
  - `npm install playwright`
  - Keep browser install documented separately because Termux/native Android needs Debian `proot`.

Command shape:

```sh
ask-form "Business Name"
ask-form --dry-run "Business Name"
ask-form --submit "Business Name"
ask-send --form "Business Name"
```

Behavior:

- Load the selected lead from `THREEDVR_LEADS_FILE`.
- Build the same outreach message used by `ask-send`.
- Open the contact page in Playwright.
- Detect fields by label, placeholder, `name`, `id`, autocomplete, and textarea role.
- Fill only high-confidence fields:
  - name: `Thomas`
  - email: `3dvr.tech@gmail.com`
  - message: generated outreach body
  - company/business: `3DVR`
  - phone: leave blank unless configured with `THREEDVR_OUTREACH_PHONE`
- Stop before submission by default.
- Print a summary of filled fields and screenshot path.
- Submit only when `--submit` is explicitly passed.

Safety rules:

- Do not solve CAPTCHAs.
- Do not submit forms with password, payment, login, account creation, or file upload fields.
- Do not submit if required fields remain unknown.
- Do not submit if the form is hosted on a third-party lead aggregator unless the operator confirms.

Acceptance criteria:

- `ask-form --dry-run` can fill a local fixture form without network access.
- `ask-form --dry-run` writes a screenshot/artifact path.
- `ask-form --submit` submits only on a local test fixture.
- Real sites default to fill-and-review, not submit.

## Phase 4: Add Plugin/Adapter Boundary

Files:

- `thomas-agent/node/contact-form-fill.js`
- `thomas-agent/node/form-adapters/` (new)

Change:

- Keep the core command stable and put site-specific logic in adapters.
- Adapter interface:

```js
module.exports = {
  id: 'generic-html-form',
  canHandle({ pageUrl, html }) {},
  fill({ page, lead, message, operator }) {},
};
```

Initial adapters:

- `generic-html-form`
- `wordpress-contact-form-7`
- `wix-contact-form`
- `squarespace-form`

Acceptance criteria:

- Generic adapter works for plain HTML forms.
- Known builder adapters can be added without editing the command parser.
- Tests can run adapter selection without launching a real browser.

## Phase 5: Update Autopilot Routing

Files:

- `thomas-agent/node/autopilot.js`
- `README.md`

Change:

- Count routes separately:
  - `emailReady`
  - `formReady`
  - `pageOnly`
  - `unenriched`
- Auto-send only email leads unless a future `THREEDVR_AUTOPILOT_FORM_MODE=review` is configured.
- For form leads, produce an action list:
  - `ask-form "Lead Name"`
  - `ask-send "Lead Name"` as manual fallback

Acceptance criteria:

- Autopilot summary no longer treats form leads as email-ready.
- Operator email/report says how many leads need form review.
- No automatic form submissions occur from autopilot by default.

## Lesser-Model Execution Checklist

1. Start with Phase 1 only.
2. Run `npm test` in `/root/3dvr-agent`.
3. Do not add Playwright until Phase 1 and Phase 2 pass.
4. For Phase 2, write parser tests before changing extraction logic.
5. For Phase 3, build against local fixture HTML first.
6. Do not submit real contact forms in tests.
7. Keep every PR scoped to one phase.
8. If CI fails, inspect the exact assertion before changing feature behavior.

## Useful Manual Commands

```sh
cd /root/3dvr-agent
npm test
THREEDVR_LEADS_FILE=/tmp/leads.csv ask-crawl --location "La Mesa, CA" --category professional --limit 10 --dry-run
THREEDVR_LEADS_FILE=/tmp/leads.csv ask-enrich --limit 10 --dry-run
THREEDVR_LEADS_FILE=/tmp/leads.csv ask-send --dry-run "Business Name"
```

