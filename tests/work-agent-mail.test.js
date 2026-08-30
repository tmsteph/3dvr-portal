import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOAuthProviderHandler } from '../api/oauth/[provider].js';

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end(payload) { this.body = payload ?? this.body; return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
}

function base64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

describe('work agent mail bridge', () => {
  it('requests read and send Gmail scopes instead of full mailbox access', async () => {
    const handler = createOAuthProviderHandler({
      config: { GOOGLE_OAUTH_CLIENT_ID: 'client', GOOGLE_OAUTH_CLIENT_SECRET: 'secret' },
    });
    const res = createMockRes();
    await handler({
      method: 'GET',
      headers: { host: 'portal.3dvr.tech', 'x-forwarded-proto': 'https' },
      query: { provider: 'google', action: 'start', scopeKey: 'mail', returnTo: '/work-agent/' },
    }, res);

    assert.equal(res.statusCode, 302);
    const scopes = new URL(res.headers.Location).searchParams.get('scope') || '';
    assert.match(scopes, /gmail\.readonly/);
    assert.match(scopes, /gmail\.send/);
    assert.doesNotMatch(scopes, /https:\/\/mail\.google\.com\//);
  });

  it('returns normalized Gmail messages for schedule intelligence', async () => {
    const fetchImpl = mock.fn(async url => {
      if (String(url).includes('/messages?')) {
        return { ok: true, async json() { return { messages: [{ id: 'm1', threadId: 't1' }] }; } };
      }
      return {
        ok: true,
        async json() {
          return {
            id: 'm1',
            threadId: 't1',
            internalDate: '1788120000000',
            snippet: 'Are you available September 3 at a $600/day rate?',
            payload: {
              mimeType: 'text/plain',
              headers: [
                { name: 'From', value: 'Producer <producer@example.com>' },
                { name: 'To', value: 'tech@example.com' },
                { name: 'Subject', value: 'Audio call September 3' },
                { name: 'Message-ID', value: '<m1@example.com>' },
              ],
              body: { data: base64Url('Are you available September 3? Day rate is $600.') },
            },
          };
        },
      };
    });
    const handler = createOAuthProviderHandler({ fetchImpl });
    const res = createMockRes();
    await handler({
      method: 'POST',
      query: { provider: 'google' },
      body: { action: 'listMail', accessToken: 'token', query: 'newer_than:90d availability', limit: 10 },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.messages.length, 1);
    assert.equal(res.body.messages[0].from, 'Producer <producer@example.com>');
    assert.equal(res.body.messages[0].subject, 'Audio call September 3');
    assert.match(res.body.messages[0].text, /Day rate is \$600/);
    assert.equal(fetchImpl.mock.calls.length, 2);
  });

  it('sends an explicit Gmail reply with thread headers', async () => {
    let sentBody = null;
    const fetchImpl = mock.fn(async (_url, options) => {
      sentBody = JSON.parse(options.body);
      return { ok: true, async json() { return { id: 'sent1', threadId: 'thread1' }; } };
    });
    const handler = createOAuthProviderHandler({ fetchImpl });
    const res = createMockRes();
    await handler({
      method: 'POST',
      query: { provider: 'google' },
      body: {
        action: 'sendMail',
        accessToken: 'token',
        to: 'producer@example.com',
        subject: 'Re: Audio call',
        text: 'Thanks. I am available.',
        threadId: 'thread1',
        inReplyTo: '<m1@example.com>',
        references: '<m1@example.com>',
        attachment: { filename: 'test-resume.txt', contentType: 'text/plain; charset=UTF-8', content: 'Test Technician\nA1 / RF' },
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(sentBody.threadId, 'thread1');
    const decoded = Buffer.from(sentBody.raw, 'base64url').toString('utf8');
    assert.match(decoded, /To: producer@example\.com/);
    assert.match(decoded, /In-Reply-To: <m1@example\.com>/);
    assert.match(decoded, /Thanks\. I am available\./);
    assert.match(decoded, /Content-Disposition: attachment; filename="test-resume\.txt"/);
    assert.match(decoded, new RegExp(Buffer.from('Test Technician\nA1 / RF').toString('base64')));
  });

  it('keeps outbound actions approval-based in the Work Agent UI', async () => {
    const html = await readFile(new URL('../work-agent/index.html', import.meta.url), 'utf8');
    const app = await readFile(new URL('../work-agent/app.js', import.meta.url), 'utf8');
    assert.match(html, /Nothing is sent automatically in this version/);
    assert.match(html, /Email sends require a tap/);
    assert.match(html, /configured 3DVR AI service/);
    assert.match(html, /sending remains explicit/);
    assert.match(app, /data-action="send-reply"/);
    assert.match(app, /Send resume \+ outreach/);
    assert.match(app, /action: 'sendMail'/);
    assert.doesNotMatch(app, /setInterval\([^)]*sendGmail/);
  });
});
