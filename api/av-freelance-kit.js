import Stripe from 'stripe';

const LIVE_PAYMENT_LINK_ID = 'plink_1U9xAhGiUl5dM378LijLTpW0';
const EXPECTED_OFFER = 'av_freelancer_starter_kit';

const RATE_CARD = `item,value,notes
Primary role,,Example: A1 / A2 / V1 / RF / Comms
Home market,,City / region
Target day rate,,Your normal quote
Minimum acceptable rate,,Use intentionally, not automatically
Walk-away rate,,Below this, decline unless there is a strategic reason
Standard day length,,Example: 10 hours
Overtime starts after,,Confirm client policy before booking
Overtime rate,,Example structure only: 1.5x effective hourly rate
Travel time policy,,Paid / unpaid / case-by-case
Parking policy,,Client-provided or reimbursed
Per diem policy,,If applicable
Gear rate,,Only when providing your own equipment
Cancellation policy,,Write it down before you need it
Invoice terms,,Example: Net 15 / Net 30
Payment methods,,ACH / check / card / other
Portfolio or resume URL,,One link that is easy to send
`;

const OUTREACH_SCRIPTS = `3DVR AV FREELANCER STARTER KIT — OUTREACH SCRIPTS

WARM CONTACT
Hey [Name] — I’m opening up a little more freelance availability for [role]. If you ever need another solid [A1/A2/V1/etc.] in [city], I’d love to work together. My current day rate is [rate]. Happy to send availability anytime.

PRODUCTION COMPANY
Hi [Name/Team] — I’m a freelance [role] based in [city] with experience in [2–3 relevant areas]. I’m taking on more independent show work and would like to get into your technician pool. My current day rate is [rate]. Portfolio/resume: [link]. Thanks — [name]

REFERRAL ASK
Hey [Name] — I’m building a little more independent [role] work this year. If you hear of a production company that needs someone reliable in [city/region], I’d appreciate an introduction. No pressure at all.

AVAILABILITY NOTE
Hey [Name] — I have availability on [dates] for [role]. If anything comes up, feel free to keep me in mind. Rate: [rate].

SIMPLE FOLLOW-UP
Hey [Name] — quick follow-up in case this got buried. I still have some availability for [month/date range] and would be glad to help with [role]. No pressure if you’re covered.

POST-GIG THANK YOU
Thanks again for having me on [show/event]. I enjoyed working with the team. Feel free to keep me in mind whenever you need [role] again.

RULES
- Personalize the first sentence.
- Prefer people who already know your work.
- Do not mass-send identical messages.
- Give one clear role, market, rate, and link.
- Follow up once, then move on unless they engage.
`;

const SHOW_DAY = `3DVR AV FREELANCER STARTER KIT — SHOW-DAY CHECKLIST

BEFORE LEAVING
[ ] Confirm venue and call time
[ ] Confirm role and client contact
[ ] Confirm parking/load-in instructions
[ ] Charge phone / radios / personal tools
[ ] Bring required PPE and credentials

AT CALL
[ ] Check in with lead / PM
[ ] Confirm chain of command and comms
[ ] Confirm show-ready deadline
[ ] Confirm system scope and handoff expectations
[ ] Note important patching, IPs, RF coordination, file versions, or settings

BEFORE SHOW
[ ] Test your signal path end to end
[ ] Verify backups / spares where practical
[ ] Confirm the operator / lead knows current status

END OF DAY
[ ] Confirm you are released before leaving
[ ] Confirm next call if multi-day
[ ] Record overtime / reimbursable expenses
[ ] Confirm invoice destination
[ ] Send invoice within 24 hours unless instructed otherwise
[ ] Send a short thank-you

REHIRE RULE
Be technically sharp, calm under pressure, easy to communicate with, and clear about money.
`;

function textAsset(res, filename, content, contentType = 'text/plain; charset=utf-8') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(content);
}

function paymentLinkId(session) {
  if (typeof session?.payment_link === 'string') return session.payment_link;
  return session?.payment_link?.id || '';
}

function kitHtml(sessionId) {
  const sid = encodeURIComponent(sessionId);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#07111f"><title>AV Freelancer Starter Kit | 3DVR</title><link rel="stylesheet" href="/styles/global.css"><link rel="stylesheet" href="/av-freelance/styles.css"><style>.kit-intro{min-height:auto}.kit-section{padding:clamp(1.5rem,5vw,4.25rem);border:1px solid var(--surface-border);border-radius:28px;background:linear-gradient(145deg,rgba(14,35,59,.88),rgba(4,12,22,.9))}.kit-list{display:grid;gap:.7rem;padding-left:1.25rem;color:var(--text-muted)}.kit-list strong{color:var(--text-main)}.script{margin:1rem 0 0;padding:1rem;border:1px solid rgba(125,211,252,.16);border-radius:16px;background:rgba(2,9,17,.45);color:var(--text-muted);white-space:pre-wrap}.download-row{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.25rem}.formula{padding:1rem;border-left:3px solid var(--accent);background:rgba(125,211,252,.07);color:var(--text-main)}</style></head>
<body class="theme-dark freelance-page"><div class="freelance-shell"><header class="freelance-nav"><a class="brand-link" href="/">3DVR</a><nav><a href="/av-freelance/">AV Freelance Launchpad</a></nav></header><main>
<section class="hero kit-intro"><p class="eyebrow">Payment verified</p><h1>AV Freelancer Starter Kit</h1><p class="hero-copy">Keep this purchase link bookmarked. Your downloads are verified against the paid Stripe checkout session.</p><div class="download-row"><a class="button button--primary" href="/api/av-freelance-kit?session_id=${sid}&asset=rate-card">Download rate card</a><a class="button" href="/api/av-freelance-kit?session_id=${sid}&asset=outreach">Outreach scripts</a><a class="button" href="/api/av-freelance-kit?session_id=${sid}&asset=show-day">Show-day checklist</a></div></section>
<section class="kit-section"><p class="eyebrow">01 — Price the work</p><h2>Set a rate you can defend.</h2><p class="formula"><strong>Target day rate = (annual income goal + business overhead + tax/buffer) ÷ realistic billable days.</strong></p><ul class="kit-list"><li>Choose one primary role you want people to call you for.</li><li>Write down your <strong>target rate</strong>, <strong>minimum acceptable rate</strong>, and <strong>walk-away rate</strong>.</li><li>Define expected hours, overtime, travel, parking, per diem, gear, and cancellation terms.</li><li>Quote the job, not your old hourly wage; freelance pricing must cover gaps, admin, taxes, insurance, and equipment.</li></ul></section>
<section class="kit-section"><p class="eyebrow">02 — Get called</p><h2>Use short, human outreach.</h2><p class="script"><strong>Warm contact</strong>\nHey [Name] — I’m opening up a little more freelance availability for [role]. If you ever need another solid [A1/A2/V1/etc.] in [city], I’d love to work together. My current day rate is [rate]. Happy to send availability anytime.</p><p class="script"><strong>Production company</strong>\nHi [Name/Team] — I’m a freelance [role] based in [city] with experience in [2–3 relevant areas]. I’d like to get into your technician pool. My current day rate is [rate]. Portfolio/resume: [link].</p><p class="script"><strong>Follow-up</strong>\nHey [Name] — quick follow-up in case this got buried. I still have availability for [dates] and would be glad to help with [role]. No pressure if you’re covered.</p></section>
<section class="kit-section"><p class="eyebrow">03 — Before saying yes</p><h2>Confirm the job in writing.</h2><ul class="kit-list"><li><strong>Role:</strong> exact responsibility.</li><li><strong>Date:</strong> call time, expected end, load-out.</li><li><strong>Rate:</strong> minimum call, overtime, travel, parking, per diem, gear.</li><li><strong>Location:</strong> venue, loading, parking, credentials.</li><li><strong>Client contact:</strong> show-day name and mobile.</li><li><strong>Payment:</strong> invoice recipient, PO/vendor requirements, terms.</li></ul></section>
<section class="kit-section"><p class="eyebrow">04 — Run the show</p><h2>Make yourself easy to rehire.</h2><ul class="kit-list"><li>Arrive early enough to solve access and gear surprises before call time.</li><li>Confirm chain of command, communications, and the show-ready deadline.</li><li>Document important settings, patching, frequencies, IPs, or file versions for your role.</li><li>Before leaving, confirm release and where the invoice goes.</li><li>Send a short thank-you and keep the relationship alive without pestering people.</li></ul></section>
<section class="kit-section"><p class="eyebrow">05 — Close the loop</p><h2>Invoice fast. Track every job.</h2><ul class="kit-list"><li>Invoice within 24 hours unless told otherwise.</li><li>Include invoice number, date, client, job, agreed rate, overtime/expenses, total, and payment instructions.</li><li>Track booked date, client, role, rate, invoice date, due date, paid date, and whether you would work together again.</li><li>Do not confuse booked revenue with cash received.</li></ul></section>
<section class="kit-section"><p class="eyebrow">06 — 30-day transition</p><h2>Build a runway, not a dramatic exit.</h2><ol class="path-list"><li><span class="step">Week 1</span><div><h3>Package yourself</h3><p>Choose your lane, rate, short bio, and one link.</p></div></li><li><span class="step">Week 2</span><div><h3>Reconnect</h3><p>Message people who already know your work.</p></div></li><li><span class="step">Week 3</span><div><h3>Take one independent job</h3><p>Confirm, work, invoice, follow up, record.</p></div></li><li><span class="step">Week 4</span><div><h3>Measure repeatability</h3><p>Count repeat clients, booked days, average rate, and cash collected.</p></div></li></ol></section>
<section class="kit-section"><p class="eyebrow">The rule</p><h2>One good client is worth more than 100 cold leads.</h2><p class="hero-copy">Be reliable, easy to work with, technically sharp, and clear about money. The compounding asset is a small network of people who trust you enough to call again.</p><p class="hero-note">Educational only; no income guarantee or legal, tax, insurance, or accounting advice.</p></section>
</main><footer><span>3DVR.Tech — Build the future together.</span><a href="mailto:3dvr.tech@gmail.com">Support</a></footer></div></body></html>`;
}

export function createAvFreelanceKitHandler({ stripeClient, config = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const sessionId = String(req.query?.session_id || '').trim();
    if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
      return res.status(401).send('A valid paid checkout session is required.');
    }

    const secretKey = String(config.STRIPE_SECRET_KEY || '').trim();
    const stripe = stripeClient || (secretKey ? new Stripe(secretKey, { apiVersion: '2023-10-16' }) : null);
    if (!stripe) return res.status(503).send('Payment verification is temporarily unavailable.');

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const expectedLink = String(config.STRIPE_AV_FREELANCER_KIT_PAYMENT_LINK_ID || LIVE_PAYMENT_LINK_ID).trim();
      const validPurchase = session.status === 'complete'
        && session.payment_status === 'paid'
        && paymentLinkId(session) === expectedLink
        && session.metadata?.offer === EXPECTED_OFFER;
      if (!validPurchase) return res.status(403).send('This checkout session does not unlock the AV Freelancer Starter Kit.');

      const asset = String(req.query?.asset || '').trim();
      if (asset === 'rate-card') return textAsset(res, '3dvr-av-freelancer-rate-card.csv', RATE_CARD, 'text/csv; charset=utf-8');
      if (asset === 'outreach') return textAsset(res, '3dvr-av-freelancer-outreach-scripts.txt', OUTREACH_SCRIPTS);
      if (asset === 'show-day') return textAsset(res, '3dvr-av-freelancer-show-day-checklist.txt', SHOW_DAY);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(kitHtml(sessionId));
    } catch (error) {
      if (error?.type === 'StripeInvalidRequestError') return res.status(401).send('Invalid or expired checkout session.');
      console.error('AV freelancer kit verification failed', error);
      return res.status(500).send('Unable to verify this purchase right now.');
    }
  };
}

export default createAvFreelanceKitHandler();
