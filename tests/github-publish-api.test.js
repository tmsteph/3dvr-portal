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

async function withTemporaryEnv(overrides, callback) {
  const previous = {};
  Object.keys(overrides).forEach(key => {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  });

  try {
    return await callback();
  } finally {
    Object.keys(overrides).forEach(key => {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    });
  }
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
  const calls = [];
  let requestPayload = null;
  const handler = createGithubPublishHandler({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
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
  assert.match(calls[0].url, /\/v13\/deployments\?teamId=team_KXuVUd00RMnDsjoqwdREcZ7J$/);
});

test('vercel deploy provider ignores generic Vercel team env for site launches', async () => {
  await withTemporaryEnv({
    SITE_LAUNCH_VERCEL_TEAM_ID: '   ',
    VERCEL_TEAM_ID: 'team_tmsteph'
  }, async () => {
    const calls = [];
    const handler = createGithubPublishHandler({
      fetchImpl: async (url, options = {}) => {
        calls.push({ url: String(url), options });
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_3dvr',
              url: '3dvr-test.vercel.app',
              inspectUrl: 'https://vercel.com/3dvr/test/deployments/dpl_3dvr'
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
        projectName: '3dvr-test',
        html: '<html><body>deployment test content</body></html>'
      }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(calls[0].url, /\/v13\/deployments\?teamId=team_KXuVUd00RMnDsjoqwdREcZ7J$/);
    assert.doesNotMatch(calls[0].url, /team_tmsteph/);
  });
});

test('vercel deploy provider ignores client team overrides', async () => {
  const calls = [];
  const handler = createGithubPublishHandler({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: 'dpl_3dvr',
            url: '3dvr-test.vercel.app',
            inspectUrl: 'https://vercel.com/3dvr/test/deployments/dpl_3dvr'
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
      teamId: 'team_tmsteph',
      projectName: '3dvr-test',
      html: '<html><body>deployment test content</body></html>'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(calls[0].url, /\/v13\/deployments\?teamId=team_KXuVUd00RMnDsjoqwdREcZ7J$/);
  assert.doesNotMatch(calls[0].url, /team_tmsteph/);
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
    vercelTeamId: 'team_3dvr',
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
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/v13\/deployments\?teamId=team_3dvr$/);
  assert.match(calls[1].url, /\/v2\/deployments\/dpl_launch_123\/aliases\?teamId=team_3dvr$/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server_vercel_token');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer server_vercel_token');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    alias: 'river-city-wellness.3dvr.tech'
  });
});

test('vercel deploy provider waits for deployment readiness before aliasing', async () => {
  const calls = [];
  let statusPollCount = 0;
  const handler = createGithubPublishHandler({
    vercelToken: 'server_vercel_token',
    vercelTeamId: 'team_3dvr',
    siteLaunchBaseDomain: '3dvr.tech',
    vercelReadyTimeoutMs: 3,
    vercelReadyPollIntervalMs: 1,
    sleepImpl: async () => {},
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });

      if (String(url).includes('/v13/deployments') && options.method === 'POST') {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_queued',
              url: '3dvr-ready-test.vercel.app',
              inspectUrl: 'https://vercel.com/example/launch/dpl_launch_queued',
              readyState: 'BUILDING'
            };
          }
        };
      }

      if (String(url).includes('/v13/deployments/dpl_launch_queued')) {
        statusPollCount += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_queued',
              url: '3dvr-ready-test.vercel.app',
              inspectUrl: 'https://vercel.com/example/launch/dpl_launch_queued',
              readyState: statusPollCount === 1 ? 'BUILDING' : 'READY'
            };
          }
        };
      }

      if (String(url).includes('/v2/deployments/dpl_launch_queued/aliases')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              alias: 'ready-test.3dvr.tech'
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
      projectName: '3dvr-ready-test',
      subdomain: 'ready-test',
      html: '<html><body>deployment readiness test content</body></html>'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.aliasAssigned, true);
  assert.equal(res.body.aliasUrl, 'https://ready-test.3dvr.tech');
  assert.equal(calls.length, 4);
  assert.match(calls[0].url, /\/v13\/deployments\?teamId=team_3dvr$/);
  assert.match(calls[1].url, /\/v13\/deployments\/dpl_launch_queued\?teamId=team_3dvr$/);
  assert.match(calls[2].url, /\/v13\/deployments\/dpl_launch_queued\?teamId=team_3dvr$/);
  assert.match(calls[3].url, /\/v2\/deployments\/dpl_launch_queued\/aliases\?teamId=team_3dvr$/);
  assert.equal(calls[3].options.method, 'POST');
});

test('vercel deploy provider reports failed deployment readiness before aliasing', async () => {
  const calls = [];
  const handler = createGithubPublishHandler({
    vercelToken: 'server_vercel_token',
    vercelTeamId: 'team_3dvr',
    siteLaunchBaseDomain: '3dvr.tech',
    vercelReadyTimeoutMs: 1,
    vercelReadyPollIntervalMs: 1,
    sleepImpl: async () => {},
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });

      if (String(url).includes('/v13/deployments') && options.method === 'POST') {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_failed',
              url: '3dvr-failed-test.vercel.app',
              inspectUrl: 'https://vercel.com/example/launch/dpl_launch_failed',
              readyState: 'BUILDING'
            };
          }
        };
      }

      if (String(url).includes('/v13/deployments/dpl_launch_failed')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: 'dpl_launch_failed',
              readyState: 'ERROR'
            };
          }
        };
      }

      if (String(url).includes('/aliases')) {
        throw new Error('alias should not run for a failed deployment');
      }

      throw new Error(`Unexpected url ${url}`);
    }
  });

  const req = {
    method: 'POST',
    query: { provider: 'vercel' },
    headers: {},
    body: {
      projectName: '3dvr-failed-test',
      subdomain: 'failed-test',
      html: '<html><body>deployment readiness failure content</body></html>'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /readyState ERROR/);
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls.map(call => call.url).join('\n'), /aliases/);
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
