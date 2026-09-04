import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGE_PAYMENT_URL,
  buildChallengeEmail,
  createChallengeHandler,
  normalizeChallengeSubmission
} from '../src/challenge/api.js';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; }
  };
}

function successfulAiResponse() {
  return {
    ok: true,
    async json() {
      return {
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: 'What I see\nA manual bottleneck.\n\nSmallest useful fix\nUse one intake sheet.\n\nTry this now\nCreate three columns.\n\nWhat 3DVR could automate next\nSync the intake.' }]
        }]
      };
    }
  };
}

test('normalizes a challenge submission', () => {
  assert.deepEqual(normalizeChallengeSubmission({
    name: '  Rosa’s Garden Care  ',
    email: 'ROSA@EXAMPLE.COM',
    problem: 'Every Friday I copy bookings into a spreadsheet by hand.'
  }), {
    name: 'Rosa’s Garden Care',
    email: 'rosa@example.com',
    problem: 'Every Friday I copy bookings into a spreadsheet by hand.'
  });
});

test('challenge email delivers value before optional dollar ask', () => {
  const message = buildChallengeEmail({
    name: 'Rosa',
    problem: 'I lose customer follow-ups.',
    solution: 'What I see\nYour follow-ups need one list.\n\nSmallest useful fix\nUse a simple three-column tracker.'
  });

  assert.match(message.text, /smallest useful fix/i);
  assert.match(message.text, /If this genuinely helped/);
  assert.ok(message.text.indexOf('smallest useful fix') < message.text.indexOf('If this genuinely helped'));
  assert.match(message.text, new RegExp(CHALLENGE_PAYMENT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('handler generates and emails the challenge response', async () => {
  let requestUrl = '';
  let requestBody = null;
  let sentMessage = null;

  const fetchImpl = async (url, init) => {
    requestUrl = url;
    requestBody = JSON.parse(init.body);
    return successfulAiResponse();
  };

  const mailTransport = {
    async sendMail(message) {
      sentMessage = message;
      return { messageId: 'message-123', accepted: [message.to] };
    }
  };

  const handler = createChallengeHandler({
    fetchImpl,
    mailTransport,
    config: {
      OPENAI_API_KEY: 'test-key',
      GMAIL_USER: '3dvr@example.com',
      GMAIL_APP_PASSWORD: 'test-pass'
    }
  });
  const res = createResponse();

  await handler({
    method: 'POST',
    body: {
      name: 'Rosa’s Garden Care',
      email: 'rosa@example.com',
      problem: 'Every Friday I manually copy bookings from email into a spreadsheet.'
    }
  }, res);

  assert.equal(requestUrl, 'https://api.openai.com/v1/responses');
  assert.match(requestBody.input, /Rosa’s Garden Care/);
  assert.equal(sentMessage.to, 'rosa@example.com');
  assert.match(sentMessage.text, /one intake sheet/i);
  assert.match(sentMessage.text, /send \$1/i);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    delivered: true,
    model: 'gpt-5.4-mini',
    messageId: 'message-123'
  });
});

test('handler rejects invalid submissions without calling AI or email', async () => {
  let called = false;
  const handler = createChallengeHandler({
    fetchImpl: async () => { called = true; },
    mailTransport: { async sendMail() { called = true; } },
    config: { OPENAI_API_KEY: 'test-key', GMAIL_USER: '3dvr@example.com', GMAIL_APP_PASSWORD: 'test-pass' }
  });
  const res = createResponse();

  await handler({ method: 'POST', body: { name: '', email: 'bad', problem: 'short' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test('handler rate limits repeated requests before spending on AI', async () => {
  let aiCalls = 0;
  let mailCalls = 0;
  const handler = createChallengeHandler({
    fetchImpl: async () => {
      aiCalls += 1;
      return successfulAiResponse();
    },
    mailTransport: {
      async sendMail(message) {
        mailCalls += 1;
        return { messageId: `message-${mailCalls}`, accepted: [message.to] };
      }
    },
    maxPerHour: 1,
    now: () => 1_800_000_000_000,
    config: { OPENAI_API_KEY: 'test-key', GMAIL_USER: '3dvr@example.com', GMAIL_APP_PASSWORD: 'test-pass' }
  });
  const request = {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.42' },
    body: {
      name: 'Rosa’s Garden Care',
      email: 'rosa@example.com',
      problem: 'Every Friday I manually copy bookings from email into a spreadsheet.'
    }
  };

  const first = createResponse();
  await handler(request, first);
  const second = createResponse();
  await handler(request, second);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 429);
  assert.equal(second.headers['X-RateLimit-Remaining'], '0');
  assert.ok(Number(second.headers['Retry-After']) > 0);
  assert.equal(aiCalls, 1);
  assert.equal(mailCalls, 1);
});
