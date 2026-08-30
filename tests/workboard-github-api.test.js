import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import workboardGithubHandler, { __resetWorkboardGithubCacheForTests } from '../src/workboard/github-feed.js';

const originalFetch = globalThis.fetch;

function createResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: undefined,
    headers,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  __resetWorkboardGithubCacheForTests();
});

test('Workboard GitHub feed rejects non-GET requests', async () => {
  const req = { method: 'POST' };
  const res = createResponse();

  await workboardGithubHandler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.get('allow'), 'GET');
  assert.deepEqual(res.body, { error: 'Method Not Allowed' });
});

test('Workboard GitHub feed normalizes issues and pull requests', async () => {
  let requestedUrl = '';
  globalThis.fetch = async url => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            id: 101,
            number: 42,
            title: 'Improve agent review flow',
            body: 'Make review faster.',
            state: 'open',
            html_url: 'https://github.com/tmsteph/3dvr-portal/issues/42',
            user: { login: 'tmsteph' },
            created_at: '2026-08-28T00:00:00Z',
            updated_at: '2026-08-28T01:00:00Z',
            closed_at: null,
            labels: [{ name: 'agent' }]
          },
          {
            id: 102,
            number: 43,
            title: 'Ship the workboard',
            body: 'Ready to review.',
            state: 'open',
            html_url: 'https://github.com/tmsteph/3dvr-portal/pull/43',
            user: { login: 'tmsteph' },
            pull_request: { url: 'https://api.github.com/repos/tmsteph/3dvr-portal/pulls/43' },
            created_at: '2026-08-28T02:00:00Z',
            updated_at: '2026-08-28T03:00:00Z',
            closed_at: null,
            labels: []
          }
        ];
      }
    };
  };

  const req = { method: 'GET' };
  const res = createResponse();
  await workboardGithubHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(requestedUrl, /repos\/tmsteph\/3dvr-portal\/issues\?/);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.repository, 'tmsteph/3dvr-portal');
  assert.equal(res.body.items.length, 2);
  assert.equal(res.body.items[0].kind, 'github-issue');
  assert.equal(res.body.items[0].user, 'tmsteph');
  assert.deepEqual(res.body.items[0].labels, ['agent']);
  assert.equal(res.body.items[1].kind, 'github-pr');
  assert.equal(res.body.items[1].number, 43);
  assert.match(String(res.headers.get('cache-control')), /s-maxage=60/);
});

test('Workboard GitHub feed reuses its server-side cache', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ id: 101, number: 42, title: 'Cached item', state: 'open' }];
      }
    };
  };

  const req = { method: 'GET' };
  const first = createResponse();
  const second = createResponse();
  await workboardGithubHandler(req, first);
  await workboardGithubHandler(req, second);

  assert.equal(calls, 1);
  assert.deepEqual(second.body, first.body);
});

test('Workboard GitHub feed coalesces concurrent cache misses', async () => {
  let calls = 0;
  let releaseFetch;
  const gate = new Promise(resolve => { releaseFetch = resolve; });
  globalThis.fetch = async () => {
    calls += 1;
    await gate;
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ id: 101, number: 42, title: 'Single flight', state: 'open' }];
      }
    };
  };

  const req = { method: 'GET' };
  const first = createResponse();
  const second = createResponse();
  const firstRun = workboardGithubHandler(req, first);
  const secondRun = workboardGithubHandler(req, second);

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  releaseFetch();
  await Promise.all([firstRun, secondRun]);

  assert.equal(first.statusCode, 200);
  assert.deepEqual(second.body, first.body);
});

test('Workboard GitHub feed degrades safely when GitHub fails without cache', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 403 });

  const req = { method: 'GET' };
  const res = createResponse();
  await workboardGithubHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.repository, 'tmsteph/3dvr-portal');
  assert.deepEqual(res.body.items, []);
  assert.equal(res.body.degraded, true);
  assert.equal(res.body.error, 'GitHub work feed is temporarily unavailable.');
  assert.equal(res.body.status, 403);
});
