'use strict';

// Gate 1, Step 3 memory tests. Memory is exercised end to end through the
// REAL operator-core (policy, approvals, audit) behind the apps/agent
// planner: excerpts are injected into the model prompt, and write-backs are
// proposed as R2 `memory.write` actions that cannot land without an owner
// approval bound to the exact action hash. All memory content below is
// fabricated and lives in per-test temp directories - never real files.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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
const { createPlanner, plannerFromEnv } = require('../thomas-agent/node/operator-planner');
const { createFileMemoryStore } = require('../thomas-agent/node/operator-memory');

const POLICY = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'operator-core', 'policy', 'fixtures', 'default-policy.json'), 'utf8'),
);
const NOW = new Date().toISOString();

const ORIGINAL_MEMORY = [
  '# Memory',
  '',
  '## Preferences',
  '',
  'Alex prefers concise plain-language status updates and short numbered lists.',
  '',
  '## Ops',
  '',
  'The backup window runs at 03:00 UTC every night.',
  '',
].join('\n');

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-memory-test-'));
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), ORIGINAL_MEMORY);
  fs.mkdirSync(path.join(dir, 'people'));
  fs.writeFileSync(
    path.join(dir, 'people', 'sam-okafor.md'),
    '# Sam Okafor\n\nSam maintains the greenhouse sensor rig and likes tulip bulbs.\n',
  );
  fs.mkdirSync(path.join(dir, 'memory'));
  fs.writeFileSync(
    path.join(dir, 'memory', '2026-01-05.md'),
    '# 2026-01-05\n\nBought printer paper and replacement ink cartridges for the office shelf.\n',
  );
  return dir;
}

function makeHostDevice() {
  return {
    device_id: 'dev_laptop01', kind: 'host_agent', display_name: 'dev_laptop01',
    public_key: 'dev-key', enrolled_at: NOW,
    capabilities: [
      { name: 'host.file.read', version: '1.0.0', risk: 'R0', args_schema: {}, preconditions: [], description: 'Read file within workspace roots' },
      { name: 'host.file.write', version: '1.0.0', risk: 'R1', args_schema: {}, preconditions: [], description: 'Write file within workspace roots' },
      { name: 'memory.write', version: '1.0.0', risk: 'R2', args_schema: {}, preconditions: [], description: 'Write back to the owner memory files (approval required, diff-bound)' },
    ],
    trust: { status: 'healthy', last_seen_at: NOW },
  };
}

const okCapacity = { check: async () => ({ ok: true, availableMiB: 2048, minAvailableMiB: 512, reason: 'capacity ok' }) };
const VALID_PLAN = JSON.stringify([
  { device_id: 'dev_laptop01', capability: 'host.file.read', args: { path: '~/notes.md' } },
]);

function plannerFor(dir, extra = {}) {
  const core = new OperatorCore(POLICY);
  const router = new ModelRouter([new FakeProvider('fake:test', VALID_PLAN)]);
  const planner = createPlanner({
    enabled: true, router, core, capacityChecker: okCapacity,
    devices: [makeHostDevice()], memory: createFileMemoryStore(dir), ...extra,
  });
  return { planner, core };
}

test('relevant memory excerpt is injected into the model request', async () => {
  const dir = makeFixture();
  const prompts = [];
  const spyProvider = {
    id: 'spy',
    complete: async (context, prompt) => { prompts.push(prompt); return VALID_PLAN; },
  };
  const { planner } = plannerFor(dir, { router: new ModelRouter([spyProvider]) });

  const result = await planner.plan('How does Alex prefer status updates?');
  assert.equal(result.status, 'planned');
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Relevant memory from the owner's files/);
  assert.match(prompts[0], /concise plain-language status updates/);
  assert.ok(result.memory_hits.length >= 1);
  assert.equal(result.memory_hits[0].source, 'MEMORY.md');
});

test('irrelevant memory is not injected, and search results are bounded', async () => {
  const dir = makeFixture();
  const prompts = [];
  const spyProvider = {
    id: 'spy',
    complete: async (context, prompt) => { prompts.push(prompt); return VALID_PLAN; },
  };
  const { planner } = plannerFor(dir, { router: new ModelRouter([spyProvider]) });

  const result = await planner.plan('Tell me about the greenhouse sensor rig');
  assert.equal(result.status, 'planned');
  assert.match(prompts[0], /greenhouse sensor rig/);
  assert.doesNotMatch(prompts[0], /printer paper/);
  assert.doesNotMatch(prompts[0], /plain-language status updates/);
  assert.ok(result.memory_hits.every((h) => h.source === 'people/sam-okafor.md'));

  // Bounds: many matching blocks, tight caps -> few, small excerpts only.
  const boundedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-memory-bounds-'));
  const paragraphs = Array.from({ length: 6 }, (_, i) => `Backup note ${i}: the backup window and the backup checks for shard ${i} all mention backup repeatedly.`);
  fs.writeFileSync(path.join(boundedDir, 'MEMORY.md'), paragraphs.join('\n\n'));
  const bounded = createFileMemoryStore(boundedDir, { maxExcerpts: 2, maxExcerptChars: 40, maxTotalChars: 90 });
  const hits = bounded.search('backup window checks');
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => h.text.length <= 41));
  // Total excerpt text stays within the configured total bound (the format
  // wrapper only adds a short source header per hit on top of that).
  assert.ok(hits.reduce((sum, h) => sum + h.text.length, 0) <= 90);
});

test('memory write-back is proposed with a diff and does not land without approval', async () => {
  const dir = makeFixture();
  const { planner, core } = plannerFor(dir);
  const updated = ORIGINAL_MEMORY.replace('03:00 UTC', '04:00 UTC')
    + 'Alex keeps a paper notebook for train trips.\n';

  const proposal = await planner.proposeMemoryWrite({ path: 'MEMORY.md', content: updated });
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.approved.length, 0);
  assert.equal(proposal.needsApproval.length, 1);
  assert.equal(proposal.needsApproval[0].capability, 'memory.write');
  // The diff is visible in the proposal and in the hash-bound envelope args.
  assert.match(proposal.diff, /-The backup window runs at 03:00 UTC every night\./);
  assert.match(proposal.diff, /\+The backup window runs at 04:00 UTC every night\./);
  assert.match(proposal.diff, /\+Alex keeps a paper notebook for train trips\./);
  assert.equal(proposal.envelopes[0].args.diff, proposal.diff);
  // Nothing written yet - the file on disk is untouched.
  assert.equal(fs.readFileSync(path.join(dir, 'MEMORY.md'), 'utf8'), ORIGINAL_MEMORY);

  // Executing without approval is denied by the core and writes nothing.
  const { receipts, memory_writes } = await planner.execute(proposal.job_id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].outcome, 'denied');
  assert.match(receipts[0].reason_code, /^approval:/);
  assert.equal(memory_writes, undefined);
  assert.equal(fs.readFileSync(path.join(dir, 'MEMORY.md'), 'utf8'), ORIGINAL_MEMORY);
  assert.equal(core.audit.forJob(proposal.job_id).filter((r) => r.outcome === 'success').length, 0);
});

test('approved memory write-back lands exactly as proposed', async () => {
  const dir = makeFixture();
  const { planner, core } = plannerFor(dir);
  const updated = ORIGINAL_MEMORY.replace('03:00 UTC', '04:00 UTC')
    + 'Alex keeps a paper notebook for train trips.\n';

  const proposal = await planner.proposeMemoryWrite({ path: 'MEMORY.md', content: updated });
  core.approve(proposal.envelopes[0].action_id, 'owner');

  const { receipts, memory_writes } = await planner.execute(proposal.job_id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].outcome, 'success');
  assert.equal(memory_writes.length, 1);
  assert.equal(memory_writes[0].applied, true);
  assert.equal(memory_writes[0].path, 'MEMORY.md');
  assert.equal(fs.readFileSync(path.join(dir, 'MEMORY.md'), 'utf8'), updated);
  assert.equal(core.audit.verifyChain(proposal.job_id), true);
});

test('a write-back tampered after approval is rejected by the hash binding', async () => {
  const dir = makeFixture();
  const { planner, core } = plannerFor(dir);
  const updated = `${ORIGINAL_MEMORY}Alex keeps a paper notebook for train trips.\n`;

  const proposal = await planner.proposeMemoryWrite({ path: 'MEMORY.md', content: updated });
  core.approve(proposal.envelopes[0].action_id, 'owner');

  // Substitute different content after approval: the action hash no longer
  // matches the approval, so the core must deny and nothing may be written.
  proposal.envelopes[0].args.new_content = `${updated}Sneaky unapproved line.\n`;

  const { receipts, memory_writes } = await planner.execute(proposal.job_id);
  assert.equal(receipts[0].outcome, 'denied');
  assert.match(receipts[0].reason_code, /^approval:/);
  assert.equal(memory_writes, undefined);
  assert.equal(fs.readFileSync(path.join(dir, 'MEMORY.md'), 'utf8'), ORIGINAL_MEMORY);
});

test('a memory file edited after approval is not clobbered', async () => {
  const dir = makeFixture();
  const { planner, core } = plannerFor(dir);
  const updated = `${ORIGINAL_MEMORY}Alex keeps a paper notebook for train trips.\n`;

  const proposal = await planner.proposeMemoryWrite({ path: 'MEMORY.md', content: updated });
  core.approve(proposal.envelopes[0].action_id, 'owner');

  // The owner edits the file by hand before the approved write executes.
  const ownerEdit = `${ORIGINAL_MEMORY}Owner edit made while the write waited.\n`;
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), ownerEdit);

  const { receipts, memory_writes } = await planner.execute(proposal.job_id);
  assert.equal(receipts[0].outcome, 'success'); // the core executed the approved action
  assert.equal(memory_writes.length, 1);
  assert.equal(memory_writes[0].applied, false);
  assert.match(memory_writes[0].reason, /no longer matches the approved diff/);
  assert.equal(fs.readFileSync(path.join(dir, 'MEMORY.md'), 'utf8'), ownerEdit);
});

test('planner off means no memory load, no model call, nothing proposed', async () => {
  let providerCalls = 0;
  let capacityCalls = 0;
  const memoryCalls = { search: 0, format: 0, readText: 0, diff: 0, applyApprovedWrite: 0 };
  const spyStore = {
    search: () => { memoryCalls.search += 1; return []; },
    format: () => { memoryCalls.format += 1; return ''; },
    readText: () => { memoryCalls.readText += 1; return ''; },
    diff: () => { memoryCalls.diff += 1; return ''; },
    applyApprovedWrite: () => { memoryCalls.applyApprovedWrite += 1; return { applied: true }; },
  };
  const spyProvider = {
    id: 'spy',
    complete: async () => { providerCalls += 1; return VALID_PLAN; },
  };
  const deps = {
    router: new ModelRouter([spyProvider]),
    core: new OperatorCore(POLICY),
    capacityChecker: { check: async () => { capacityCalls += 1; return { ok: true }; } },
    devices: [makeHostDevice()],
    memory: spyStore,
  };

  const off = createPlanner({ enabled: false, ...deps });
  assert.deepEqual(await off.plan('How does Alex prefer status updates?'), { status: 'disabled' });
  assert.deepEqual(await off.proposeMemoryWrite({ path: 'MEMORY.md', content: 'x' }), { status: 'disabled' });
  assert.deepEqual(await off.execute('job_nope'), { status: 'disabled' });

  // The env factory also stays off (and inert) without the planner switch,
  // even when a memory directory is configured.
  const dir = makeFixture();
  const fromEnv = plannerFromEnv({ OPERATOR_MEMORY_DIR: dir }, deps);
  assert.equal(fromEnv.enabled, false);
  assert.deepEqual(await fromEnv.plan('anything'), { status: 'disabled' });

  assert.equal(providerCalls, 0);
  assert.equal(capacityCalls, 0);
  assert.deepEqual(memoryCalls, { search: 0, format: 0, readText: 0, diff: 0, applyApprovedWrite: 0 });
});

test('memory store refuses paths outside the memory directory', () => {
  const dir = makeFixture();
  const store = createFileMemoryStore(dir);
  assert.throws(() => store.readText('../outside.md'), /escapes the memory directory/);
  assert.throws(() => store.readText('/etc/passwd'), /must be relative/);
  assert.throws(
    () => store.applyApprovedWrite({ relPath: '../evil.md', newContent: 'x', diff: 'y' }),
    /escapes the memory directory/,
  );
  assert.equal(store.readText('people/missing.md'), null);
});

test('symlinked memory file escaping the directory is refused for read, search and write', () => {
  const dir = makeFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-memory-outside-'));
  const secretPath = path.join(outside, 'secret.md');
  const secret = '# Secret\n\nThe launch code is falcon nine.\n';
  fs.writeFileSync(secretPath, secret);
  fs.rmSync(path.join(dir, 'MEMORY.md'));
  fs.symlinkSync(secretPath, path.join(dir, 'MEMORY.md'));

  const store = createFileMemoryStore(dir);
  assert.throws(() => store.readText('MEMORY.md'), /escapes the memory directory/);
  assert.throws(() => store.search('launch code falcon'), /escapes the memory directory/);
  assert.throws(
    () => store.applyApprovedWrite({ relPath: 'MEMORY.md', newContent: 'overwritten', diff: 'y' }),
    /escapes the memory directory/,
  );
  // The outside file is untouched.
  assert.equal(fs.readFileSync(secretPath, 'utf8'), secret);
});

test('symlinked memory subdirectory escaping the directory is refused for read and write', () => {
  const dir = makeFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-memory-outside-'));
  fs.writeFileSync(path.join(outside, 'mallory.md'), '# Mallory\n\nOutside person with a telescope diary.\n');
  fs.rmSync(path.join(dir, 'people'), { recursive: true });
  fs.symlinkSync(outside, path.join(dir, 'people'), 'dir');

  const store = createFileMemoryStore(dir);
  assert.throws(() => store.readText('people/mallory.md'), /escapes the memory directory/);
  assert.throws(() => store.search('telescope diary'), /escapes the memory directory/);
  assert.throws(
    () => store.applyApprovedWrite({ relPath: 'people/mallory.md', newContent: 'overwritten', diff: 'y' }),
    /escapes the memory directory/,
  );
  assert.equal(
    fs.readFileSync(path.join(outside, 'mallory.md'), 'utf8'),
    '# Mallory\n\nOutside person with a telescope diary.\n',
  );
});

test('a memory write that does not land leaves a failed record, not a completed success', async () => {
  const dir = makeFixture();
  const { planner, core } = plannerFor(dir);
  const updated = `${ORIGINAL_MEMORY}Alex keeps a paper notebook for train trips.\n`;

  const proposal = await planner.proposeMemoryWrite({ path: 'MEMORY.md', content: updated });
  core.approve(proposal.envelopes[0].action_id, 'owner');

  // The owner edits the file by hand before the approved write executes,
  // so the store refuses to apply it (diff no longer matches).
  const ownerEdit = `${ORIGINAL_MEMORY}Owner edit made while the write waited.\n`;
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), ownerEdit);

  const { status, receipts, memory_writes } = await planner.execute(proposal.job_id);
  assert.equal(memory_writes[0].applied, false);
  assert.equal(status, 'effect_failed');
  // The audit trail's final word on this action is the corrective failure,
  // chained after the core's dispatch receipt - not a bare success.
  const trail = core.audit.forJob(proposal.job_id);
  const last = trail[trail.length - 1];
  assert.equal(last.action_id, proposal.envelopes[0].action_id);
  assert.equal(last.outcome, 'failed');
  assert.match(last.reason_code, /^memory_write_not_applied:/);
  assert.equal(receipts[receipts.length - 1], last);
  // The job is not left claiming completion, and the chain still verifies.
  assert.equal(core.getJob(proposal.job_id).status, 'failed');
  assert.equal(core.audit.verifyChain(proposal.job_id), true);
  assert.equal(fs.readFileSync(path.join(dir, 'MEMORY.md'), 'utf8'), ownerEdit);
});

test('a memory file swapped for an escaping symlink after approval is refused and recorded failed', async () => {
  const dir = makeFixture();
  const { planner, core } = plannerFor(dir);
  const updated = `${ORIGINAL_MEMORY}Alex keeps a paper notebook for train trips.\n`;

  const proposal = await planner.proposeMemoryWrite({ path: 'MEMORY.md', content: updated });
  core.approve(proposal.envelopes[0].action_id, 'owner');

  // Swap the real file for a symlink out of the memory directory between
  // approval and execution: the write must be refused, not followed.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-memory-outside-'));
  const outsidePath = path.join(outside, 'outside.md');
  fs.writeFileSync(outsidePath, 'outside contents\n');
  fs.rmSync(path.join(dir, 'MEMORY.md'));
  fs.symlinkSync(outsidePath, path.join(dir, 'MEMORY.md'));

  const { status, memory_writes } = await planner.execute(proposal.job_id);
  assert.equal(status, 'effect_failed');
  assert.equal(memory_writes[0].applied, false);
  assert.match(memory_writes[0].reason, /escapes the memory directory/);
  assert.equal(fs.readFileSync(outsidePath, 'utf8'), 'outside contents\n');
  assert.equal(core.getJob(proposal.job_id).status, 'failed');
});
