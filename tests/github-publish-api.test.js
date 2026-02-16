import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubPublishHandler } from '../api/github-publish.js';

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

test('github publish handler rejects non-post methods', async () => {
  const handler = createGithubPublishHandler();
  const req = { method: 'GET', headers: {}, body: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method Not Allowed' });
});

test('github publish handler supports owner + repo payload shape', async () => {
  const calls = [];
  const handler = createGithubPublishHandler({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });

      if (String(url).includes('/contents/') && (!options.method || options.method === 'GET')) {
        return {
          ok: false,
          status: 404,
          async text() {
            return 'not found';
          },
          async json() {
            return { message: 'not found' };
          }
        };
      }

      if (String(url).includes('/contents/') && options.method === 'PUT') {
        return {
          ok: true,
          status: 201,
          async json() {
            return {
              content: {
                path: 'index.html',
                html_url: 'https://github.com/example/repo/blob/main/index.html'
              },
              commit: {
                sha: 'abc123'
              }
            };
          }
        };
      }

      throw new Error(`Unexpected url ${url}`);
    }
  });

  const req = {
    method: 'POST',
    headers: {},
    body: {
      token: 'ghp_test',
      owner: 'example',
      repo: 'repo',
      branch: 'main',
      path: 'index.html',
      content: '<html><body>hello world from test</body></html>',
      message: 'Publish test'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.repo, 'example/repo');
  assert.equal(res.body.path, 'index.html');
  assert.equal(res.body.commitSha, 'abc123');

  const putCall = calls.find(call => call.options.method === 'PUT');
  assert.ok(putCall);
  assert.match(putCall.url, /repos\/example\/repo\/contents/);
});

test('github publish handler supports vercel deploy provider mode', async () => {
  let requestPayload = null;
  const handler = createGithubPublishHandler({
    fetchImpl: async (_url, options = {}) => {
      requestPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: 'dpl_123',
            url: 'project-demo.vercel.app',
            inspectUrl: 'https://vercel.com/example/project/deployments/dpl_123'
          };
        }
      };
    }
  });

  const req = {
    method: 'POST',
    query: { provider: 'vercel' },
    headers: {},
    body: {
      token: 'vercel_token',
      projectName: 'Project Demo',
      html: '<html><body>deployment test content</body></html>'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, 'dpl_123');
  assert.equal(res.body.url, 'https://project-demo.vercel.app');
  assert.equal(requestPayload.name, 'project-demo');
});

