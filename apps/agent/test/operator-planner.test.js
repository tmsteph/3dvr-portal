'use strict';

// Gate 1, Step 2 planner tests. These exercise the REAL operator-core
// (Gate 0 core + Step 1 model router) behind the apps/agent planner service,
// so policy behavior is tested, not mimicked. The operator-core dist is
// built on demand below if it is missing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const CORE_PKG = path.join(ROOT, 'operator-core', 'operator-core');
const CORE_DIST = path.join(CORE_PKG, 'dist');

if (!fs.existsSync(path.join(CORE_DIST, 'core.js'))) {
  execSync('npm run build', { cwd: CORE_PKG, stdio: 'inherit' });
}

const { OperatorCore } = require(path.join(CORE_DIST, 'core.js'));
const { ModelRouter } = require(path.join(CORE_DIST, 'model', 'router.js'));
const { FakeProvider } = require(path.join(CORE_DIST, 'model', 'providers.js'));
const {
  createPlanner,
  plannerFromEnv,
  createCapacityChecker,
} = require('../thomas-agent/node/operator-planner');

const POLICY = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'operator-core', 'policy', 'fixtures', 'default-policy.json'), 'utf8'),
);
const NOW = new Date().toISOString();

function makeDevice(id, kind) {
  const capabilities = kind === 'host_agent'
    ? [
      { name: 'host.file.write', version: '1.0.0', risk: 'R1', args_schema: {}, preconditions: [], description: 'Write file within workspace roots' },
      { name: 'host.file.read', version: '1.0.0', risk: 'R0', args_schema: {}, preconditions: [], description: 'Read file within workspace roots' },
    ]
    : [
      { name: 'message.send', version: '1.0.0', risk: 'R2', args_schema: {}, preconditions: ['screen_unlocked'], description: 'Send a message (external)' },
    ];
  return {
    device_id: id, kind, display_name: id, public_key: 'dev-key',
    enrolled_at: NOW, capabilities,
    trust: { status: 'healthy', last_seen_at: NOW },
  };
}

const DEVICES = [makeDevice('dev_laptop01', 'host_agent'), makeDevice('dev_pixel01', 'android_companion')];
const okCapacity = { check: async () => ({ ok: true, availableMiB: 2048, minAvailableMiB: 512, reason: 'capacity ok' }) };

function plannerWith(rawModelOutput, extra = {}) {
  const core = new OperatorCore(POLICY);
  const router = new ModelRouter([new FakeProvider('fake:test', rawModelOutput)]);
  const planner = createPlanner({
    enabled: true, router, core, capacityChecker: okCapacity, devices: DEVICES, ...extra,
  });
  return { planner, core };
}

test('model-proposed R2 action does not execute without approval', async () => {
  const plan = JSON.stringify([
    { device_id: 'dev_pixel01', capability: 'message.send', args: { to: 'Esai', text: 'saved' } },
  ]);
  const { planner, core } = plannerWith(plan);

  const result = await planner.plan('Text Esai that the notes are saved');
  assert.equal(result.status, 'planned');
  assert.equal(result.approved.length, 0);
  assert.equal(result.needsApproval.length, 1);
  assert.equal(result.needsApproval[0].capability, 'message.send');
  assert.equal(core.getJob(result.job_id).status, 'awaiting_approval');

  const { receipts } = await planner.execute(result.job_id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].outcome, 'denied');
  assert.match(receipts[0].reason_code, /^approval:/);
  assert.equal(core.audit.forJob(result.job_id).filter((r) => r.outcome === 'success').length, 0);
});

test('invalid and hallucinated model output fails closed', async () => {
  const garbage = plannerWith('Sure! Doing it now.');
  const garbageResult = await garbage.planner.plan('do the thing');
  assert.equal(garbageResult.status, 'failed_closed');
  assert.equal(garbageResult.job_id, undefined);

  const hallucinated = plannerWith(JSON.stringify([
    { device_id: 'dev_laptop01', capability: 'host.system.shutdown', args: {} },
  ]));
  const hallucinatedResult = await hallucinated.planner.plan('shut it down');
  assert.equal(hallucinatedResult.status, 'failed_closed');
  assert.match(hallucinatedResult.reason, /not granted/);
  assert.equal(hallucinatedResult.job_id, undefined);
});

test('capacity gate blocks the job before any model call', async () => {
  let providerCalls = 0;
  const spyProvider = {
    id: 'spy',
    complete: async () => { providerCalls += 1; return '[]'; },
  };
  const planner = createPlanner({
    enabled: true,
    router: new ModelRouter([spyProvider]),
    core: new OperatorCore(POLICY),
    capacityChecker: createCapacityChecker({ minAvailableMiB: 512, readAvailable: () => 128 }),
    devices: DEVICES,
  });

  const result = await planner.plan('anything');
  assert.equal(result.status, 'capacity_blocked');
  assert.equal(result.capacity.availableMiB, 128);
  assert.equal(providerCalls, 0);
});

test('config switch off means the planner does nothing', async () => {
  let providerCalls = 0;
  let capacityCalls = 0;
  const spyProvider = {
    id: 'spy',
    complete: async () => { providerCalls += 1; return '[]'; },
  };
  const deps = {
    router: new ModelRouter([spyProvider]),
    core: new OperatorCore(POLICY),
    capacityChecker: { check: async () => { capacityCalls += 1; return { ok: true }; } },
    devices: DEVICES,
  };

  const off = createPlanner({ enabled: false, ...deps });
  assert.deepEqual(await off.plan('anything'), { status: 'disabled' });
  assert.deepEqual(await off.execute('job_nope'), { status: 'disabled' });

  // And the env factory defaults to off when the switch is unset.
  const fromEnv = plannerFromEnv({}, deps);
  assert.equal(fromEnv.enabled, false);
  assert.deepEqual(await fromEnv.plan('anything'), { status: 'disabled' });

  assert.equal(providerCalls, 0);
  assert.equal(capacityCalls, 0);
});

test('auto-allowed R1 plan executes end to end with a verifiable audit chain', async () => {
  const plan = JSON.stringify([
    { device_id: 'dev_laptop01', capability: 'host.file.write', args: { path: '~/notes.md', text: 'hi' } },
  ]);
  const { planner, core } = plannerWith(plan);

  const result = await planner.plan('Save notes to the laptop');
  assert.equal(result.status, 'planned');
  assert.equal(result.approved.length, 1);
  assert.equal(result.needsApproval.length, 0);

  const { receipts } = await planner.execute(result.job_id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].outcome, 'success');
  assert.equal(core.getJob(result.job_id).status, 'completed');
  assert.equal(core.audit.verifyChain(result.job_id), true);
});
