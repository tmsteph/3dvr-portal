'use strict';

// Gate 1, Step 4 tool bridge tests. Tools are exercised end to end through
// the REAL operator-core (policy, hash-bound approvals, audit) behind the
// apps/agent planner: the model proposes typed tool actions, read tools
// run only after the core executes them, and gmail.draft (R2) cannot fire
// without an owner approval bound to the exact action hash. All data is
// fabricated: files live in per-test temp dirs, Gmail/calendar/browser
// handlers are injected fakes, and nothing here touches a real account.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
const {
  createToolBridge,
  TOOL_CAPABILITIES,
} = require('../thomas-agent/node/operator-tools');

const POLICY = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'operator-core', 'policy', 'fixtures', 'default-policy.json'), 'utf8'),
);
const NOW = new Date().toISOString();
const okCapacity = { check: async () => ({ ok: true, availableMiB: 2048, minAvailableMiB: 512, reason: 'capacity ok' }) };

function makeToolDevice() {
  return {
    device_id: 'dev_laptop01', kind: 'host_agent', display_name: 'dev_laptop01',
    public_key: 'dev-key', enrolled_at: NOW,
    capabilities: Object.entries(TOOL_CAPABILITIES).map(([name, risk]) => ({
      name, version: '1.0.0', risk, args_schema: {}, preconditions: [],
      description: `Gate 1 tool bridge capability ${name}`,
    })),
    trust: { status: 'healthy', last_seen_at: NOW },
  };
}

function plannerWithTools(rawPlan, bridgeOptions = {}, extra = {}) {
  const core = new OperatorCore(POLICY);
  const router = new ModelRouter([new FakeProvider('fake:test', rawPlan)]);
  const tools = createToolBridge(bridgeOptions);
  const planner = createPlanner({
    enabled: true, router, core, capacityChecker: okCapacity,
    devices: [makeToolDevice()], tools, ...extra,
  });
  return { planner, core, tools };
}

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-tools-test-'));
  fs.writeFileSync(path.join(dir, 'note.txt'), 'fabricated note contents\n');
  return dir;
}

test('tool capability tiers match the Gate 1 spec (reads low-risk, draft R2)', () => {
  assert.deepEqual(TOOL_CAPABILITIES, {
    'files.read': 'R0',
    'files.write': 'R1',
    'gmail.search': 'R0',
    'gmail.read': 'R0',
    'calendar.read': 'R0',
    'browser.read': 'R1',
    'gmail.draft': 'R2',
  });
});

test('files.write and files.read run end to end through policy with receipts', async () => {
  const dir = makeWorkspace();
  const plan = JSON.stringify([
    { device_id: 'dev_laptop01', capability: 'files.write', args: { path: 'out/report.txt', content: 'quarterly summary\n' } },
    { device_id: 'dev_laptop01', capability: 'files.read', args: { path: 'note.txt' } },
  ]);
  const { planner, core } = plannerWithTools(plan, { workspaceDir: dir });

  const planned = await planner.plan('Write the summary, then read my note back');
  assert.equal(planned.status, 'planned');
  assert.equal(planned.approved.length, 2);
  assert.equal(planned.needsApproval.length, 0);

  const { status, receipts, tool_results } = await planner.execute(planned.job_id);
  assert.equal(status, 'executed');
  assert.equal(receipts.filter((r) => r.outcome === 'success').length, 2);
  assert.equal(tool_results.length, 2);

  // The write really landed, and its receipt surface shows path + hash.
  assert.equal(fs.readFileSync(path.join(dir, 'out', 'report.txt'), 'utf8'), 'quarterly summary\n');
  const write = tool_results.find((t) => t.capability === 'files.write');
  assert.equal(write.applied, true);
  assert.equal(write.result.path, 'out/report.txt');
  assert.equal(
    write.result.sha256,
    crypto.createHash('sha256').update('quarterly summary\n', 'utf8').digest('hex'),
  );

  const read = tool_results.find((t) => t.capability === 'files.read');
  assert.equal(read.applied, true);
  assert.equal(read.result.content, 'fabricated note contents\n');

  assert.equal(core.getJob(planned.job_id).status, 'completed');
  assert.equal(core.audit.verifyChain(planned.job_id), true);
});

test('a files path escaping the workspace fails closed with a corrective receipt', async () => {
  const dir = makeWorkspace();
  const plan = JSON.stringify([
    { device_id: 'dev_laptop01', capability: 'files.read', args: { path: '../outside-secret.txt' } },
  ]);
  const { planner, core } = plannerWithTools(plan, { workspaceDir: dir });

  const planned = await planner.plan('Read the file outside the workspace');
  const result = await planner.execute(planned.job_id);
  assert.equal(result.status, 'effect_failed');
  assert.equal(result.tool_results.length, 1);
  assert.equal(result.tool_results[0].applied, false);
  assert.match(result.tool_results[0].reason, /escapes the tool workspace/);

  const audit = core.audit.forJob(planned.job_id);
  const corrective = audit.filter((r) => r.outcome === 'failed');
  assert.equal(corrective.length, 1);
  assert.match(corrective[0].reason_code, /^tool_effect_failed:/);
  assert.equal(core.getJob(planned.job_id).status, 'failed');
  assert.equal(core.audit.verifyChain(planned.job_id), true);
});

test('gmail.search and gmail.read run through the bridge handlers', async () => {
  const calls = [];
  const plan = JSON.stringify([
    { device_id: 'dev_laptop01', capability: 'gmail.search', args: { query: 'invoice', max_results: 5 } },
    { device_id: 'dev_laptop01', capability: 'gmail.read', args: { message_id: 'msg_123' } },
  ]);
  const { planner } = plannerWithTools(plan, {
    handlers: {
      gmailSearch: async (args) => { calls.push(['search', args]); return { messages: [{ id: 'msg_123' }] }; },
      gmailRead: async (args) => { calls.push(['read', args]); return { id: args.message_id, subject: 'Fabricated invoice' }; },
    },
  });

  const planned = await planner.plan('Find the invoice mail and read it');
  const { status, tool_results } = await planner.execute(planned.job_id);
  assert.equal(status, 'executed');
  assert.deepEqual(calls.map(([kind]) => kind), ['search', 'read']);
  assert.deepEqual(calls[0][1], { query: 'invoice', max_results: 5 });
  assert.deepEqual(tool_results[0].result, { messages: [{ id: 'msg_123' }] });
  assert.equal(tool_results[1].result.subject, 'Fabricated invoice');
});

test('gmail.draft is approval-gated: unapproved creates nothing, approved creates the draft', async () => {
  const drafts = [];
  const plan = JSON.stringify([
    {
      device_id: 'dev_laptop01', capability: 'gmail.draft',
      args: { to: 'sam@example.test', subject: 'Hello', body: 'Fabricated draft body' },
    },
  ]);
  const { planner, core } = plannerWithTools(plan, {
    handlers: {
      gmailDraft: async (args) => { drafts.push(args); return { draft_id: 'draft_1' }; },
    },
  });

  const planned = await planner.plan('Draft a hello to Sam');
  assert.equal(planned.status, 'planned');
  assert.equal(planned.approved.length, 0);
  assert.equal(planned.needsApproval.length, 1);
  assert.equal(planned.needsApproval[0].capability, 'gmail.draft');

  // No approval: the core denies at execution and the bridge never runs.
  const deniedRun = await planner.execute(planned.job_id);
  assert.equal(deniedRun.receipts.length, 1);
  assert.equal(deniedRun.receipts[0].outcome, 'denied');
  assert.match(deniedRun.receipts[0].reason_code, /^approval:/);
  assert.equal(deniedRun.tool_results, undefined);
  assert.equal(drafts.length, 0);

  // Owner approves the exact action hash: now the draft is created, once.
  core.approve(planned.envelopes[0].action_id, 'owner');
  const approvedRun = await planner.execute(planned.job_id);
  assert.equal(approvedRun.status, 'executed');
  assert.equal(drafts.length, 1);
  assert.deepEqual(drafts[0], { to: 'sam@example.test', subject: 'Hello', body: 'Fabricated draft body' });
  assert.equal(approvedRun.tool_results[0].applied, true);
  assert.equal(approvedRun.tool_results[0].result.draft_id, 'draft_1');
});

test('calendar.read fails closed by default and runs with an injected handler', async () => {
  const plan = JSON.stringify([
    { device_id: 'dev_laptop01', capability: 'calendar.read', args: { date: '2026-11-03' } },
  ]);

  // No calendar connector exists in apps/agent: the default handler must
  // refuse honestly, not fabricate events.
  const fallback = plannerWithTools(plan, { workspaceDir: makeWorkspace() });
  const plannedDefault = await fallback.planner.plan('What is on my calendar tomorrow?');
  const defaultRun = await fallback.planner.execute(plannedDefault.job_id);
  assert.equal(defaultRun.status, 'effect_failed');
  assert.equal(defaultRun.tool_results[0].applied, false);
  assert.match(defaultRun.tool_results[0].reason, /no calendar connector/);

  const injected = plannerWithTools(plan, {
    handlers: {
      calendarRead: async (args) => ({ date: args.date, events: [{ title: 'Fabricated standup' }] }),
    },
  });
  const plannedInjected = await injected.planner.plan('What is on my calendar tomorrow?');
  const injectedRun = await injected.planner.execute(plannedInjected.job_id);
  assert.equal(injectedRun.status, 'executed');
  assert.equal(injectedRun.tool_results[0].result.events[0].title, 'Fabricated standup');
});

test('browser.read fetches a public page as text and refuses non-http URLs', async () => {
  const bridge = createToolBridge({
    browser: {
      fetchImpl: async (url) => ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => `fetched ${url}`,
      }),
    },
  });
  const page = await bridge.execute('browser.read', { url: 'https://example.test/page' });
  assert.equal(page.status, 200);
  assert.equal(page.text, 'fetched https://example.test/page');

  await assert.rejects(
    () => bridge.execute('browser.read', { url: 'file:///etc/passwd' }),
    /only fetches http\(s\) URLs/,
  );
  await assert.rejects(
    () => bridge.execute('browser.read', { url: 'https://user:secret@example.test/' }),
    /embedded credentials/,
  );
  await assert.rejects(() => bridge.execute('browser.read', {}), /needs a non-empty string arg: url/);
});

test('unknown capabilities fail closed at the bridge and at plan time', async () => {
  const bridge = createToolBridge({ workspaceDir: makeWorkspace() });
  await assert.rejects(() => bridge.execute('gmail.send', {}), /unknown tool capability/);

  // A model proposal naming a capability the device does not grant never
  // becomes a job at all (the Step 1 router validation fails closed).
  const plan = JSON.stringify([
    { device_id: 'dev_laptop01', capability: 'gmail.send', args: { to: 'sam@example.test' } },
  ]);
  const { planner } = plannerWithTools(plan, { workspaceDir: makeWorkspace() });
  const result = await planner.plan('Send an email to Sam');
  assert.equal(result.status, 'failed_closed');
  assert.equal(result.job_id, undefined);
});

test('disabled planner performs no tool calls, and env wiring is opt-in', async () => {
  let handlerCalls = 0;
  const spyHandlers = {
    gmailSearch: async () => { handlerCalls += 1; return {}; },
  };
  const plan = JSON.stringify([
    { device_id: 'dev_laptop01', capability: 'gmail.search', args: { query: 'x' } },
  ]);
  const core = new OperatorCore(POLICY);
  const router = new ModelRouter([new FakeProvider('fake:test', plan)]);
  const deps = {
    router, core, capacityChecker: okCapacity,
    devices: [makeToolDevice()], tools: createToolBridge({ handlers: spyHandlers }),
  };

  const off = createPlanner({ enabled: false, ...deps });
  assert.deepEqual(await off.plan('search mail'), { status: 'disabled' });
  assert.deepEqual(await off.execute('job_nope'), { status: 'disabled' });

  // Env factory: no OPERATOR_TOOLS_WORKSPACE_DIR means no bridge is
  // built, and the planner itself stays off without its own switch.
  const fromEnvOff = plannerFromEnv({}, deps);
  assert.equal(fromEnvOff.enabled, false);
  assert.equal(handlerCalls, 0);

  // With both switches on, the env-built bridge serves files.* from the
  // configured workspace directory.
  const dir = makeWorkspace();
  const envPlanner = plannerFromEnv(
    { OPERATOR_PLANNER_ENABLED: '1', OPERATOR_TOOLS_WORKSPACE_DIR: dir },
    {
      router: new ModelRouter([new FakeProvider('fake:test', JSON.stringify([
        { device_id: 'dev_laptop01', capability: 'files.read', args: { path: 'note.txt' } },
      ]))]),
      core: new OperatorCore(POLICY),
      capacityChecker: okCapacity,
      devices: [makeToolDevice()],
    },
  );
  const envPlanned = await envPlanner.plan('Read my note');
  const envRun = await envPlanner.execute(envPlanned.job_id);
  assert.equal(envRun.status, 'executed');
  assert.equal(envRun.tool_results[0].result.content, 'fabricated note contents\n');
});
