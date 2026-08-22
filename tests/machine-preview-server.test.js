import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const previewServer = join(repoRoot, 'scripts', 'preview-server.mjs');

async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  return server.address().port;
}

async function getFreePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}

async function waitFor(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

test('machine preview serves branch files and only proxies Operator API', async t => {
  const root = await mkdtemp(join(tmpdir(), '3dvr-preview-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><script src="/home-operator.js"></script>');
  await writeFile(join(root, 'home-operator.js'), 'window.previewLoaded = true;');

  const upstreamRequests = [];
  const upstream = createServer(async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    upstreamRequests.push({ url: req.url, method: req.method, body: Buffer.concat(body).toString('utf8') });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ reply: 'preview operator ok' }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => new Promise(resolveClose => upstream.close(resolveClose)));

  const port = await getFreePort();
  const sha = 'preview-test-sha';
  const child = spawn(process.execPath, [previewServer], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      PREVIEW_ROOT: root,
      PREVIEW_SHA: sha,
      PREVIEW_REF: 'machine-preview/test',
      PREVIEW_PRODUCTION_ORIGIN: `http://127.0.0.1:${upstreamPort}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolveExit => child.once('exit', resolveExit)),
      new Promise(resolveTimeout => setTimeout(resolveTimeout, 1000))
    ]);
    await rm(root, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;
  const healthResponse = await waitFor(`${base}/__3dvr-preview`);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.sha, sha);
  assert.equal(health.ref, 'machine-preview/test');

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /home-operator\.js/);
  assert.equal(home.headers.get('x-3dvr-preview-sha'), sha);

  const staticJs = await fetch(`${base}/home-operator.js`);
  assert.equal(staticJs.status, 200);
  assert.match(await staticJs.text(), /previewLoaded/);

  const options = await fetch(`${base}/api/openai-site?provider=operator`, { method: 'OPTIONS' });
  assert.equal(options.status, 204);

  const operator = await fetch(`${base}/api/openai-site?provider=operator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'hello preview' })
  });
  assert.equal(operator.status, 200);
  assert.deepEqual(await operator.json(), { reply: 'preview operator ok' });
  assert.equal(upstreamRequests.length, 1);
  assert.equal(upstreamRequests[0].method, 'POST');
  assert.equal(upstreamRequests[0].url, '/api/openai-site?provider=operator');
  assert.match(upstreamRequests[0].body, /hello preview/);

  const blockedApi = await fetch(`${base}/api/session`);
  assert.equal(blockedApi.status, 404);
  assert.match((await blockedApi.json()).error, /not enabled/i);

  const blockedPost = await fetch(`${base}/`, { method: 'POST' });
  assert.equal(blockedPost.status, 405);
});
