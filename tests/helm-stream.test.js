import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readHelmResponse } from '../helm/stream.js';

test('browser parser preserves UTF-8 split at every byte and confirms only the final result', async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\n\r\nevent: delta\r\ndata: {"text":"Hello 🌍"}\r\n\r\nevent: result\r\ndata: {"ok":true,"reply":"Hello 🌍"}\r\n\r\n');
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const chunks = [];
  const result = await readHelmResponse(response, value => chunks.push(value));
  assert.deepEqual(chunks, ['Hello 🌍']);
  assert.equal(result.reply, 'Hello 🌍');
});

test('browser parser rejects missing completion and malformed terminal data', async () => {
  for (const text of ['event: delta\ndata: {"text":"Partial"}\n\n',
    'event: result\ndata: {"reply":"No completion flag"}\n\n']) {
    await assert.rejects(readHelmResponse(new Response(text,
      { headers: { 'Content-Type': 'text/event-stream' } })));
  }
  assert.deepEqual(await readHelmResponse(new Response('{"ok":false,"error":"Busy"}',
    { status: 429, headers: { 'Content-Type': 'application/json' } })), { ok: false, error: 'Busy' });
});

test('remote SSE parser emits fragments but rejects upstream interruption, errors, and oversized output', () => {
  const source = `
import runpy,io,json
read=runpy.run_path('src/openclaw/remote.py',run_name='helm_test')['read_stream']
parts=[]
wire=b': keepalive\\n\\ndata: {"choices":[{"delta":{"content":"Hello"}}]}\\n\\ndata: [DONE]\\n\\n'
assert read(io.BytesIO(wire),parts.append)=='Hello'
assert parts==['Hello']
for wire in [b'data: {"choices":[{"delta":{"content":"Partial"}}]}\\n\\n',
             b'data: {"error":{"message":"fail"}}\\n\\n', b'x'*128001]:
 try:read(io.BytesIO(wire),lambda x:None)
 except (ValueError,KeyError):pass
 else:raise AssertionError('accepted invalid stream')
print('remote-parser-ok')
`;
  const result = spawnSync('python3', ['-c', source], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /remote-parser-ok/);
});
