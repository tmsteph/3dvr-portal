import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGithubPublishHandler,
  resolveLaunchDomain,
  sanitizeLaunchSubdomain
} from '../api/github-publish.js';

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
  assert.equal(res.body.buildInfo?.commit, 'local');
  assert.ok(res.body.buildInfo?.deploymentUrl);
  assert.ok(res.body.buildInfo?.buildTime);
  assert.equal(requestPayload.name, 'project-demo');
});

test('sanitizeLaunchSubdomain normalizes customer site addresses', () => {
  assert.equal(sanitizeLaunchSubdomain(' River City Wellness! '), 'river-city-wellness');
  assert.equal(sanitizeLaunchSubdomain('ab'), '');
  assert.equal(sanitizeLaunchSubdomain('portal'), '');
});

test('resolveLaunchDomain limits aliases to the configured launch domain', () => {
  assert.deepEqual(
    resolveLaunchDomain({ subdomain: 'River City Wellness' }, { baseDomain: '3dvr.tech' }),
    {
      subdomain: 'river-city-wellness',
      domain: 'river-city-wellness.3dvr.tech',
      baseDomain: '3dvr.tech'
    }
  );
});

test('vercel deploy provider can use server token and assign a 3dvr subdomain', async () => {
  const calls = [];
  const handler = createGithubPublishHandler({
    vercelToken: 'server_vercel_token',
    siteLaunchBaseDomain: '3dvr.tech',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });

      if (String(url).includes('/v13/deployments')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_123',
              url: '3dvr-river-city-wellness.vercel.app',
              inspectUrl: 'https://vercel.com/example/launch/dpl_launch_123',
              readyState: 'READY'
            };
          }
        };
      }

      if (String(url).includes('/v2/deployments/dpl_launch_123/aliases')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              alias: 'river-city-wellness.3dvr.tech'
            };
          }
        };
      }

      throw new Error(`Unexpected url ${url}`);
    }
  });

  const req = {
    method: 'POST',
    query: { provider: 'vercel' },
    headers: {},
    body: {
      projectName: '3dvr-river-city-wellness',
      subdomain: 'River City Wellness',
      html: '<html><body>deployment test content</body></html>'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.aliasAssigned, true);
  assert.equal(res.body.aliasUrl, 'https://river-city-wellness.3dvr.tech');
  assert.equal(res.body.url, 'https://3dvr-river-city-wellness.vercel.app');
  assert.equal(res.body.buildInfo?.commit, 'local');
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server_vercel_token');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer server_vercel_token');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer server_vercel_token');
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    alias: 'river-city-wellness.3dvr.tech'
  });
});

test('vercel deploy provider waits for deployment ready state before aliasing', async () => {
  const calls = [];
  const readyStates = ['BUILDING', 'INITIALIZING', 'READY'];
  let readyIndex = 0;

  const handler = createGithubPublishHandler({
    vercelToken: 'server_vercel_token',
    siteLaunchBaseDomain: '3dvr.tech',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });

      if (String(url).includes('/v13/deployments') && options.method === 'POST') {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_456',
              url: '3dvr-river-city-wellness.vercel.app',
              inspectUrl: 'https://vercel.com/example/launch/dpl_launch_456',
              readyState: 'READY'
            };
          }
        };
      }

      if (String(url).includes('/v13/deployments')) {
        const readyState = readyStates[Math.min(readyIndex, readyStates.length - 1)];
        readyIndex += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_456',
              readyState
            };
          }
        };
      }

      if (String(url).includes('/v2/deployments/dpl_launch_456/aliases')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              alias: 'river-city-wellness.3dvr.tech'
            };
          }
        };
      }

      throw new Error(`Unexpected url ${url}`);
    }
  });

  const req = {
    method: 'POST',
    query: { provider: 'vercel' },
    headers: {},
    body: {
      projectName: '3dvr-river-city-wellness',
      subdomain: 'River City Wellness',
      html: '<html><body>deployment test content</body></html>'
    }
  };

  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.aliasAssigned, true);
  assert.equal(calls.filter(call => /\/v13\/deployments/.test(call.url)).length >= 2, true);
  assert.equal(calls.filter(call => /\/v2\/deployments\/dpl_launch_456\/aliases/.test(call.url)).length, 1);
});

test('vercel deploy provider returns deployment URL when deployment not ready for aliasing', async () => {
  const handler = createGithubPublishHandler({
    vercelToken: 'server_vercel_token',
    siteLaunchBaseDomain: '3dvr.tech',
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes('/v13/deployments') && options.method === 'POST') {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_789',
              url: '3dvr-river-city-wellness.vercel.app',
              inspectUrl: 'https://vercel.com/example/launch/dpl_launch_789',
              readyState: 'READY'
            };
          }
        };
      }

      if (String(url).includes('/v13/deployments/dpl_launch_789')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_789',
              readyState: 'BUILDING'
            };
          }
        };
      }

      if (String(url).includes('/v2/deployments/dpl_launch_789/aliases')) {
        return {
          ok: false,
          status: 400,
          async text() {
            return JSON.stringify({ error: { message: 'deployment not ready', code: 'deployment_not_ready' } });
          }
        };
      }

      throw new Error(`Unexpected url ${url}`);
    }
  });

  const req = {
    method: 'POST',
    query: { provider: 'vercel' },
    headers: {},
    body: {
      projectName: '3dvr-river-city-wellness',
      subdomain: 'River City Wellness',
      html: '<html><body>deployment test content</body></html>'
    }
  };

  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.aliasAssigned, false);
  assert.equal(res.body.alias, 'river-city-wellness.3dvr.tech');
  assert.equal(res.body.publishApiVersion, 'alias-fallback-v2');
  assert.match(res.body.aliasError, /not ready/i);
});

test('vercel deploy provider does not throw on alias API failure and returns warning', async () => {
  const handler = createGithubPublishHandler({
    vercelToken: 'server_vercel_token',
    siteLaunchBaseDomain: '3dvr.tech',
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes('/v13/deployments') && options.method === 'POST') {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_790',
              url: '3dvr-river-city-wellness.vercel.app',
              inspectUrl: 'https://vercel.com/example/launch/dpl_launch_790',
              readyState: 'READY'
            };
          }
        };
      }

      if (String(url).includes('/v13/deployments/dpl_launch_790')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_790',
              readyState: 'READY'
            };
          }
        };
      }

      if (String(url).includes('/v2/deployments/dpl_launch_790/aliases')) {
        return {
          ok: false,
          status: 500,
          async text() {
            return 'alias service down';
          }
        };
      }

      throw new Error(`Unexpected url ${url}`);
    }
  });

  const req = {
    method: 'POST',
    query: { provider: 'vercel' },
    headers: {},
    body: {
      projectName: '3dvr-river-city-wellness',
      subdomain: 'River City Wellness',
      html: '<html><body>deployment test content</body></html>'
    }
  };

  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.aliasAssigned, false);
  assert.equal(res.body.alias, 'river-city-wellness.3dvr.tech');
  assert.equal(res.body.url, 'https://3dvr-river-city-wellness.vercel.app');
});

test('vercel deploy provider rejects reserved launch subdomains', async () => {
  const handler = createGithubPublishHandler({
    vercelToken: 'server_vercel_token',
    fetchImpl: async () => {
      throw new Error('fetch should not run for invalid aliases');
    }
  });

  const req = {
    method: 'POST',
    query: { provider: 'vercel' },
    headers: {},
    body: {
      projectName: '3dvr-portal',
      subdomain: 'portal',
      html: '<html><body>deployment test content</body></html>'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /valid, available/);
});
