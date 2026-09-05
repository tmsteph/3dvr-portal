const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const { remember, forget, loadEvents } = require('../thomas-agent/node/digital-organism');

const execFileAsync = promisify(execFile);
const bridge = path.join(__dirname, '..', 'thomas-agent', 'node', 'digital-organism-bridge.js');

async function tempState() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'organism-bridge-feedback-'));
}

test('private bridge records explicit owner approval for an active memory', async () => {
  const stateDir = await tempState();
  const memory = await remember('The OVH Organism is the durable replica.', {
    subject: 'organism',
    stateDir,
  });
  const query = 'Where is the durable Organism replica?';
  const encoded = Buffer.from(query, 'utf8').toString('base64url');
  const { stdout } = await execFileAsync(process.execPath, [bridge, 'approve', encoded, memory.id], {
    env: { ...process.env, THREEDVR_ORGANISM_DIR: stateDir }
  });
  const response = JSON.parse(stdout);
  assert.deepEqual(response, { ok: true, memoryId: memory.id, duplicate: false });
  const events = await loadEvents({ stateDir });
  const feedback = events.find(event => event.type === 'retrieval-feedback');
  assert.equal(feedback.memoryId, memory.id);
  assert.equal(feedback.query, query);
  assert.equal(feedback.sourceType, 'owner-signed-portal');
});

test('private bridge makes identical owner approvals idempotent', async () => {
  const stateDir = await tempState();
  const memory = await remember('One approval should produce one event.', { stateDir });
  const query = 'Was this memory correct?';
  const encoded = Buffer.from(query, 'utf8').toString('base64url');
  const env = { ...process.env, THREEDVR_ORGANISM_DIR: stateDir };

  const first = JSON.parse((await execFileAsync(process.execPath, [bridge, 'approve', encoded, memory.id], { env })).stdout);
  const second = JSON.parse((await execFileAsync(process.execPath, [bridge, 'approve', encoded, memory.id], { env })).stdout);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);

  const events = await loadEvents({ stateDir });
  assert.equal(events.filter(event => event.type === 'retrieval-feedback').length, 1);
});

test('private bridge refuses approval for a forgotten memory', async () => {
  const stateDir = await tempState();
  const memory = await remember('Temporary memory.', { stateDir });
  await forget(memory.id, { stateDir });
  const encoded = Buffer.from('Was this right?', 'utf8').toString('base64url');
  await assert.rejects(
    execFileAsync(process.execPath, [bridge, 'approve', encoded, memory.id], {
      env: { ...process.env, THREEDVR_ORGANISM_DIR: stateDir }
    }),
    error => {
      const response = JSON.parse(error.stdout);
      assert.equal(response.ok, false);
      assert.match(response.error, /inactive or unknown/i);
      return true;
    }
  );
});
