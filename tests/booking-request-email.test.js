import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createBookingRequestHandler } from '../api/calendar/booking-request.js';

const ORIGIN = 'https://sd-day-traders.3dvr.tech';
const config = {
  GMAIL_USER: 'bot@example.com',
  GMAIL_APP_PASSWORD: 'app-password',
};

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
}

function transport() {
  return {
    sendMail: mock.fn(async (message) => ({ messageId: message.messageId || '<generated@example.com>' })),
  };
}

function request(overrides = {}) {
  const { headers = {}, body = {}, ...rest } = overrides;
  return {
    method: 'POST',
    ...rest,
    headers: {
      origin: ORIGIN,
      'idempotency-key': 'booking-test-1234567890',
      ...headers,
    },
    body: {
      name: 'Release Test',
      email: 'customer@example.com',
      topic: 'Chart review',
      date: '2026-09-02',
      time: '10:30',
      timeZone: 'America/New_York',
      summary: '1:30 PM local · 10:30 AM PT',
      ...body,
    },
  };
}

describe('SD Day Traders booking request email', () => {
  it('rejects requests from any origin except the live SD Day Traders site', async () => {
    const mail = transport();
    const handler = createBookingRequestHandler({ config, mailTransport: mail });
    const res = response();
    await handler(request({ headers: { origin: 'https://evil.example', 'idempotency-key': 'booking-test-1234567890' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(mail.sendMail.mock.calls.length, 0);
  });

  it('requires an idempotency key', async () => {
    const mail = transport();
    const handler = createBookingRequestHandler({ config, mailTransport: mail });
    const res = response();
    await handler(request({ headers: { origin: ORIGIN, 'idempotency-key': '' } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(mail.sendMail.mock.calls.length, 0);
  });

  it('silently accepts honeypot spam without sending mail', async () => {
    const mail = transport();
    const handler = createBookingRequestHandler({ config, mailTransport: mail });
    const res = response();
    await handler(request({ body: { website: 'spam.example' } }), res);
    assert.equal(res.statusCode, 202);
    assert.equal(mail.sendMail.mock.calls.length, 0);
  });

  it('sends only to fixed Esai organizer and the validated customer', async () => {
    const mail = transport();
    const handler = createBookingRequestHandler({ config, mailTransport: mail });
    const res = response();
    await handler(request({ body: { to: 'attacker@example.com' } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.pending, true);
    assert.equal(mail.sendMail.mock.calls.length, 2);

    const organizer = mail.sendMail.mock.calls[0].arguments[0];
    assert.equal(organizer.to, 'gamboaesai@gmail.com');
    assert.equal(organizer.replyTo, 'customer@example.com');
    assert.match(organizer.text, /not a confirmed appointment/i);
    assert.doesNotMatch(organizer.text, /attacker@example\.com/);

    const customer = mail.sendMail.mock.calls[1].arguments[0];
    assert.equal(customer.to, 'customer@example.com');
    assert.equal(customer.replyTo, 'gamboaesai@gmail.com');
    assert.match(customer.text, /do not need to send another email/i);
    assert.match(customer.text, /before the appointment is confirmed/i);
  });

  it('treats organizer delivery as required but customer acknowledgement as a warning', async () => {
    const mail = {
      sendMail: mock.fn(async (message) => {
        if (message.to === 'customer@example.com') throw new Error('customer mailbox unavailable');
        return { messageId: '<organizer@example.com>' };
      }),
    };
    const handler = createBookingRequestHandler({ config, mailTransport: mail });
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.warnings, ['customer_ack_failed']);

    const failMail = { sendMail: mock.fn(async () => { throw new Error('organizer down'); }) };
    const failHandler = createBookingRequestHandler({ config, mailTransport: failMail });
    const failRes = response();
    await failHandler(request(), failRes);
    assert.equal(failRes.statusCode, 500);
  });
});
