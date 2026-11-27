const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { runOperatorLocalCanary } = require('../thomas-agent/node/operator-local-canary');

const id = 'operator-http-' + 'a'.repeat(24) + '-operator-e2e-abcdefghijkl';
const digest = 'b'.repeat(64);
const record = { id, operatorRequestDigest: digest, workerDeviceId: 'isolated-worker',
  claimToken: 'claim', backend: 'local-canary', unsafe: false, task: 'Synthetic test' };
const env = { OPERATOR_RUNTIME_E2E_RUN_AUTHORIZED: '1',
  OPERATOR_RUNTIME_E2E_LOCAL_MODEL_ENABLED: '1', OPERATOR_RUNTIME_E2E_EXPECTED_TASK_ID: id,
  OPERATOR_RUNTIME_E2E_EXPECTED_REQUEST_DIGEST: digest,
  OPERATOR_RUNTIME_E2E_EXPECTED_WORKER_DEVICE_ID: 'isolated-worker',
  OPERATOR_RUNTIME_E2E_LOCAL_MODEL_URL: 'http://127.0.0.1:12345',
  OPERATOR_RUNTIME_E2E_LOCAL_MODEL: 'test-model' };
const reply = { model: 'test-model', choices: [{ finish_reason: 'stop',
  message: { role: 'assistant', content: '42' } }] };

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn({ ...env, OPERATOR_RUNTIME_E2E_LOCAL_MODEL_URL:
      'http://127.0.0.1:' + server.address().port });
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('rejects unapproved, non-pinned, unsafe and nonlocal requests before opening a socket', async () => {
  let calls = 0;
  const requestImpl = () => { calls++; throw Error('must not call'); };
  const cases = [
    [{}, { OPERATOR_RUNTIME_E2E_RUN_AUTHORIZED: '0' }],
    [{}, { OPERATOR_RUNTIME_E2E_LOCAL_MODEL_ENABLED: '0' }],
    [{ id: id + 'x' }, {}], [{ operatorRequestDigest: 'c'.repeat(64) }, {}],
    [{ claimToken: '' }, {}], [{ workerDeviceId: 'other' }, {}],
    [{ backend: 'codex' }, {}], [{ unsafe: true }, {}],
    [{}, { OPERATOR_RUNTIME_E2E_LOCAL_MODEL_URL: 'https://example.com' }],
    [{}, { OPERATOR_RUNTIME_E2E_LOCAL_MODEL_URL: 'http://127.0.0.1:12345/path' }],
    [{}, { OPERATOR_RUNTIME_E2E_LOCAL_MODEL_URL: 'http://127.0.0.1:99999' }]
  ];
  for (const [patch, config] of cases) {
    await assert.rejects(runOperatorLocalCanary({ ...record, ...patch },
      { env: { ...env, ...config }, requestImpl }));
  }
  assert.equal(calls, 0);
});

test('sends one bounded text-only request and attributes completion to local canary', async () => {
  let calls = 0, observed;
  await withServer((req, res) => {
    calls++;
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      observed = { path: req.url, method: req.method, body: JSON.parse(body) };
      res.end(JSON.stringify(reply));
    });
  }, async config => {
    assert.deepEqual(await runOperatorLocalCanary(record, { env: config }),
      { ok: true, backend: 'local-canary', result: { stdout: '42' } });
  });
  assert.equal(calls, 1);
  assert.deepEqual(observed, { path: '/v1/chat/completions', method: 'POST',
    body: { model: 'test-model', messages: [{ role: 'user', content: 'Synthetic test' }],
      max_tokens: 256, temperature: 0, stream: false } });
});

test('rejects redirects without following them', async () => {
  let calls = 0;
  await withServer((req, res) => {
    calls++;
    res.writeHead(302, { Location: '/redirected' });
    res.end();
  }, config => assert.rejects(runOperatorLocalCanary(record, { env: config })));
  assert.equal(calls, 1);
});

test('rejects malformed, partial, oversized, mismatched or tool-call responses', async () => {
  const cases = [
    'not json', JSON.stringify({ ...reply, model: 'other' }),
    JSON.stringify({ ...reply, choices: [{ ...reply.choices[0], finish_reason: 'length' }] }),
    JSON.stringify({ ...reply, choices: [{ ...reply.choices[0],
      message: { role: 'assistant', content: '42', tool_calls: [{}] } }] }),
    JSON.stringify({ ...reply, choices: [{ ...reply.choices[0],
      message: { role: 'assistant', content: '' } }] }),
    'x'.repeat(65537)
  ];
  for (const body of cases) {
    await withServer((req, res) => res.end(body),
      config => assert.rejects(runOperatorLocalCanary(record, { env: config })));
  }
});


test('absolute deadline destroys a silent request and never retries', async t => {
  const { EventEmitter } = require('node:events');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let destroys = 0;
  const requestImpl = () => {
    calls++;
    const req = new EventEmitter();
    req.end = () => {};
    req.destroy = () => { destroys++; };
    return req;
  };
  const pending = runOperatorLocalCanary(record, { env, requestImpl });
  const rejected = assert.rejects(pending, /complete canary response/);
  t.mock.timers.tick(29999);
  assert.equal(destroys, 0);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(calls, 1);
  assert.equal(destroys, 1);
});
