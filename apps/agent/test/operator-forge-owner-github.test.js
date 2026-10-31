const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  authorizePortalOperatorTask,
  BUILTIN_OPERATOR_OWNER_BINDINGS,
  BUILTIN_OPERATOR_OWNER_PUBS,
} = require('../thomas-agent/node/operator-forge-auth');
const { editOnlyTask, executorNeedsApproval, executorExecutionBlocked } = require('../thomas-agent/node/operator-forge-worker');

const TMSTEPH_PUB = 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg';

function signedRecord(task, githubWriteRequested = false) {
  return {
    id: 'operator-task-github-1',
    task,
    repo: 'portal',
    githubWriteRequested,
    requestedBy: 'portal-operator',
    authPub: TMSTEPH_PUB,
    authProof: 'proof-1',
  };
}

function verifiedOwnerTask(task, alias = 'tmsteph@3dvr', githubWriteRequested = true) {
  return {
    scope: 'operator-forge-task',
    action: 'queue-code-change',
    alias,
    pub: TMSTEPH_PUB,
    iat: 1_000_000,
    taskId: 'operator-task-github-1',
    repo: 'portal',
    task,
    githubWriteRequested,
  };
}

test('tmsteph is the built-in Forge owner binding', () => {
  assert.equal(BUILTIN_OPERATOR_OWNER_BINDINGS['tmsteph@3dvr'], TMSTEPH_PUB);
  assert.deepEqual(BUILTIN_OPERATOR_OWNER_PUBS, [TMSTEPH_PUB]);
});

test('verified tmsteph Forge request resolves as owner with signed GitHub permission', async () => {
  const task = 'Operator code request: Fix the nav and push the commit to GitHub.';
  const repoPath = path.resolve('/srv/3dvr-portal');
  const result = await authorizePortalOperatorTask(signedRecord(task, true), {
    now: 1_001_000,
    env: { THREEDVR_OPERATOR_PORTAL_REPO: repoPath },
    verifyImpl: async () => verifiedOwnerTask(task),
  });

  assert.equal(result.ok, true);
  assert.equal(result.role, 'owner');
  assert.equal(result.githubWriteApproved, true);
  assert.equal(result.repoPath, repoPath);
});

test('verified owner key survives a legacy tmsteph alias without suffix', async () => {
  const task = 'Operator code request: Fix the nav and push the commit to GitHub.';
  const result = await authorizePortalOperatorTask(signedRecord(task, true), {
    now: 1_001_000,
    env: {},
    verifyImpl: async () => verifiedOwnerTask(task, 'tmsteph'),
  });

  assert.equal(result.ok, true);
  assert.equal(result.role, 'owner');
  assert.equal(result.githubWriteApproved, true);
});

test('queued GitHub flag cannot be added after the owner signed the request', async () => {
  const task = 'Operator code request: Fix the nav spacing locally.';
  const result = await authorizePortalOperatorTask(signedRecord(task, true), {
    now: 1_001_000,
    env: {},
    verifyImpl: async () => verifiedOwnerTask(task, 'tmsteph@3dvr', false),
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /GitHub intent mismatch/i);
});

test('owner can authorize ordinary GitHub writes', () => {
  const result = editOnlyTask(
    signedRecord('Operator code request: Commit the fix, push it to GitHub, and open a PR.', true),
    { role: 'owner', githubWriteApproved: true },
  );
  assert.equal(result.ok, true);
  assert.equal(result.githubWrite, true);
});

test('local owner and developer edits are not misclassified as GitHub writes', () => {
  for (const role of ['owner', 'developer']) {
    const result = editOnlyTask(
      signedRecord('Operator code request: Fix the mobile navbar spacing locally.', false),
      { role, githubWriteApproved: false },
    );
    assert.equal(result.ok, true, role);
    assert.equal(result.githubWrite, false, role);
  }
});

test('ordinary developer cannot authorize GitHub writes', () => {
  const result = editOnlyTask(
    signedRecord('Operator code request: Commit the fix and push it to GitHub.', true),
    { role: 'developer', githubWriteApproved: false },
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /owner authorization/i);
});

test('worker does not mark a confirmation request as completed work', () => {
  assert.equal(executorNeedsApproval({
    ok: true,
    result: { stdout: 'Please confirm that I may create a branch, commit, and push.' },
  }), true);
  assert.equal(executorNeedsApproval({
    ok: true,
    result: { stdout: 'Updated the file, ran tests, committed, and pushed the branch.' },
  }), false);
});

test('worker treats a no-side-effect environment block as failure, not completion', () => {
  assert.equal(executorExecutionBlocked({
    ok: true,
    result: { stdout: 'Blocked by the execution environment; no side effects occurred. The workspace is read-only.' },
  }), true);
  assert.equal(executorExecutionBlocked({
    ok: true,
    result: { stdout: 'Updated the file, committed, and pushed successfully.' },
  }), false);
});

test('owner permission still blocks destructive GitHub and deployment actions', () => {
  for (const task of [
    'Operator code request: Force-push this branch.',
    'Operator code request: Delete the repository.',
    'Operator code request: Deploy this to production.',
    'Operator code request: Change repository secrets.',
  ]) {
    const result = editOnlyTask(signedRecord(task, true), { role: 'owner', githubWriteApproved: true });
    assert.equal(result.ok, false, task);
  }
});

const { mkdtemp, rm, readdir, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { runForgeRequest, runForgeWorkerOnce } = require('../thomas-agent/node/operator-forge-worker');
const safetySentence = 'Claim a working live link only after checking that URL; do not deploy without authorization.';

test('generated browser safety text does not block an edit or hide actual deployment intent', () => {
  const auth = { role: 'owner', githubWriteApproved: true };
  assert.equal(editOnlyTask(signedRecord('Operator code request: Fix the navbar. ' + safetySentence, true), auth).ok, true);
  assert.equal(editOnlyTask(signedRecord('Operator code request: Deploy this to production. ' + safetySentence, true), auth).ok, false);
  assert.equal(editOnlyTask(signedRecord('Operator code request: Change repository secrets. ' + safetySentence, true), auth).ok, false);
});

function managedFixture(t, directory) {
  const record = signedRecord('Operator code request: Fix the navbar. ' + safetySentence, true);
  record.status = 'queued';
  record.createdAt = new Date(1000000).toISOString();
  const patches = [];
  const rootNode = { get: () => ({ put: (patch, ack) => { patches.push(patch); ack({ ok: true }); } }) };
  const options = {
    now: 1001000, env: {}, rootNode, stateDir: directory,
    verifyImpl: async () => verifiedOwnerTask(record.task),
    runAgentTaskImpl: async () => ({ ok: true, result: { stdout: 'Changed the navbar and ran focused tests.' } })
  };
  return { record, options, patches };
}

test('a saved completion repairs relay state after restart without executing twice', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-receipt-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { record, options, patches } = managedFixture(t, directory);
  let executions = 0;
  options.runAgentTaskImpl = async () => { executions++; return { ok: true, result: { stdout: 'Verified navbar fix.' } }; };
  assert.equal((await runForgeRequest(record, options)).ok, true);
  assert.equal((await runForgeRequest({ ...record, status: 'queued' }, options)).recovered, true);
  assert.equal(executions, 1);
  assert.equal(patches.at(-1).status, 'completed');
});

test('a pending execution receipt never replays uncertain work or admits changed signed intent', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-pending-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { record, options, patches } = managedFixture(t, directory);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let executions = 0;
  options.runAgentTaskImpl = async () => { executions++; await gate; return { ok: true, result: { stdout: 'Verified fix.' } }; };
  const running = runForgeRequest(record, options);
  while (!executions) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await runForgeRequest(record, options)).skipped, true);
  assert.equal(patches.at(-1).status, 'approval_required');
  assert.equal(executions, 1);
  release(); await running;
  const files = await readdir(directory);
  const file = path.join(directory, files.find(name => name.endsWith('.json')));
  const previous = JSON.parse(await readFile(file, 'utf8'));
  previous.fingerprint = 'different signed task';
  await require('node:fs/promises').writeFile(file, JSON.stringify(previous));
  await assert.rejects(runForgeRequest(record, options), /identity conflicts/);
  assert.equal(executions, 1);
});

test('signed admission uses verified issue time, not a relay-controlled createdAt', async t => {
  const { record, options, patches } = managedFixture(t);
  record.createdAt = new Date(2000000).toISOString();
  options.signedAfter = 1500000;
  options.runAgentTaskImpl = () => assert.fail('old signed request must remain held');
  assert.equal((await runForgeRequest(record, options)).skipped, true);
  assert.equal(patches.length, 0);
  await assert.rejects(runForgeRequest(record, { ...options, signedAfter: 'invalid' }), /Invalid Forge admission/);
});

test('saved successful receipt survives a relay write failure and repairs on retry', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-relay-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { record, options } = managedFixture(t, directory);
  let executions = 0;
  options.runAgentTaskImpl = async () => { executions++; return { ok: true, result: { stdout: 'Verified fix.' } }; };
  let rejectCompletion = true;
  options.rootNode = { get: () => ({ put: (patch, ack) => ack(
    patch.status === 'completed' && rejectCompletion ? { err: 'relay unavailable' } : { ok: true }
  ) }) };
  assert.equal((await runForgeRequest(record, options)).deliveryPending, true);
  rejectCompletion = false;
  assert.equal((await runForgeRequest(record, options)).recovered, true);
  assert.equal(executions, 1);
});

test('exact-ID worker scope leaves other queued code requests untouched', async t => {
  const { record, options, patches } = managedFixture(t);
  const other = { ...record, id: 'operator-task-other' };
  options.rootNode.map = () => ({ once: callback => {
    callback(other, other.id); callback(record, record.id);
  } });
  const result = await runForgeWorkerOnce({ ...options, onlyTaskId: record.id });
  assert.deepEqual(result.map(item => item.id), [record.id]);
  assert.ok(patches.every(patch => patch.id === record.id));
});

test('managed edits execute in a separate branch and worktree', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-worktree-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const base = path.join(directory, 'base');
  execFileSync('git', ['init', '-q', base]);
  execFileSync('git', ['-C', base, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'base']);
  execFileSync('git', ['-C', base, 'branch', '-M', 'main']);
  execFileSync('git', ['-C', base, 'remote', 'add', 'origin', base]);
  const { record, options } = managedFixture(t, path.join(directory, 'receipts'));
  options.env = { THREEDVR_OPERATOR_PORTAL_REPO: base };
  options.worktreeRoot = path.join(directory, 'worktrees');
  record.backend = 'claude-api'; // Relay metadata cannot redirect managed code to another provider.
  options.runAgentTaskImpl = async args => {
    assert.equal(args[args.indexOf('--backend') + 1], 'codex');
    const repo = args[args.indexOf('--repo') + 1];
    assert.notEqual(repo, base);
    assert.equal(path.dirname(repo), options.worktreeRoot);
    assert.match(execFileSync('git', ['-C', repo, 'branch', '--show-current'], { encoding: 'utf8' }), /^forge\//);
    return { ok: true, result: { stdout: 'Verified isolated workspace.' } };
  };
  assert.equal((await runForgeRequest(record, options)).ok, true);
  assert.equal(execFileSync('git', ['-C', base, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'main');
});

test('agent source merges cannot automatically activate the legacy DigitalOcean queue and outreach daemons', async () => {
  const workflow = await readFile(path.resolve(__dirname, '../../../.github/workflows/agent.yml'), 'utf8');
  const gate = workflow.split('deploy-digitalocean-worker:')[1].split('needs:')[0];
  assert.match(gate, /github.event_name == 'workflow_dispatch'/);
  assert.match(gate, /inputs.deploy_legacy_worker == true/);
  assert.match(workflow, /deploy_legacy_worker:[\s\S]*?default: false/);
});

test('the actual queued harmless edit remains local despite the old automatic GitHub flag', async t => {
  const { record, options } = managedFixture(t);
  record.task = 'Operator code request: In the Portal repo, make one small, reversible, non-functional edit to an existing test or developer documentation file. Avoid production behavior, secrets, and configuration. Report the exact file changed and diff. Do not deploy, commit, or push. Make the smallest useful change in the working repository and run focused tests. Use an isolated branch or worktree when practical. Return a result summary with what changed, the exact checks run and their outcomes, any remaining blocker, and available commit or pull request links. Distinguish local changes, published commits, merged code, and live deployment. ' + safetySentence + ' The signed request includes GitHub write intent. Preserve exactly the requested repository workflow.';
  options.verifyImpl = async () => verifiedOwnerTask(record.task);
  const intent = editOnlyTask(record, { role: 'owner', githubWriteApproved: true });
  assert.equal(intent.ok, true);
  assert.equal(intent.githubWrite, false);
  options.runAgentTaskImpl = async args => {
    assert.ok(args.includes('--workspace-write'));
    assert.ok(args.at(-1).includes('Do not deploy, commit, or push.'));
    assert.ok(!args.at(-1).includes('You may create a branch, commit, push'));
    return { ok: true, result: { stdout: 'Verified a local documentation-only edit.' } };
  };
  assert.equal((await runForgeRequest(record, options)).ok, true);
});
