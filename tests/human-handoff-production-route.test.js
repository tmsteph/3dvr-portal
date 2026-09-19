import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readProjectFile = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const headerValue = (headers, key) => headers.find((header) => header.key === key)?.value ?? null;

test('Human Handoff is never served from a stale edge cache', async () => {
  const config = JSON.parse(await readProjectFile('vercel.json'));
  for (const source of ['/human-handoff', '/human-handoff/', '/human-handoff/:path*']) {
    const rule = config.headers?.find((entry) => entry.source === source);
    assert.ok(rule, `missing cache rule for ${source}`);
    assert.equal(headerValue(rule.headers, 'Cache-Control'), 'no-store, max-age=0');
    assert.equal(headerValue(rule.headers, 'CDN-Cache-Control'), 'no-store');
    assert.equal(headerValue(rule.headers, 'Vercel-CDN-Cache-Control'), 'no-store');
  }

  const server = await readProjectFile('scripts/self-host-server.mjs');
  assert.match(server, /pathname === '\/human-handoff'/);
  assert.match(server, /pathname\.startsWith\('\/human-handoff\/'\)/);
  assert.match(server, /no-store, max-age=0/);
});

test('self-host production accepts the canonical Organism bridge', async () => {
  const workflow = await readProjectFile('.github/workflows/self-host-production.yml');
  assert.match(workflow, /BRIDGE_URL" == https:\/\/portal\.3dvr\.tech/);
  assert.match(workflow, /BRIDGE_URL" == https:\/\/\*\.trycloudflare\.com/);
});
