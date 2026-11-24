const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { runOperatorCodexTask } = require('../thomas-agent/node/operator-codex-task');

const record = { id: 'operator-http-test-receipt', backend: 'codex', unsafe: false, task: 'Synthetic arithmetic only' };
function transport(payload, code = 0) {
  let calls = 0;
  const spawn = (command, args) => {
    calls++;
    assert.equal(command, 'ssh');
    const request = JSON.parse(Buffer.from(args.at(-1), 'base64url').toString('utf8'));
    assert.equal(request.session, record.id);
    assert.equal(request.taskMode, true);
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    child.stdin.on('finish', () => {
      child.stdout.write(JSON.stringify(payload));
      child.emit('close', code);
    });
    return child;
  };
  return { spawn, calls: () => calls };
}

test('native receipt must be for the exact task, engine, and a nonempty final reply', async () => {
  const good = { ok: true, session: record.id, engine: 'Codex', reply: '42' };
  const io = transport(good);
  assert.deepEqual(await runOperatorCodexTask(record, io),
    { ok: true, backend: 'codex', result: { stdout: '42' } });
  assert.equal(io.calls(), 1);
  for (const bad of [
    { ...good, session: 'operator-http-different' },
    { ...good, session: undefined },
    { ...good, engine: 'other' },
    { ...good, reply: undefined },
    { ...good, reply: '   ' },
    { ...good, reply: { text: '42' } },
    { ...good, reply: 'x'.repeat(120001) },
    { ...good, ok: 'true' },
    null,
  ]) {
    const badIo = transport(bad);
    await assert.rejects(runOperatorCodexTask(record, badIo), /interrupted; check the saved task before retrying/);
    assert.equal(badIo.calls(), 1, 'ambiguous results must not trigger another inference');
  }
});

test('explicit native failure and nonzero SSH exit are never successful receipts', async () => {
  const failure = transport({ ok: false, error: 'native failure' });
  assert.deepEqual(await runOperatorCodexTask(record, failure),
    { ok: false, backend: 'codex', result: { stderr: 'native failure' } });
  assert.equal(failure.calls(), 1);
  const disconnected = transport({ ok: true, session: record.id, engine: 'Codex', reply: '42' }, 1);
  await assert.rejects(runOperatorCodexTask(record, disconnected), /interrupted/);
  assert.equal(disconnected.calls(), 1);
});
