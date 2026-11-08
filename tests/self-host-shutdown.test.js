import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { Agent, createServer, get } from 'node:http';
import { connect } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

function request(url, agent = false) {
  return new Promise((resolveRequest, reject) => {
    const req = get(url, { agent }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolveRequest({ status: res.statusCode, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Request timed out')));
  });
}

async function startServer(t, env = {}) {
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise(resolveClose => reservation.close(resolveClose));
  const root = await mkdtemp(join(repoRoot, '.self-host-shutdown-'));
  const child = spawn(process.execPath, ['scripts/self-host-server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      PORTAL_ROOT: root,
      AUTOMATION_FUNNEL_DB: join(root, 'funnel.sqlite'),
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const exited = once(child, 'exit');
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (output.includes(`listening on ${origin}`)) return { child, exited, origin };
    assert.equal(child.exitCode, null, output);
    assert.equal(child.signalCode, null, output);
    await delay(50);
  }
  assert.fail(`Server did not start: ${output}`);
}

async function waitForRefusal(origin) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await request(`${origin}/__3dvr-health`);
    } catch (error) {
      if (error.code === 'ECONNREFUSED') return;
      // A connection racing the signal may be accepted just before close().
      assert.equal(error.code, 'ECONNRESET');
    }
    await delay(10);
  }
  assert.fail('Server kept accepting new connections after shutdown');
}

async function slowResponse(t) {
  let respond;
  const started = new Promise(resolveStarted => { respond = resolveStarted; });
  const upstream = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: first\n\n');
    respond(res);
  });
  const port = await listen(upstream);
  t.after(async () => {
    upstream.closeAllConnections();
    await new Promise(resolveClose => upstream.close(resolveClose));
  });
  const server = await startServer(t, { LEGACY_API_ORIGIN: `http://127.0.0.1:${port}` });
  // Observe errors immediately: the pre-fix server cuts the response on SIGTERM.
  const response = request(`${server.origin}/api/shutdown-test`).then(
    value => ({ value }), error => ({ error })
  );
  const upstreamResponse = await started;
  return { ...server, response, upstreamResponse };
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`${signal} refuses new connections and lets an in-flight response finish`, { timeout: 15000 }, async t => {
    const { child, exited, origin, response, upstreamResponse } = await slowResponse(t);
    child.kill(signal);
    await waitForRefusal(origin);
    assert.equal(child.exitCode, null, 'process must wait for the active response');
    assert.equal(child.signalCode, null);
    // A second signal must not truncate the drain or reset its deadline.
    child.kill(signal);
    await delay(100);
    upstreamResponse.end('data: done\n\n');
    const result = await response;
    assert.ifError(result.error);
    assert.deepEqual(result.value, { status: 200, body: 'data: first\n\ndata: done\n\n' });
    assert.deepEqual(await exited, [0, null]);
  });

  test(`${signal} exits promptly with only idle connections`, { timeout: 10000 }, async t => {
    const { child, exited, origin } = await startServer(t);
    const agent = new Agent({ keepAlive: true });
    t.after(() => agent.destroy());
    assert.equal((await request(`${origin}/__3dvr-health`, agent)).status, 200);
    // Include a socket that connected without sending HTTP headers.
    const idle = connect({ host: '127.0.0.1', port: Number(new URL(origin).port) });
    t.after(() => idle.destroy());
    await once(idle, 'connect');
    const start = Date.now();
    child.kill(signal);
    assert.deepEqual(await exited, [0, null]);
    assert.ok(Date.now() - start < 2000, 'idle connections must not consume the drain window');
    await waitForRefusal(origin);
  });
}

test('shutdown forcibly closes an unfinished response after the 20-second window', { timeout: 30000 }, async t => {
  const { child, exited, origin, response } = await slowResponse(t);
  const start = Date.now();
  child.kill('SIGTERM');
  await waitForRefusal(origin);
  assert.deepEqual(await exited, [0, null]);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 19500, `drain ended too early: ${elapsed}ms`);
  assert.ok(elapsed < 25000, `drain exceeded its bound: ${elapsed}ms`);
  assert.ok((await response).error, 'unfinished response must be disconnected at the deadline');
});
