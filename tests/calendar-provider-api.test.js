import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/calendar/provider.js';

const originalFetch = globalThis.fetch;

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      if (payload !== undefined) {
        this.body = payload;
      }
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('calendar provider api', () => {
  it('lists google events through the shared provider route', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        async json() {
          return {
            items: [{ id: 'g-1', summary: 'Google event' }],
            nextSyncToken: 'sync-token'
          };
        }
      };
    };

    const res = createMockRes();
    await handler({
      method: 'POST',
      query: { provider: 'google' },
      body: {
        action: 'listEvents',
        accessToken: 'token',
        calendarId: 'primary'
      }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /googleapis\.com\/calendar/);
    assert.deepEqual(res.body, {
      events: [{ id: 'g-1', summary: 'Google event' }],
      nextSyncToken: 'sync-token'
    });
  });

  it('creates outlook events through the shared provider route', async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        async json() {
          return {
            id: 'o-1',
            subject: 'Outlook event'
          };
        }
      };
    };

    const res = createMockRes();
    await handler({
      method: 'POST',
      query: { provider: 'outlook' },
      body: {
        action: 'createEvent',
        accessToken: 'token',
        title: 'Outlook event',
        start: '2026-03-09T10:00:00.000Z',
        end: '2026-03-09T11:00:00.000Z'
      }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /graph\.microsoft\.com/);
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(res.body, {
      event: {
        id: 'o-1',
        subject: 'Outlook event'
      }
    });
  });

  it('rejects unknown providers', async () => {
    const res = createMockRes();
    await handler({
      method: 'POST',
      query: {},
      body: {
        action: 'listEvents',
        accessToken: 'token'
      }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'A valid calendar provider is required.' });
  });
});
