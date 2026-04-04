import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCalendarProviderHandler } from '../api/calendar/[provider].js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
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
      this.body = payload ?? this.body;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

async function listApiFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const nextPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      return listApiFiles(nextPath);
    }
    return entry.isFile() ? [nextPath] : [];
  }));
  return files.flat();
}

describe('calendar provider api', () => {
  it('serves Google events through the shared provider route', async () => {
    const fetchImpl = mock.fn(async (url) => ({
      ok: true,
      status: 200,
      async json() {
        return {
          items: [{ id: 'google-event-1' }],
          nextSyncToken: 'sync_google'
        };
      }
    }));
    const handler = createCalendarProviderHandler({ fetchImpl });
    const req = {
      method: 'POST',
      query: { provider: 'google' },
      body: {
        action: 'listEvents',
        accessToken: 'token_google',
        calendarId: 'primary'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      events: [{ id: 'google-event-1' }],
      nextSyncToken: 'sync_google'
    });
    assert.match(fetchImpl.mock.calls[0].arguments[0], /googleapis\.com/);
  });

  it('serves Outlook events through the shared provider route', async () => {
    const fetchImpl = mock.fn(async (url) => ({
      ok: true,
      status: 200,
      async json() {
        return {
          value: [{ id: 'outlook-event-1' }]
        };
      }
    }));
    const handler = createCalendarProviderHandler({ fetchImpl });
    const req = {
      method: 'POST',
      query: { provider: 'outlook' },
      body: {
        action: 'listEvents',
        accessToken: 'token_outlook'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      events: [{ id: 'outlook-event-1' }]
    });
    assert.match(fetchImpl.mock.calls[0].arguments[0], /graph\.microsoft\.com/);
  });

  it('rejects unknown calendar providers', async () => {
    const handler = createCalendarProviderHandler({
      fetchImpl: mock.fn(async () => {
        throw new Error('should not reach fetch');
      })
    });
    const req = {
      method: 'POST',
      query: { provider: 'zoho' },
      body: {
        action: 'listEvents'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Unknown calendar provider.' });
  });

  it('keeps the portal Vercel deployment within the Hobby serverless function ceiling', async () => {
    const apiFiles = await listApiFiles(resolve(projectRoot, 'api'));
    const jsApiFiles = apiFiles.filter(filePath => filePath.endsWith('.js'));

    assert.equal(jsApiFiles.length <= 12, true, `Expected at most 12 API functions, found ${jsApiFiles.length}`);
    assert.equal(jsApiFiles.some(filePath => filePath.endsWith('/calendar/[provider].js')), true);
  });
});
