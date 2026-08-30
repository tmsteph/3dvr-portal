import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthProviderHandler } from '../api/oauth/[provider].js';

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end(payload) { this.body = payload; return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
}

describe('send-only Google OAuth least privilege', () => {
  for (const scopeKey of ['gmail-send', 'calendar-gmail-send']) {
    it(`${scopeKey} disables incremental grants`, async () => {
      const handler = createOAuthProviderHandler({
        config: {
          GOOGLE_OAUTH_CLIENT_ID: 'client.apps.googleusercontent.com',
          GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
        },
      });
      const res = createMockRes();
      await handler({
        method: 'GET',
        headers: { host: 'portal.3dvr.tech', 'x-forwarded-proto': 'https' },
        query: { provider: 'google', action: 'start', scopeKey, returnTo: '/' },
      }, res);

      assert.equal(res.statusCode, 302);
      const location = new URL(res.headers.Location);
      assert.equal(location.searchParams.get('include_granted_scopes'), 'false');
      assert.match(location.searchParams.get('scope') || '', /gmail\.send/);
      assert.doesNotMatch(location.searchParams.get('scope') || '', /gmail\.readonly/);
    });
  }
});
