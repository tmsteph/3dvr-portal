import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOAuthProviderHandler } from '../api/oauth/[provider].js';

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
    },
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

describe('oauth provider api', () => {
  it('serves public provider configuration', async () => {
    const handler = createOAuthProviderHandler({
      config: {
        GOOGLE_OAUTH_CLIENT_ID: 'google-client',
        GOOGLE_OAUTH_CLIENT_SECRET: 'google-secret',
      },
      fetchImpl: mock.fn(async () => {
        throw new Error('should not reach fetch');
      }),
    });
    const res = createMockRes();

    await handler({
      method: 'GET',
      query: {
        provider: 'google',
        action: 'config',
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      provider: 'google',
      label: 'Google',
      configured: true,
      supports: {
        signin: true,
        contacts: true,
        calendar: true,
      },
    });
  });

  it('renders callback html when OAuth is not configured without relying on res.send', async () => {
    const handler = createOAuthProviderHandler({
      config: {},
      fetchImpl: mock.fn(async () => {
        throw new Error('should not reach fetch');
      }),
    });
    const res = createMockRes();

    await handler({
      method: 'GET',
      headers: {
        host: 'portal.3dvr.tech',
        'x-forwarded-proto': 'https',
      },
      query: {
        provider: 'google',
        action: 'start',
        returnTo: '/profile.html#profile-oauth',
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.ended, true);
    assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.match(String(res.body), /portal\.oauth\.result/);
    assert.match(String(res.body), /not configured on this deployment yet/i);
  });

  it('lists Google contacts through the shared provider route', async () => {
    const fetchImpl = mock.fn(async () => ({
      ok: true,
      async json() {
        return {
          connections: [
            {
              resourceName: 'people/c1',
              names: [{ displayName: 'Taylor Prospect' }],
              emailAddresses: [{ value: 'taylor@example.com' }],
              phoneNumbers: [{ value: '+1 (555) 000-2222' }],
              organizations: [{ name: 'Prospect Studio', title: 'Founder' }],
              biographies: [{ value: 'Warm lead from the site.' }],
            },
          ],
        };
      },
    }));
    const handler = createOAuthProviderHandler({ fetchImpl });
    const res = createMockRes();

    await handler({
      method: 'POST',
      query: {
        provider: 'google',
      },
      body: {
        action: 'listContacts',
        accessToken: 'token_google',
        limit: 50,
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.contacts.length, 1);
    assert.deepEqual(res.body.contacts[0], {
      id: 'people/c1',
      name: 'Taylor Prospect',
      email: 'taylor@example.com',
      phone: '+1 (555) 000-2222',
      company: 'Prospect Studio',
      role: 'Founder',
      notes: 'Warm lead from the site.',
      tags: 'source/google-oauth',
      source: 'Google OAuth',
    });
    assert.match(fetchImpl.mock.calls[0].arguments[0], /people\.googleapis\.com/);
  });

  it('rejects Apple contacts import because Apple is identity-only in the portal', async () => {
    const handler = createOAuthProviderHandler({
      fetchImpl: mock.fn(async () => {
        throw new Error('should not reach fetch');
      }),
    });
    const res = createMockRes();

    await handler({
      method: 'POST',
      query: {
        provider: 'apple',
      },
      body: {
        action: 'listContacts',
        accessToken: 'token_apple',
      },
    }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /does not expose contacts import/i);
  });

  it('keeps the portal Vercel deployment within the Hobby serverless function ceiling after adding OAuth', async () => {
    const apiFiles = await listApiFiles(resolve(projectRoot, 'api'));
    const jsApiFiles = apiFiles.filter(filePath => filePath.endsWith('.js'));

    assert.equal(jsApiFiles.length <= 12, true, `Expected at most 12 API functions, found ${jsApiFiles.length}`);
    assert.equal(jsApiFiles.some(filePath => filePath.endsWith('/oauth/[provider].js')), true);
    assert.equal(jsApiFiles.some(filePath => filePath.endsWith('/stripe/checkout.js')), false);
    assert.equal(jsApiFiles.some(filePath => filePath.endsWith('/stripe/status.js')), false);
  });
});
