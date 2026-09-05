const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const { remember } = require('../thomas-agent/node/digital-organism');
const { promoteStrategy } = require('../thomas-agent/node/retrieval-lab');

const execFileAsync = promisify(execFile);
const bridge = path.join(__dirname, '..', 'thomas-agent', 'node', 'digital-organism-bridge.js');

async function tempState() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'organism-bridge-adaptive-'));
}

async function bridgeContext(stateDir, query) {
  const encoded = Buffer.from(query, 'utf8').toString('base64url');
  const { stdout } = await execFileAsync(process.execPath, [bridge, 'context', encoded, '5'], {
    env: { ...process.env, THREEDVR_ORGANISM_DIR: stateDir }
  });
  return JSON.parse(stdout).context;
}

test('private recall stays on baseline when no strategy has been promoted', async () => {
  const stateDir = await tempState();
  await remember('The durable memory node is OVH.', { subject: 'organism runtime', stateDir });
  const context = await bridgeContext(stateDir, 'durable memory node');
  assert.equal(context.strategy, 'baseline-jaccard');
  assert.equal(context.hits[0].strategy, 'baseline-jaccard');
});

test('private recall uses a promoted Retrieval Lab strategy', async () => {
  const stateDir = await tempState();
  await remember('The durable memory node is OVH.', { subject: 'organism runtime', stateDir });
  await promoteStrategy('query-coverage', null, { stateDir });
  const context = await bridgeContext(stateDir, 'durable memory node');
  assert.equal(context.strategy, 'query-coverage');
  assert.equal(context.hits[0].strategy, 'query-coverage');
});
