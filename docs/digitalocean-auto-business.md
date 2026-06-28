# DigitalOcean Revenue Engine

This is the unattended money loop for 3DVR. It runs on the DigitalOcean server a few times per day, looks for demand, creates offers, criticizes weak assumptions, publishes or prepares revenue assets, and sends eligible outbound when configured.

The point is speed: ship more offers, test more markets, and create more chances for a buyer to raise their hand without waiting for manual planning.

This is not only a Forge loop. Forge Sprint is one offer the machine can sell, but the engine starts with market selection and research. The market decides the offer.

## Operating Goal

Make the server do the boring business work every day:

- Find painful markets.
- Turn signals into concrete offers.
- Push the best offer toward a checkout or sales conversation.
- Draft and optionally publish Facebook Page market probes.
- Send direct messages to eligible business contacts.
- Report what happened and what to try next.
- Keep a ledger so each run compounds instead of starting over.

The default posture is aggressive iteration with controlled downside. Take risk on markets, offers, positioning, and outreach volume. Do not take dumb risk on sender reputation, opt-outs, account bans, or missing audit trails.

## Daily Loop

- Picks a rotating target market unless `AUTO_BUSINESS_MARKET` is set.
- Runs the Money Printer supervisor with bounded green auto-approval.
- Runs Market Pulse research and writes the latest market directory data.
- Runs Money Autopilot to find demand, draft an offer, and optionally publish an offer page.
- Builds a selected-market research summary with candidates, top opportunity, and next research questions.
- Drafts Facebook Page market probes from the selected market and top opportunity.
- Criticizes the strongest signal, weakest assumption, likely failure mode, and next money move.
- Writes `.money-printer/reports/auto-business-latest.json`.
- Emails the owner report when mail credentials are configured.
- Optionally sends a small number of eligible outreach emails from an explicit contacts file.

## Hard Lines

The system is allowed to be commercially assertive. It is not allowed to be sloppy.

- No sends without a working sender identity, physical address, and opt-out path.
- No sends to suppressed, unsubscribed, or malformed addresses.
- No sends to contacts that lack the metadata required by the selected outreach mode.
- No money movement, DNS changes, data deletion, or production merges.
- No account-token writes unless the relevant env flag is explicitly enabled.

That is not caution for its own sake. It keeps the machine alive long enough to learn.

## Install On The Droplet

Use the same checkout path as the Money Printer supervisor:

```bash
cd ~/projects/3dvr-portal
git pull
npm install
npm run money-printer -- init
```

Create or edit the private env file:

```bash
mkdir -p ~/.config/3dvr
nano ~/.config/3dvr/money-printer.env
chmod 600 ~/.config/3dvr/money-printer.env
```

Example env:

```bash
AUTO_BUSINESS_AI=true
AUTO_BUSINESS_EMAIL_REPORTS=true
AUTO_BUSINESS_OWNER_EMAIL=you@example.com
AUTO_BUSINESS_MARKETS=local home service businesses with quote follow-up leaks,freelancers trying to turn inquiries into paid projects,creators launching paid pages and apps
AUTO_BUSINESS_KEYWORDS=lead follow up,quote follow-up,client onboarding,website launch help,crm setup
AUTO_BUSINESS_CHANNELS=reddit,hackernews,linkedin,email
AUTO_BUSINESS_WEEKLY_BUDGET=150
AUTO_BUSINESS_EXECUTE_APPROVED=true
AUTO_BUSINESS_AUTO_APPROVE_GREEN=true

MONEY_PRINTER_AI_MODE=openai
OPENAI_API_KEY=

GITHUB_TOKEN=
GITHUB_OWNER=tmsteph
GITHUB_REPO=3dvr-portal
MONEY_PRINTER_LIVE_CONNECTORS=true
MONEY_PRINTER_ALLOW_GITHUB_WRITE=true
MONEY_PRINTER_AUTO_APPROVE_GREEN=true
MONEY_PRINTER_AUTO_APPROVE_MAX=3

MONEY_AUTOPILOT_PUBLISH=false
MONEY_AUTOPILOT_GH_TOKEN=
MONEY_AUTOPILOT_GH_REPO=tmsteph/3dvr-portal
MONEY_AUTOPILOT_GH_BRANCH=main
MONEY_AUTOPILOT_CHECKOUT_URL=https://portal.3dvr.tech/sign-in.html?redirect=%2Fbilling%2F%3Fplan%3Dpro

GROWTH_GUN_PEERS=https://relay.3dvr.tech/gun

META_PAGE_ID=
META_PAGE_ACCESS_TOKEN=
META_GRAPH_API_VERSION=v24.0
AUTO_BUSINESS_FACEBOOK_QUEUE_ENABLED=true
AUTO_BUSINESS_FACEBOOK_AUTO_APPROVE=true
AUTO_BUSINESS_FACEBOOK_RUN_WORKER=true
AUTO_BUSINESS_FACEBOOK_DRY_RUN=false
AUTO_BUSINESS_FACEBOOK_LIMIT=1
AUTO_BUSINESS_FACEBOOK_LINK=https://portal.3dvr.tech/forge/

GMAIL_USER=
GMAIL_APP_PASSWORD=
# Or use SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE.

AUTO_BUSINESS_OUTREACH_ENABLED=true
AUTO_BUSINESS_OUTREACH_MODE=compliant-b2b
AUTO_BUSINESS_CONTACTS_FILE=/home/YOUR_USER/.config/3dvr/outreach-contacts.csv
AUTO_BUSINESS_SUPPRESSION_FILE=/home/YOUR_USER/.config/3dvr/outreach-suppression.csv
AUTO_BUSINESS_OUTREACH_DAILY_LIMIT=15
AUTO_BUSINESS_OUTREACH_MAX_CAP=50
AUTO_BUSINESS_LEGAL_NAME=3DVR
AUTO_BUSINESS_PHYSICAL_ADDRESS=
AUTO_BUSINESS_UNSUBSCRIBE_EMAIL=
AUTO_BUSINESS_UNSUBSCRIBE_URL=
```

Run one cycle:

```bash
npm run money-printer:auto-business
cat .money-printer/reports/auto-business-latest.json
```

## Install The Timer

```bash
mkdir -p ~/.config/systemd/user
cp ops/systemd/auto-business.service ~/.config/systemd/user/
cp ops/systemd/auto-business.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now auto-business.timer
sudo loginctl enable-linger "$USER"
```

Check it:

```bash
systemctl --user list-timers auto-business.timer
journalctl --user -u auto-business.service -n 100 --no-pager
cat ~/projects/3dvr-portal/.money-printer/reports/auto-business-latest.json
```

The timer runs at 08:17, 14:17, and 20:17 server time, with `Persistent=true` so missed runs execute after the droplet is back online.

## Market Selection

If `AUTO_BUSINESS_MARKET` is set, the runner starts there. If not, it rotates through `AUTO_BUSINESS_MARKETS` every 8-hour slot. Autopilot can still discover a stronger market from demand signals and report it as `marketResearch.selectedMarket`.

Good first markets for 3DVR right now:

- Local home service businesses losing quotes and follow-up.
- Freelancers and small agencies with inconsistent inquiry-to-project flow.
- Creators who need a paid launch page, simple CRM, and follow-up.
- Small studios, stage/event vendors, and production teams that need booking or project follow-up.

The report should show:

- selected market
- candidate markets
- top opportunity
- evidence signals
- Facebook Page job drafts
- next money move

## Facebook Page Market Probes

Do not automate the Android Facebook app or a personal profile session. That is brittle and risks losing the account. Use a Facebook Page controlled by 3DVR and publish through Meta Graph API from the server.

The auto-business runner can now:

- Draft Page posts from the selected market.
- Queue those jobs into the existing Gun-backed Meta Market worker.
- Mark jobs approved when `AUTO_BUSINESS_FACEBOOK_AUTO_APPROVE=true`.
- Run the Meta worker immediately when `AUTO_BUSINESS_FACEBOOK_RUN_WORKER=true`.
- Let the worker publish approved Page jobs and measure reactions, comments, shares, clicks, impressions, and engaged users.

Required server env:

```bash
META_PAGE_ID=
META_PAGE_ACCESS_TOKEN=
META_GRAPH_API_VERSION=v24.0

AUTO_BUSINESS_FACEBOOK_QUEUE_ENABLED=true
AUTO_BUSINESS_FACEBOOK_AUTO_APPROVE=true
AUTO_BUSINESS_FACEBOOK_RUN_WORKER=true
AUTO_BUSINESS_FACEBOOK_DRY_RUN=false
AUTO_BUSINESS_FACEBOOK_LIMIT=1
AUTO_BUSINESS_FACEBOOK_LINK=https://portal.3dvr.tech/forge/
```

Meta app/Page setup usually needs a Page access token with permissions for Page listing, engagement reading, post publishing, and insights. The repo keeps tokens server-side only.

Use Facebook for market probes, not just promo. Good post shape:

- Ask one real pain question to a specific market.
- Name the workflow breakage.
- Mention the tested offer lightly.
- Point to the current best link.
- Judge success by comments, clicks, DMs, calls, signups, and CRM handoffs.

## Outbound Modes

Use `warm` when you only want to contact people already connected to 3DVR:

```csv
email,name,company,optIn,source,recipientType,legalBasis,country
person@example.com,Pat,Pat Studio,true,warm,,,
customer@example.com,Sam,Sam Services,false,customer,,,
```

Warm mode accepts contacts where `optIn=true` or `source` is one of:

```text
warm, manual, customer, subscriber, inbound, referral
```

Use `compliant-b2b` when you want the machine doing real outbound to US business contacts. Every row must carry provenance and basis metadata:

```csv
email,name,company,optIn,source,recipientType,legalBasis,country
owner@company.com,Alex,Company,false,public-business,business,can-spam-b2b,US
ops@studio.com,Jordan,Studio,false,manual-research,role,direct-business-interest,US
```

The row passes when all of these are true:

- `country` is US.
- `recipientType` is `business`, `corporate`, `company`, `role`, or `work`.
- `source` is `public-business`, `business-directory`, `manual-research`, `event`, `conference`, or `linkedin`.
- `legalBasis` is `can-spam-b2b`, `us-b2b-commercial`, `public-business-contact`, or `direct-business-interest`.
- `AUTO_BUSINESS_PHYSICAL_ADDRESS` is set.
- `AUTO_BUSINESS_UNSUBSCRIBE_EMAIL` or `AUTO_BUSINESS_UNSUBSCRIBE_URL` is set.

Each sent email is deduped in `.money-printer/outreach-ledger.json`, and the runner waits 30 days before emailing the same address again.

Suppression is file-backed. Add opt-outs, STOP replies, and do-not-contact addresses to:

```bash
~/.config/3dvr/outreach-suppression.csv
```

One email per line is enough.

## Risk Ladder

Start with enough volume to learn. Raise the cap when the signal is clean.

```bash
# Probe
AUTO_BUSINESS_OUTREACH_DAILY_LIMIT=10
AUTO_BUSINESS_OUTREACH_MAX_CAP=25

# Push
AUTO_BUSINESS_OUTREACH_DAILY_LIMIT=25
AUTO_BUSINESS_OUTREACH_MAX_CAP=50

# Scale only after replies or booked calls
AUTO_BUSINESS_OUTREACH_DAILY_LIMIT=50
AUTO_BUSINESS_OUTREACH_MAX_CAP=100
```

Move up the ladder when:

- Bounce rate is low.
- No meaningful spam complaints are visible.
- The offer gets replies, clicks, or calls.
- The same pain repeats across multiple prospects.

Move down or change market when:

- Nobody replies after a few cycles.
- Replies say the pain is wrong.
- The audience is too broad.
- The sender reputation starts degrading.

Risk belongs in the experiment. Do not keep sending weak copy to a weak list just because the machine can.

## Contact Sourcing

Feed the runner business contacts with provenance. Good rows are specific and explain why the contact belongs in the test.

Acceptable sources for `compliant-b2b`:

- Public business websites.
- Public business directories.
- Manual research.
- Conferences or events.
- LinkedIn business profiles.
- Existing business conversations.

Bad input creates bad output. Do not dump random consumer emails into the file. The runner will reject most of them, and the rest would damage the sender.

## Offer Bias

The server should bias toward offers that can create money this week:

- Forge Sprint setup.
- Landing page plus CRM follow-up.
- Quote follow-up cleanup.
- Creator launch page.
- One-week project validation.

The generated report should answer one question: what can be sold or tested next?

## Credential Links

- OpenAI API keys: https://platform.openai.com/api-keys
- Gmail app passwords: https://support.google.com/accounts/answer/185833
- GitHub personal access tokens: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- Vercel account tokens: https://vercel.com/docs/accounts/create-a-token
- Stripe Checkout links: https://docs.stripe.com/payment-links
- FTC CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- ICO direct marketing guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/

If owner email and mail credentials are present, each report email includes the missing credential list and the exact env variable names still needed.
