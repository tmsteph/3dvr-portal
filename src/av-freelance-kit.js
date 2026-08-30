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
Hey [Name] — I’m opening up more freelance availability for [role]. If you need another solid [A1/A2/V1/etc.] in [city], I’d love to work together. My current day rate is [rate]. Happy to send availability anytime.

PRODUCTION COMPANY
Hi [Name/Team] — I’m a freelance [role] based in [city] with experience in [2–3 relevant areas]. I’d like to join your technician pool. My current day rate is [rate]. Portfolio/resume: [link]. Thanks — [name]

REFERRAL ASK
Hey [Name] — I’m building more independent [role] work this year. If you hear of a production company that needs someone reliable in [city/region], I’d appreciate an introduction. No pressure at all.

AVAILABILITY NOTE
Hey [Name] — I have availability on [dates] for [role]. If anything comes up, feel free to keep me in mind. Rate: [rate].

SIMPLE FOLLOW-UP
Hey [Name] — quick follow-up in case this got buried. I still have availability for [dates] and would be glad to help with [role]. No pressure if you’re covered.

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

function paymentLinkId(session) {
  return typeof session?.payment_link === 'string'
    ? session.payment_link
    : session?.payment_link?.id || '';
}

function sendAsset(res, filename, content, type = 'text/plain; charset=utf-8') {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(content);
}

function renderKit(sessionId) {
  const sid = encodeURIComponent(sessionId);
  const base = `/api/av-freelance-kit?session_id=${sid}`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#07111f"><title>AV Freelancer Starter Kit | 3DVR</title><link rel="stylesheet" href="/styles/global.css"><link rel="stylesheet" href="/av-freelance/styles.css"></head>
<body class="theme-dark freelance-page"><div class="freelance-shell"><header class="freelance-nav"><a class="brand-link" href="/">3DVR</a><nav><a href="/av-freelance/">AV Freelance Launchpad</a></nav></header><main>
<section class="hero"><p class="eyebrow">Payment verified</p><h1>AV Freelancer Starter Kit</h1><p class="hero-copy">Your paid checkout is verified. Download the working templates below and keep this purchase link bookmarked.</p><div class="hero-actions"><a class="button button--primary" href="${base}&asset=rate-card">Rate card CSV</a><a class="button" href="${base}&asset=outreach">Outreach scripts</a><a class="button" href="${base}&asset=show-day">Show-day checklist</a></div></section>
<section class="path"><div class="section-heading"><p class="eyebrow">30-day transition</p><h2>Build a runway, not a dramatic exit.</h2></div><ol class="path-list"><li><span class="step">Week 1</span><div><h3>Package yourself</h3><p>Pick one primary role, your target/minimum rates, a short bio, and one portfolio link.</p></div></li><li><span class="step">Week 2</span><div><h3>Reconnect</h3><p>Use the scripts with people who already know your work before doing cold outreach.</p></div></li><li><span class="step">Week 3</span><div><h3>Run one independent job</h3><p>Confirm the scope in writing, do the work, invoice within 24 hours, and follow up.</p></div></li><li><span class="step">Week 4</span><div><h3>Measure repeatability</h3><p>Track repeat clients, booked days, average rate, and cash actually collected.</p></div></li></ol></section>
<section class="path"><div class="section-heading"><p class="eyebrow">The rule</p><h2>One good client beats 100 cold leads.</h2><p>Be reliable, technically sharp, easy to communicate with, and clear about money. The asset is a small network that trusts you enough to call again.</p><p class="hero-note">Educational only; no income guarantee or legal, tax, insurance, or accounting advice.</p></div></section>
</main><footer><span>3DVR.Tech — Build the future together.</span><a href="mailto:3dvr.tech@gmail.com">Support</a></footer></div></body></html>`;
}

export function createAvFreelanceKitHandler({ stripeClient, config = process.env } = {}) {
  return async function avFreelanceKitHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const sessionId = String(req.query?.session_id || '').trim();
    if (!/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
      return res.status(401).send('A valid paid checkout session is required.');
    }

    const secret = String(config.STRIPE_SECRET_KEY || '').trim();
    const stripe = stripeClient || (secret ? new Stripe(secret, { apiVersion: '2023-10-16' }) : null);
    if (!stripe) return res.status(503).send('Payment verification is temporarily unavailable.');

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const expectedLink = String(config.STRIPE_AV_FREELANCER_KIT_PAYMENT_LINK_ID || LIVE_PAYMENT_LINK_ID).trim();
      const valid = session.status === 'complete'
        && session.payment_status === 'paid'
        && paymentLinkId(session) === expectedLink
        && session.metadata?.offer === EXPECTED_OFFER;
      if (!valid) return res.status(403).send('This checkout session does not unlock the AV Freelancer Starter Kit.');

      const asset = String(req.query?.asset || '').trim();
      if (asset === 'rate-card') return sendAsset(res, '3dvr-av-freelancer-rate-card.csv', RATE_CARD, 'text/csv; charset=utf-8');
      if (asset === 'outreach') return sendAsset(res, '3dvr-av-freelancer-outreach-scripts.txt', OUTREACH_SCRIPTS);
      if (asset === 'show-day') return sendAsset(res, '3dvr-av-freelancer-show-day-checklist.txt', SHOW_DAY);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(renderKit(sessionId));
    } catch (error) {
      if (error?.type === 'StripeInvalidRequestError') return res.status(401).send('Invalid or expired checkout session.');
      console.error('AV freelancer kit verification failed', error);
      return res.status(500).send('Unable to verify this purchase right now.');
    }
  };
}
