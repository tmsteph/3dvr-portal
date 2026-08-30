import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { callChatPushStore, saveNewsletterSubscriber } from '../src/services/newsletter-store-client.js';

describe('chat push store client', () => {
  it('keeps the DigitalOcean bearer token server-side', async () => {
    const fetchImpl = mock.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    }));

    await callChatPushStore('subscribe', { userId: 'guest_123' }, {
      NEWSLETTER_STORE_URL: 'https://selfhost.3dvr.tech/api/newsletter',
      NEWSLETTER_STORE_TOKEN: 'server-secret'
    }, fetchImpl);

    const [url, options] = fetchImpl.mock.calls[0].arguments;
    assert.equal(url, 'https://selfhost.3dvr.tech/api/newsletter/v1/chat/subscribe');
    assert.equal(options.headers.authorization, 'Bearer server-secret');
    assert.equal(JSON.parse(options.body).userId, 'guest_123');
  });

  it('stores newsletter subscribers through the same non-API helper', async () => {
    const fetchImpl = mock.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    }));

    await saveNewsletterSubscriber({ email: 'reader@example.com' }, {
      NEWSLETTER_STORE_URL: 'https://selfhost.3dvr.tech/api/newsletter/',
      NEWSLETTER_STORE_TOKEN: 'server-secret'
    }, fetchImpl);

    const [url, options] = fetchImpl.mock.calls[0].arguments;
    assert.equal(url, 'https://selfhost.3dvr.tech/api/newsletter/v1/subscribers');
    assert.equal(options.headers.authorization, 'Bearer server-secret');
    assert.equal(JSON.parse(options.body).email, 'reader@example.com');
  });

});
