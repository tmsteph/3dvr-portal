import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createTrialHandler } from '../api/trial.js';
import { createCleaningRateLimiter } from '../src/cleaning-network/service.js';

const baseConfig = {
  STRIPE_SECRET_KEY: 'sk_test_key',
  STRIPE_PRICE_ID: 'price_123',
  GMAIL_USER: 'bot@example.com',
  GMAIL_APP_PASSWORD: 'app_password',
  CLEANING_PREVIEW_SECRET: 'preview_secret_for_tests',
  OPERATOR_EMAIL_TO: 'operator@example.com',
  CLEANING_SMS_ENABLED: 'false',
};

function createMockStripe() {
  return {
    customers: { list: mock.fn(), create: mock.fn() },
    subscriptions: { list: mock.fn(), create: mock.fn() },
  };
}

function createMailTransport() {
  return { sendMail: mock.fn(async () => ({})) };
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
}

function createHandler(overrides = {}) {
  return createTrialHandler({
    stripeClient: overrides.stripeClient || createMockStripe(),
    mailTransport: overrides.mailTransport || createMailTransport(),
    config: overrides.config || baseConfig,
    idFactory: overrides.idFactory || (() => 'ABC-123-XYZ'),
    now: overrides.now || (() => new Date('2026-09-06T22:00:00.000Z')),
    cleaningRateLimiter: overrides.cleaningRateLimiter,
    cleaningSmsSender: overrides.cleaningSmsSender,
  });
}

describe('cleaning network', () => {
  it('returns only safe public fields for a configured partner profile', async () => {
    const handler = createHandler({
      config: {
        ...baseConfig,
        CLEANING_PARTNERS_JSON: JSON.stringify({
          'crew-one': {
            name: 'Crew One Cleaning',
            intro: 'Homes and turnovers.',
            serviceArea: 'San Diego',
            publicPhone: '(619) 555-0100',
            website: 'https://crew.example.com',
            logoUrl: 'https://crew.example.com/logo.png',
            accent: '#245c45',
            accentDark: '#163c2d',
            email: 'private-routing@example.com',
          },
        }),
      },
    });
    const res = createMockRes();
    await handler({ method: 'GET', query: { kind: 'cleaning-partner', partner: 'crew-one' }, body: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.partner, 'crew-one');
    assert.equal(res.body.name, 'Crew One Cleaning');
    assert.equal(res.body.configured, true);
    assert.equal(res.body.serviceArea, 'San Diego');
    assert.equal(res.body.logoUrl, 'https://crew.example.com/logo.png');
    assert.equal(res.body.accent, '#245c45');
    assert.equal(res.body.accentDark, '#163c2d');
    assert.equal('email' in res.body, false);
    assert.equal(JSON.stringify(res.body).includes('private-routing@example.com'), false);
  });

  it('falls unknown partner slugs back to the network instead of spoofing a brand', async () => {
    const handler = createHandler();
    const res = createMockRes();
    await handler({ method: 'GET', query: { kind: 'cleaning-partner', partner: 'made-up-company' }, body: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.partner, 'network');
    assert.equal(res.body.name, 'Cleaning Network');
    assert.equal(res.body.configured, false);
  });

  it('routes a rich lead to its partner and archives a copy for the operator', async () => {
    const stripe = createMockStripe();
    const mailTransport = createMailTransport();
    const handler = createHandler({
      stripeClient: stripe,
      mailTransport,
      config: {
        ...baseConfig,
        CLEANING_PARTNERS_JSON: JSON.stringify({
          'crew-one': { name: 'Crew One Cleaning', email: 'crew@example.com', serviceArea: 'San Diego' },
        }),
      },
    });
    const res = createMockRes();
    await handler({
      method: 'POST', headers: { 'x-forwarded-for': '203.0.113.7' }, body: {
        kind: 'cleaning-lead', partner: 'crew-one', name: 'Taylor Homeowner', email: 'taylor@example.com', phone: '555-0199',
        address: '123 Test St', postalCode: '92101', serviceType: 'Home cleaning', propertyType: 'Apartment', bedrooms: '2', bathrooms: '1',
        squareFeet: '900', preferredDate: '2026-09-10', frequency: 'Every two weeks', pets: 'Small dog', notes: 'Focus on kitchen.',
        utmSource: 'whatsapp', utmCampaign: 'esai-roommate', pageUrl: 'https://portal.3dvr.tech/cleaning-network/?partner=crew-one&token=do-not-store', referrer: 'https://example.org/referral?secret=drop-me#frag',
      },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, requestId: 'cln_abc123xyz', partner: 'crew-one', partnerName: 'Crew One Cleaning', confirmationEmailSent: true, smsConfirmationSent: false });
    assert.equal(stripe.customers.list.mock.calls.length, 0);
    assert.equal(mailTransport.sendMail.mock.calls.length, 2);
    const message = mailTransport.sendMail.mock.calls[0].arguments[0];
    assert.equal(message.to, 'crew@example.com');
    assert.equal(message.bcc, 'operator@example.com');
    assert.equal(message.replyTo, 'taylor@example.com');
    assert.match(message.subject, /cln_abc123xyz/);
    assert.match(message.text, /123 Test St/);
    assert.match(message.text, /"utmSource": "whatsapp"/);
    assert.match(message.text, /"pageUrl": "https:\/\/portal\.3dvr\.tech\/cleaning-network\/"/);
    assert.match(message.text, /"referrer": "https:\/\/example\.org\/referral"/);
    assert.equal(message.text.includes('do-not-store'), false);
    assert.equal(message.text.includes('drop-me'), false);
    assert.equal(message.headers['X-3DVR-Request-ID'], 'cln_abc123xyz');
    const confirmation = mailTransport.sendMail.mock.calls[1].arguments[0];
    assert.equal(confirmation.to, 'taylor@example.com');
    assert.equal(confirmation.replyTo, 'bot@example.com');
    assert.match(confirmation.subject, /We received your cleaning request/);
    assert.match(confirmation.text, /Reference: cln_abc123xyz/);
    assert.match(confirmation.text, /No payment has been taken/);
  });

  it('keeps a private archive copy in the configured Gmail inbox when no operator override exists', async () => {
    const mailTransport = createMailTransport();
    const handler = createHandler({
      mailTransport,
      config: {
        ...baseConfig,
        OPERATOR_EMAIL_TO: undefined,
        CLEANING_PARTNERS_JSON: JSON.stringify({ 'crew-one': { name: 'Crew One', email: 'crew@example.com' } }),
      },
    });
    const res = createMockRes();
    await handler({ method: 'POST', body: { kind: 'cleaning-lead', partner: 'crew-one', name: 'Morgan', phone: '555', postalCode: '92014', serviceType: 'Home cleaning' } }, res);
    assert.equal(res.statusCode, 200);
    const message = mailTransport.sendMail.mock.calls[0].arguments[0];
    assert.equal(message.to, 'crew@example.com');
    assert.equal(message.bcc, 'bot@example.com');
  });

  it('accepts phone-only contact details and keeps the lead in the operator inbox', async () => {
    const mailTransport = createMailTransport();
    const handler = createHandler({ mailTransport });
    const res = createMockRes();
    await handler({ method: 'POST', body: { kind: 'cleaning-lead', name: 'Morgan', phone: '555-0112', postalCode: '92014', serviceType: 'Move in / move out' } }, res);
    assert.equal(res.statusCode, 200);
    const message = mailTransport.sendMail.mock.calls[0].arguments[0];
    assert.equal(message.to, 'operator@example.com');
    assert.equal(message.bcc, undefined);
    assert.equal(message.replyTo, 'bot@example.com');
  });

  it('sends a best-effort SMS confirmation when a phone number is supplied', async () => {
    const mailTransport = createMailTransport();
    const smsSender = mock.fn(async payload => ({ attempted: true, sent: true, payload }));
    const handler = createHandler({ mailTransport, cleaningSmsSender: smsSender });
    const res = createMockRes();
    await handler({ method: 'POST', body: {
      kind: 'cleaning-lead', name: 'Morgan', email: 'morgan@example.com', phone: '+16195550112',
      postalCode: '92014', serviceType: 'Move in / move out',
    } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.confirmationEmailSent, true);
    assert.equal(res.body.smsConfirmationSent, true);
    assert.equal(smsSender.mock.calls.length, 1);
    const sms = smsSender.mock.calls[0].arguments[0];
    assert.equal(sms.phone, '+16195550112');
    assert.match(sms.message, /cln_abc123xyz/);
    assert.match(sms.message, /No payment taken/);
  });

  it('rejects incomplete and malformed cleaning leads without sending mail', async () => {
    const mailTransport = createMailTransport();
    const handler = createHandler({ mailTransport });
    const incomplete = createMockRes();
    await handler({ method: 'POST', body: { kind: 'cleaning-lead', name: 'Morgan' } }, incomplete);
    assert.equal(incomplete.statusCode, 400);
    const badDate = createMockRes();
    await handler({ method: 'POST', body: { kind: 'cleaning-lead', name: 'Morgan', phone: '555', postalCode: '92014', serviceType: 'Home cleaning', preferredDate: '2026-02-31' } }, badDate);
    assert.equal(badDate.statusCode, 400);
    assert.equal(mailTransport.sendMail.mock.calls.length, 0);
  });

  it('silently drops honeypot spam', async () => {
    const mailTransport = createMailTransport();
    const handler = createHandler({ mailTransport });
    const res = createMockRes();
    await handler({ method: 'POST', body: { kind: 'cleaning-lead', companyWebsite: 'https://spam.example' } }, res);
    assert.deepEqual(res.body, { success: true });
    assert.equal(mailTransport.sendMail.mock.calls.length, 0);
  });

  it('rate-limits repeated submissions from the same address', async () => {
    let stamp = 1000;
    const rateLimiter = createCleaningRateLimiter({ limit: 1, windowMs: 60000, nowMs: () => stamp });
    const handler = createHandler({ cleaningRateLimiter: rateLimiter });
    const body = { kind: 'cleaning-lead', name: 'Morgan', phone: '555', postalCode: '92014', serviceType: 'Home cleaning' };
    const first = createMockRes();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.2' }, body }, first);
    assert.equal(first.statusCode, 200);
    stamp += 1;
    const second = createMockRes();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.2' }, body }, second);
    assert.equal(second.statusCode, 429);
    assert.ok(Number(second.headers['Retry-After']) >= 1);
  });

  it('creates a signed branded preview during cleaner onboarding', async () => {
    const mailTransport = createMailTransport();
    const handler = createHandler({ mailTransport });
    const submitted = createMockRes();
    await handler({ method: 'POST', body: {
      kind: 'cleaning-partner-interest', companyName: 'Sparkle Co', contactName: 'Alex', email: 'alex@sparkle.example',
      serviceArea: 'San Diego County', desiredSlug: 'sparkle-co', services: 'Homes, Turnovers',
    } }, submitted);
    assert.equal(submitted.statusCode, 200);
    assert.match(submitted.body.previewUrl, /^https:\/\/portal\.3dvr\.tech\/cleaning-network\/\?preview=/);

    const previewToken = new URL(submitted.body.previewUrl).searchParams.get('preview');
    const preview = createMockRes();
    await handler({ method: 'GET', query: { kind: 'cleaning-preview', token: previewToken }, body: {} }, preview);
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.body.name, 'Sparkle Co');
    assert.equal(preview.body.partner, 'sparkle-co');
    assert.deepEqual(preview.body.services, ['Homes', 'Turnovers']);
    assert.equal(preview.body.preview, true);
    assert.equal('email' in preview.body, false);
  });

  it('rejects tampered cleaner preview links', async () => {
    const handler = createHandler();
    const preview = createMockRes();
    await handler({ method: 'GET', query: { kind: 'cleaning-preview', token: 'tampered.payload' }, body: {} }, preview);
    assert.equal(preview.statusCode, 400);
  });

  it('keeps preview-page leads in the operator inbox until routing is approved', async () => {
    const mailTransport = createMailTransport();
    const handler = createHandler({
      mailTransport,
      config: {
        ...baseConfig,
        CLEANING_PARTNERS_JSON: JSON.stringify({ 'crew-one': { name: 'Crew One', email: 'crew@example.com' } }),
      },
    });
    const submitted = createMockRes();
    await handler({ method: 'POST', body: {
      kind: 'cleaning-partner-interest', companyName: 'Sparkle Co', contactName: 'Alex', email: 'alex@sparkle.example',
      serviceArea: 'San Diego County', desiredSlug: 'sparkle-co',
    } }, submitted);
    const previewToken = new URL(submitted.body.previewUrl).searchParams.get('preview');

    const lead = createMockRes();
    await handler({ method: 'POST', body: {
      kind: 'cleaning-lead', previewToken, partner: 'crew-one', name: 'Taylor', phone: '555-0102',
      postalCode: '92101', serviceType: 'Home cleaning',
    } }, lead);
    assert.equal(lead.statusCode, 200);
    assert.equal(lead.body.partner, 'network');
    const message = mailTransport.sendMail.mock.calls[1].arguments[0];
    assert.equal(message.to, 'operator@example.com');
    assert.match(message.text, /Partner: Sparkle Co/);
    assert.match(message.text, /Preview partner: sparkle-co/);
  });

  it('captures cleaning-company onboarding separately from customer leads', async () => {
    const mailTransport = createMailTransport();
    const handler = createHandler({ mailTransport });
    const res = createMockRes();
    await handler({ method: 'POST', body: {
      kind: 'cleaning-partner-interest', companyName: 'Sparkle Co', contactName: 'Alex', email: 'alex@sparkle.example', phone: '555-0133',
      serviceArea: 'San Diego County', currentWebsite: 'https://sparkle.example', desiredSlug: 'sparkle-co', notes: 'We outsource overflow jobs.',
    } }, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.requestId, 'clp_abc123xyz');
    assert.match(res.body.previewUrl, /^https:\/\/portal\.3dvr\.tech\/cleaning-network\/\?preview=/);
    const message = mailTransport.sendMail.mock.calls[0].arguments[0];
    assert.equal(message.to, 'operator@example.com');
    assert.equal(message.replyTo, 'alex@sparkle.example');
    assert.match(message.subject, /Cleaning Partner/);
    assert.match(message.text, /"desiredSlug": "sparkle-co"/);
  });

  it('marks only strong BANT cleaning partners as qualified', async () => {
    const mailTransport = createMailTransport();
    const handler = createHandler({ mailTransport });
    const res = createMockRes();
    await handler({ method: 'POST', body: {
      kind: 'cleaning-partner-interest', companyName: 'Growth Clean', contactName: 'Casey', email: 'casey@growth.example',
      serviceArea: 'San Diego County', budget: '2500-plus', authority: 'owner', need: 'more-leads', timing: '30-days',
      utmSource: 'meta', utmCampaign: 'cleaning-growth', pageUrl: 'https://portal.3dvr.tech/cleaning-network/?utm_source=meta',
    } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.qualified, true);
    assert.equal(res.body.qualificationScore, 4);
    const message = mailTransport.sendMail.mock.calls[0].arguments[0];
    assert.match(message.subject, /QUALIFIED Cleaning Partner/);
    assert.equal(message.headers['X-3DVR-Qualification'], 'qualified');
    assert.match(message.text, /"budget": "2500-plus"/);
    assert.match(message.text, /"utmCampaign": "cleaning-growth"/);
  });

  it('requires meaningful partner onboarding details', async () => {
    const mailTransport = createMailTransport();
    const handler = createHandler({ mailTransport });
    const res = createMockRes();
    await handler({ method: 'POST', body: { kind: 'cleaning-partner-interest', companyName: 'Sparkle Co' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(mailTransport.sendMail.mock.calls.length, 0);
  });
});
