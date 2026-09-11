'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  AuditChain,
  SecretsBroker,
  atomicWriteJson,
  matchScope,
  provisionAgent,
} = require('../thomas-agent/node/secrets-broker');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-secrets-broker-'));
  const files = {
    policy: path.join(root, 'policy.json'),
    agents: path.join(root, 'agents.json'),
    approvals: path.join(root, 'approvals.json'),
    audit: path.join(root, 'audit.jsonl'),
    auditKey: path.join(root, 'audit.key'),
    workerToken: path.join(root, 'tokens', 'worker.token'),
    adminToken: path.join(root, 'tokens', 'admin.token'),
  };
  atomicWriteJson(files.policy, {
    version: 7,
    defaults: { approval: 'always', leaseSeconds: 120, maxUses: 1 },
    backends: { mock: { type: 'mock' } },
    secrets: {
      'github.portal': {
        backend: 'mock', locator: 'never-logged', capability: 'github.api',
        scopes: ['repo:tmsteph/3dvr-portal'], approval: { mode: 'lease', leaseSeconds: 300, maxUses: 2 },
      },
      'calendar.readonly': {
        backend: 'mock', locator: 'calendar', capability: 'calendar.read',
        scopes: ['calendar:primary'], approval: { mode: 'auto' },
      },
      'bitwarden.writer': {
        backend: 'mock',
        write: {
          projectId: 'project-3dvr-agent', capability: 'secret.write',
          scopes: ['secrets:3dvr-agent'], approval: { mode: 'lease', leaseSeconds: 60, maxUses: 1 },
        },
      },
    },
  });
  provisionAgent({ agentsFile: files.agents, agentId: 'worker', tokenFile: files.workerToken, capabilities: ['github.api', 'calendar.read', 'secret.write'], scopes: ['repo:tmsteph/*', 'calendar:primary', 'secrets:3dvr-agent'] });
  provisionAgent({ agentsFile: files.agents, agentId: 'portal-owner-ui', tokenFile: files.adminToken, capabilities: ['broker.admin'], scopes: ['broker:*'] });
  let clock = Date.parse('2026-09-08T13:00:00Z');
  const writes = [];
  const broker = new SecretsBroker({
    policyFile: files.policy,
    agentsFile: files.agents,
    approvalsFile: files.approvals,
    auditFile: files.audit,
    auditKeyFile: files.auditKey,
    now: () => clock,
    backends: { mock: {
      get: locator => locator === 'calendar' ? 'calendar-token' : 'github-token',
      create: input => {
        writes.push({ ...input });
        return { id: `created-${writes.length}`, key: input.key, projectId: input.projectId };
      },
    } },
  });
  return {
    root, files, broker, writes,
    worker: broker.authenticate(fs.readFileSync(files.workerToken, 'utf8').trim()),
    admin: broker.authenticate(fs.readFileSync(files.adminToken, 'utf8').trim()),
    tick(ms) { clock += ms; },
  };
}

test('scope matcher only supports exact and trailing wildcard grants', () => {
  assert.equal(matchScope('repo:tmsteph/*', 'repo:tmsteph/3dvr-portal'), true);
  assert.equal(matchScope('repo:tmsteph/3dvr-portal', 'repo:tmsteph/3dvr-agent'), false);
  assert.equal(matchScope('repo:*:admin', 'repo:x:admin'), false);
});

test('broker requires approval, honors bounded lease, and never audits secret values', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));

  const request = {
    secret: 'github.portal', capability: 'github.api', scope: 'repo:tmsteph/3dvr-portal',
    purpose: 'Read repository metadata for issue triage', requestId: 'req-1',
  };
  const pending = f.broker.request(f.worker, request);
  assert.equal(pending.status, 202);
  assert.equal(pending.body.decision, 'approval_required');
  assert.match(pending.body.approvalId, /^apr-/);

  const listed = f.broker.listApprovals(f.admin, { status: 'pending' });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.approvals.length, 1);
  assert.equal(listed.body.approvals[0].secretAlias, 'github.portal');
  assert.equal('fingerprint' in listed.body.approvals[0], true);
  assert.equal(listed.body.approvals[0].fingerprint, undefined);

  const approved = f.broker.decideApproval(f.admin, pending.body.approvalId, 'approve', { actor: 'tmsteph@3dvr', leaseSeconds: 9999, maxUses: 9999 });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.approval.remainingUses, 2);
  assert.equal(Date.parse(approved.body.approval.expiresAt) - Date.parse(approved.body.approval.decidedAt), 300000);

  const first = f.broker.request(f.worker, { ...request, requestId: 'req-2' });
  assert.equal(first.status, 200);
  assert.equal(first.body.secret, 'github-token');
  const second = f.broker.request(f.worker, { ...request, requestId: 'req-3' });
  assert.equal(second.status, 200);
  assert.equal(second.body.secret, 'github-token');
  const third = f.broker.request(f.worker, { ...request, requestId: 'req-4' });
  assert.equal(third.status, 202);
  assert.notEqual(third.body.approvalId, pending.body.approvalId);

  const auditText = fs.readFileSync(f.files.audit, 'utf8');
  assert(!auditText.includes('github-token'));
  assert(!auditText.includes('never-logged'));
  assert.equal(f.broker.audit.verify().ok, true);
});

test('broker fails closed on agent scope and capability mismatch', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const wrongScope = f.broker.request(f.worker, {
    secret: 'github.portal', capability: 'github.api', scope: 'repo:someone/private', purpose: 'test',
  });
  assert.equal(wrongScope.status, 403);
  assert.equal(wrongScope.body.reason, 'agent-scope-not-granted');
  const wrongCapability = f.broker.request(f.worker, {
    secret: 'github.portal', capability: 'gmail.send', scope: 'repo:tmsteph/3dvr-portal', purpose: 'test',
  });
  assert.equal(wrongCapability.status, 403);
  assert.equal(wrongCapability.body.reason, 'capability-policy-mismatch');
});

test('explicit auto policy can release a narrowly scoped secret without creating approval state', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const result = f.broker.request(f.worker, {
    secret: 'calendar.readonly', capability: 'calendar.read', scope: 'calendar:primary', purpose: 'Check availability',
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.secret, 'calendar-token');
  assert.equal(Object.keys(f.broker.approvals().approvals).length, 0);
});


test('broker can add a value through a separately scoped write capability without auditing the value', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const request = {
    secret: 'bitwarden.writer', capability: 'secret.write', scope: 'secrets:3dvr-agent',
    purpose: 'Save a test integration value', key: 'SMOKE_KEY',
    value: 'fixture-value-12345', note: 'test fixture', requestId: 'write-1',
  };

  const pending = f.broker.store(f.worker, request);
  assert.equal(pending.status, 202);
  assert.equal(pending.body.decision, 'approval_required');
  const approved = f.broker.decideApproval(f.admin, pending.body.approvalId, 'approve', { actor: 'tmsteph@3dvr' });
  assert.equal(approved.status, 200);

  const stored = f.broker.store(f.worker, { ...request, requestId: 'write-2' });
  assert.equal(stored.status, 201);
  assert.equal(stored.body.stored.id, 'created-1');
  assert.equal(stored.body.stored.key, 'SMOKE_KEY');
  assert.equal(stored.body.stored.projectId, 'project-3dvr-agent');
  assert.equal('value' in stored.body.stored, false);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].value, request.value);

  const next = f.broker.store(f.worker, { ...request, requestId: 'write-3' });
  assert.equal(next.status, 202);
  assert.notEqual(next.body.approvalId, pending.body.approvalId);

  const auditText = fs.readFileSync(f.files.audit, 'utf8');
  assert(!auditText.includes(request.value));
  assert.match(auditText, /secret_stored/);
  assert.equal(f.broker.audit.verify().ok, true);
});

test('audit chain detects tampering', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  f.broker.audit.append({ event: 'first', agent: 'worker' });
  f.broker.audit.append({ event: 'second', agent: 'worker' });
  assert.equal(f.broker.audit.verify().ok, true);
  const lines = fs.readFileSync(f.files.audit, 'utf8').trim().split('\n');
  const first = JSON.parse(lines[0]);
  first.agent = 'tampered';
  lines[0] = JSON.stringify(first);
  fs.writeFileSync(f.files.audit, `${lines.join('\n')}\n`);
  const verifier = new AuditChain({ file: f.files.audit, keyFile: f.files.auditKey });
  assert.equal(verifier.verify().ok, false);
});

test('status is sanitized and reserved for status/admin agents', t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const denied = f.broker.status(f.worker);
  assert.equal(denied.status, 403);
  const status = f.broker.status(f.admin);
  assert.equal(status.status, 200);
  assert.equal(status.body.controlNode, 'ovh');
  assert.equal(status.body.policyVersion, 7);
  assert.equal(status.body.configuredSecrets, 3);
  const serialized = JSON.stringify(status.body);
  assert(!serialized.includes('tokenHash'));
  assert(!serialized.includes('never-logged'));
});
