const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { appendMemory, readDailyMemory } = require('../thomas-agent/node/operator-memory');

test('daily memories persist with provenance across reads', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'operator-memory-'));
  const at = '2026-10-10T12:00:00.000Z';
  const record = await appendMemory({ root, namespace: 'test-user', content: 'A verified note', source: 'user-message', timestamp: at });
  const saved = await readDailyMemory(root, 'test-user', at);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, record.id);
  assert.equal(saved[0].source, 'user-message');
  await fs.rm(root, { recursive: true, force: true });
});
test('invalid namespaces and missing provenance are rejected', async () => {
  await assert.rejects(() => appendMemory({ root: '/tmp', namespace: '../escape', content: 'x', source: 'user' }), /namespace/);
  await assert.rejects(() => appendMemory({ root: '/tmp', namespace: 'user', content: 'x', source: '' }), /source/);
});
