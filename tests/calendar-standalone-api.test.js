import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProxyHeaders,
  buildProxyTargetUrl,
  inferPortalOriginFromCalendarHost,
  readProxyBody,
  resolvePortalOrigin,
} from '../calendar/api-proxy.js';

test('calendar standalone proxy infers the sibling portal origin from supported hosts', () => {
  assert.equal(
    inferPortalOriginFromCalendarHost('calendar.3dvr.tech'),
    'https://portal.3dvr.tech'
  );
  assert.equal(
    inferPortalOriginFromCalendarHost('calendar-staging.3dvr.tech'),
    'https://portal-staging.3dvr.tech'
  );
  assert.equal(
    inferPortalOriginFromCalendarHost('3dvr-portal-calendar-git-feature-growth-cron-tmstephs-projects.vercel.app'),
    'https://3dvr-portal-git-feature-growth-cron-tmstephs-projects.vercel.app'
  );
  assert.equal(
    inferPortalOriginFromCalendarHost('calendar.localtest.me', 'https://portal.example.com'),
    'https://portal.localtest.me'
  );
  assert.equal(
    inferPortalOriginFromCalendarHost('unknown.example.com', 'https://portal.example.com'),
    'https://portal.example.com'
  );
});

test('calendar standalone proxy allows an explicit portal origin override', () => {
  const req = {
    headers: {
      host: 'calendar.3dvr.tech',
    },
  };

  assert.equal(
    resolvePortalOrigin(req, { PORTAL_ORIGIN: 'https://portal-preview.example.com' }),
    'https://portal-preview.example.com'
  );
});

test('calendar standalone proxy builds target URLs and forwards the original host headers', () => {
  const req = {
    url: '/api/oauth/google?action=start&returnTo=%2F',
    headers: {
      host: 'calendar.3dvr.tech',
      'x-forwarded-proto': 'https',
      cookie: 'session=abc123',
      accept: 'application/json',
    },
  };

  const targetUrl = buildProxyTargetUrl(req, 'https://portal.3dvr.tech');
  const headers = buildProxyHeaders(req);

  assert.equal(
    targetUrl.href,
    'https://portal.3dvr.tech/api/oauth/google?action=start&returnTo=%2F'
  );
  assert.equal(headers.get('x-forwarded-host'), 'calendar.3dvr.tech');
  assert.equal(headers.get('x-forwarded-proto'), 'https');
  assert.equal(headers.get('cookie'), 'session=abc123');
  assert.equal(headers.get('accept'), 'application/json');
});

test('calendar standalone proxy rebuilds rewritten catch-all paths from the proxy route', () => {
  const req = {
    query: {
      path: ['oauth', 'google'],
      action: 'config',
      returnTo: '/',
    },
  };

  const targetUrl = buildProxyTargetUrl(req, 'https://portal.3dvr.tech');

  assert.equal(
    targetUrl.href,
    'https://portal.3dvr.tech/api/oauth/google?action=config&returnTo=%2F'
  );
});

test('calendar standalone proxy reads JSON request bodies for forwarded POST calls', async () => {
  const req = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: {
      action: 'listContacts',
      accessToken: 'token-123',
    },
  };

  const payload = await readProxyBody(req);

  assert.equal(
    payload,
    JSON.stringify({
      action: 'listContacts',
      accessToken: 'token-123',
    })
  );
});
