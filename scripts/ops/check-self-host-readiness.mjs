#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';

const args = process.argv.slice(2);
const baseArg = args.find(arg => !arg.startsWith('--')) || process.env.PORTAL_SELF_HOST_URL || 'http://127.0.0.1:4320';
const base = new URL(baseArg.endsWith('/') ? baseArg : `${baseArg}/`);
const requireNoLegacy = args.includes('--require-no-legacy');
const shaIndex = args.indexOf('--expect-sha');
const expectedSha = shaIndex >= 0 ? String(args[shaIndex + 1] || '').trim() : String(process.env.PORTAL_RELEASE_SHA || '').trim();

function request(pathname, { method = 'GET', host } = {}) {
  const target = new URL(pathname.replace(/^\//, ''), base);
  const transport = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(target, {
      method,
      headers: host ? { Host: host } : undefined,
      timeout: 8000,
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('timeout', () => req.destroy(new Error(`timeout requesting ${target}`)));
    req.on('error', reject);
    req.end();
  });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(response, label) {
  try { return JSON.parse(response.body); }
  catch { throw new Error(`${label} did not return JSON (HTTP ${response.status})`); }
}

const checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
}

await check('health', async () => {
  const response = await request('/__3dvr-health');
  const health = parseJson(response, 'health');
  expect(response.status === 200 && health.ok === true, 'self-host health is not OK');
  if (expectedSha) expect(health.sha === expectedSha, `health SHA ${health.sha || 'missing'} != ${expectedSha}`);
});

let readiness;
await check('readiness', async () => {
  const response = await request('/__3dvr-readiness');
  readiness = parseJson(response, 'readiness');
  expect(response.status === 200 && readiness.ok === true, 'self-host readiness endpoint is not OK');
  expect(Array.isArray(readiness.nativeApiRoutes) && readiness.nativeApiRoutes.length >= 10, 'native API inventory is incomplete');
});

await check('static-shells', async () => {
  for (const path of ['/', '/noteverse/', '/workboard/']) {
    const response = await request(path);
    expect(response.status === 200 && /<html/i.test(response.body), `${path} did not serve an HTML shell`);
  }
});

await check('private-files-hidden', async () => {
  const response = await request('/package.json');
  expect(response.status === 404, 'package.json must not be public');
});

await check('cache-reset-parity', async () => {
  const response = await request('/api/cache-reset');
  expect(response.status === 200, '/api/cache-reset must resolve locally');
  expect(String(response.headers['cache-control'] || '').includes('no-store'), 'cache reset must be no-store');
  expect(String(response.headers['clear-site-data'] || '').includes('cache'), 'cache reset must clear cache data');
});

await check('host-routing', async () => {
  const crm = await request('/', { host: 'crm.3dvr.tech' });
  expect(crm.status === 200 && /crm/i.test(crm.body), 'crm.3dvr.tech host rewrite failed');
  const purpose = await request('/', { host: 'purpose.3dvr.tech' });
  expect(purpose.status === 200, 'purpose.3dvr.tech host rewrite failed');
});

await check('native-api-adapter', async () => {
  const openai = await request('/api/openai-site', { method: 'OPTIONS' });
  expect(openai.status === 200, 'OpenAI OPTIONS probe failed');
  expect(openai.headers['x-3dvr-api-backend'] === 'self-host', 'OpenAI route is not marked native');
  const trial = await request('/api/trial');
  expect(trial.headers['x-3dvr-api-backend'] === 'self-host', 'trial route is not marked native');
});

if (requireNoLegacy) {
  expect(readiness.legacyApiFallback === false, 'legacy Vercel API fallback is still enabled');
  expect(readiness.cutoverReady === true, `cutover readiness failed: ${JSON.stringify(readiness.environment || {})}`);
  expect(Number(readiness.legacyFallbackRequestCount || 0) === 0, 'legacy fallback traffic has been observed since server start');
}

console.log(JSON.stringify({
  ok: true,
  base: base.origin,
  checks,
  cutoverReady: Boolean(readiness?.cutoverReady),
  legacyApiFallback: Boolean(readiness?.legacyApiFallback),
  environment: readiness?.environment || {},
}, null, 2));
