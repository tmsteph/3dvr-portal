const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { runOperatorCodexTask } = require('../thomas-agent/node/operator-codex-task');

const record = { id: 'operator-http-test-receipt', backend: 'codex', unsafe: false, task: 'Synthetic arithmetic only' };
function transport(payload, code = 0, chunks = null) {
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
      if (chunks) for (const chunk of chunks) child.stdout.write(chunk);
      else child.stdout.write(JSON.stringify(payload));
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

test('native escaped multilingual receipts retain valid replies within the decoded limit', async () => {
  const reply = '界'.repeat(40000);
  const wire = JSON.stringify({ ok: true, session: record.id, engine: 'Codex', reply })
    .replace(/[^\x00-\x7f]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
  assert.ok(Buffer.byteLength(wire) > 200000);
  assert.equal(Buffer.byteLength(reply), 120000);
  const io = transport(null, 0, [wire.slice(0, 100000), wire.slice(100000)]);
  assert.equal((await runOperatorCodexTask(record, io)).result.stdout, reply);
  assert.equal(io.calls(), 1);
});

test('native transport preserves split UTF-8 and rejects oversized wire output', async () => {
  const reply = 'A界B';
  const wire = Buffer.from(JSON.stringify({ ok: true, session: record.id, engine: 'Codex', reply }));
  const split = wire.indexOf(Buffer.from('界')) + 1;
  const io = transport(null, 0, [wire.subarray(0, split), wire.subarray(split)]);
  assert.equal((await runOperatorCodexTask(record, io)).result.stdout, reply);
  const oversized = transport(null, 0, [Buffer.alloc(724097, 32), wire]);
  await assert.rejects(runOperatorCodexTask(record, oversized), /interrupted/);
  assert.equal(oversized.calls(), 1);
});
