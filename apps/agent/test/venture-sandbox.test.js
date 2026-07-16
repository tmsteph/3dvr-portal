'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { EXTERNAL_ACTIONS, calculateRunwayDays, defaultCharter, resetStateDir, runSimulation } = require('../thomas-agent/node/venture-sandbox');

test('charter blocks every external and economic action', () => {
  const charter = defaultCharter();
  assert.equal(charter.mode, 'simulation_only');
  for (const action of EXTERNAL_ACTIONS) assert.equal(charter.actionPolicy[action], 'blocked');
});

test('simulation creates evidence without external activity', (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-sandbox-'));
  fs.writeFileSync(path.join(stateDir, '.3dvr-venture-sandbox'), 'test');
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const { state } = runSimulation({ stateDir, reset: true });
  assert.equal(state.cashCents, 6750);
  assert.equal(state.runwayDays, 196);
  assert.equal(state.offer.published, false);
  assert.equal(state.customersContacted, 0);
  assert.equal(state.readiness.realOperations, false);
  assert.equal(fs.statSync(path.join(stateDir, 'machine-private-key.pem')).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(path.join(stateDir, 'ledger.ndjson'), 'utf8').trim().split('\n').length, 3);
  assert.match(fs.readFileSync(path.join(stateDir, 'latest-report.md'), 'utf8'), /No customers, payments, outreach/);
});

test('subsequent cycles retain identity and do not duplicate seed capital', (t) => {
  const stateDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'venture-repeat-')), 'state');
  t.after(() => fs.rmSync(path.dirname(stateDir), { recursive: true, force: true }));
  const first = runSimulation({ stateDir });
  const second = runSimulation({ stateDir });
  assert.equal(first.state.identityFingerprint, second.state.identityFingerprint);
  const ledger = fs.readFileSync(path.join(stateDir, 'ledger.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(ledger.filter((row) => row.type === 'simulated_seed_capital').length, 1);
});

test('reset refuses an unmarked directory', (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-unmarked-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  assert.throws(() => resetStateDir(stateDir), /Refusing to reset/);
});

test('runway excludes reserved funds', () => {
  assert.equal(calculateRunwayDays(6750, 200, 1000), 196);
});
