'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULTS = Object.freeze({
  socketPath: '/run/3dvr-secrets-broker/broker.sock',
  stateDir: '/var/lib/3dvr-secrets-broker',
  policyFile: '/etc/3dvr/secrets-broker/policy.json',
  agentsFile: '/etc/3dvr/secrets-broker/agents.json',
  auditFile: '/var/lib/3dvr-secrets-broker/audit.jsonl',
  auditKeyFile: '/var/lib/3dvr-secrets-broker/audit.key',
  approvalsFile: '/var/lib/3dvr-secrets-broker/approvals.json',
});

function nowIso(now = Date.now()) {
  return new Date(typeof now === 'function' ? now() : now).toISOString();
}

function normalizeText(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeList(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map(item => normalizeText(item, 300)).filter(Boolean))];
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function tokenHash(token) {
  return sha256(`3dvr-secret-broker\0${String(token || '')}`);
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(String(left || '')) || !/^[a-f0-9]{64}$/i.test(String(right || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function ensureDir(dir, mode = 0o700) {
  fs.mkdirSync(dir, { recursive: true, mode });
  try { fs.chmodSync(dir, mode); } catch {}
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return typeof fallback === 'function' ? fallback() : fallback;
    throw error;
  }
}

function atomicWriteJson(file, value, mode = 0o600) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, mode);
}

function matchScope(pattern, scope) {
  const allowed = normalizeText(pattern, 300);
  const requested = normalizeText(scope, 300);
  if (!allowed || !requested) return false;
  if (allowed === '*') return true;
  if (allowed.endsWith('*')) return requested.startsWith(allowed.slice(0, -1));
  return allowed === requested;
}

function scopeAllowed(patterns, scope) {
  return normalizeList(patterns).some(pattern => matchScope(pattern, scope));
}

function configuredBackend(policy, name) {
  const backend = policy?.backends?.[name];
  return backend && typeof backend === 'object' ? backend : null;
}

class AuditChain {
  constructor({ file = DEFAULTS.auditFile, keyFile = DEFAULTS.auditKeyFile } = {}) {
    this.file = file;
    this.keyFile = keyFile;
    ensureDir(path.dirname(file));
    ensureDir(path.dirname(keyFile));
    this.key = this.#loadKey();
    this.lastHmac = this.#readLastHmac();
  }

  #loadKey() {
    try {
      const key = fs.readFileSync(this.keyFile);
      if (key.length !== 32) throw new Error('audit key must be 32 bytes');
      return key;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const key = crypto.randomBytes(32);
      fs.writeFileSync(this.keyFile, key, { mode: 0o600, flag: 'wx' });
      return key;
    }
  }

  #readLastHmac() {
    try {
      const lines = fs.readFileSync(this.file, 'utf8').trim().split('\n').filter(Boolean);
      if (!lines.length) return 'GENESIS';
      const last = JSON.parse(lines[lines.length - 1]);
      return normalizeText(last.hmac, 128) || 'GENESIS';
    } catch (error) {
      if (error.code === 'ENOENT') return 'GENESIS';
      throw error;
    }
  }

  #sign(record) {
    return crypto.createHmac('sha256', this.key).update(JSON.stringify(record)).digest('hex');
  }

  append(event = {}) {
    const record = {
      version: 1,
      at: nowIso(),
      ...event,
      prevHmac: this.lastHmac,
    };
    delete record.secret;
    delete record.value;
    delete record.token;
    delete record.tokenHash;
    const hmac = this.#sign(record);
    const stored = { ...record, hmac };
    fs.appendFileSync(this.file, `${JSON.stringify(stored)}\n`, { mode: 0o600 });
    fs.chmodSync(this.file, 0o600);
    this.lastHmac = hmac;
    return stored;
  }

  verify() {
    let previous = 'GENESIS';
    let count = 0;
    try {
      const lines = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        const stored = JSON.parse(line);
        const { hmac, ...record } = stored;
        if (record.prevHmac !== previous) return { ok: false, count, reason: 'chain-link-mismatch' };
        if (!safeEqualHex(hmac, this.#sign(record))) return { ok: false, count, reason: 'hmac-mismatch' };
        previous = hmac;
        count += 1;
      }
      return { ok: true, count, lastHmac: previous };
    } catch (error) {
      if (error.code === 'ENOENT') return { ok: true, count: 0, lastHmac: 'GENESIS' };
      return { ok: false, count, reason: 'audit-read-failed' };
    }
  }
}

class BitwardenSecretsManagerBackend {
  constructor(config = {}, options = {}) {
    this.binary = normalizeText(config.binary || options.binary || process.env.BWS_BIN || '/usr/local/bin/bws', 500);
    this.timeoutMs = Math.max(1000, Number(config.timeoutMs || options.timeoutMs || 15000));
    this.env = options.env || process.env;
  }

  ready() {
    return Boolean(normalizeText(this.env.BWS_ACCESS_TOKEN, 2000)) && fs.existsSync(this.binary);
  }

  get(locator) {
    const secretId = normalizeText(locator, 200);
    if (!secretId) throw new Error('Bitwarden secret locator is required');
    if (!this.ready()) throw new Error('Bitwarden Secrets Manager backend is not configured');
    const result = spawnSync(this.binary, ['secret', 'get', secretId, '--output', 'json', '--color', 'no'], {
      env: this.env,
      encoding: 'utf8',
      timeout: this.timeoutMs,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) throw new Error(`Bitwarden lookup failed: ${result.error.message}`);
    if (result.status !== 0) throw new Error('Bitwarden lookup failed');
    let parsed;
    try { parsed = JSON.parse(result.stdout); }
    catch { throw new Error('Bitwarden returned invalid JSON'); }
    if (typeof parsed?.value !== 'string') throw new Error('Bitwarden secret value is missing');
    return parsed.value;
  }

  create({ projectId, key, value, note = '' } = {}) {
    const targetProject = normalizeText(projectId, 200);
    const secretKey = normalizeText(key, 500);
    const secretValue = typeof value === 'string' ? value : '';
    const secretNote = normalizeText(note, 1000);
    if (!targetProject || !secretKey || !secretValue) throw new Error('Bitwarden project, key, and value are required');
    if (!this.ready()) throw new Error('Bitwarden Secrets Manager backend is not configured');
    const args = ['secret', 'create', secretKey, secretValue, targetProject];
    if (secretNote) args.push('--note', secretNote);
    args.push('--output', 'json', '--color', 'no');
    const result = spawnSync(this.binary, args, {
      env: this.env,
      encoding: 'utf8',
      timeout: this.timeoutMs,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) throw new Error(`Bitwarden create failed: ${result.error.message}`);
    if (result.status !== 0) throw new Error('Bitwarden create failed');
    let parsed;
    try { parsed = JSON.parse(result.stdout); }
    catch { throw new Error('Bitwarden returned invalid JSON'); }
    const id = normalizeText(parsed?.id, 200);
    if (!id) throw new Error('Bitwarden created secret id is missing');
    return { id, key: normalizeText(parsed?.key || secretKey, 500), projectId: normalizeText(parsed?.projectId || targetProject, 200) };
  }
}

class SecretsBroker {
  constructor(options = {}) {
    this.policyFile = options.policyFile || process.env.THREEDVR_SECRETS_BROKER_POLICY || DEFAULTS.policyFile;
    this.agentsFile = options.agentsFile || process.env.THREEDVR_SECRETS_BROKER_AGENTS || DEFAULTS.agentsFile;
    this.approvalsFile = options.approvalsFile || process.env.THREEDVR_SECRETS_BROKER_APPROVALS || DEFAULTS.approvalsFile;
    this.controlNode = normalizeText(options.controlNode || process.env.THREEDVR_CONTROL_NODE || 'ovh', 80) || 'ovh';
    this.audit = options.audit || new AuditChain({
      file: options.auditFile || process.env.THREEDVR_SECRETS_BROKER_AUDIT || DEFAULTS.auditFile,
      keyFile: options.auditKeyFile || process.env.THREEDVR_SECRETS_BROKER_AUDIT_KEY || DEFAULTS.auditKeyFile,
    });
    this.backends = options.backends || {};
    this.now = options.now || Date.now;
  }

  policy() {
    return readJson(this.policyFile, { version: 1, defaults: { approval: 'always', leaseSeconds: 300, maxUses: 1 }, backends: {}, secrets: {} });
  }

  agents() {
    return readJson(this.agentsFile, { version: 1, agents: {} });
  }

  approvals() {
    return readJson(this.approvalsFile, { version: 1, approvals: {} });
  }

  saveApprovals(state) {
    atomicWriteJson(this.approvalsFile, state);
  }

  authenticate(token) {
    const presented = tokenHash(token);
    const registry = this.agents();
    for (const [id, record] of Object.entries(registry.agents || {})) {
      if (record?.enabled === false) continue;
      if (safeEqualHex(presented, normalizeText(record?.tokenHash, 128))) {
        return {
          id,
          capabilities: normalizeList(record.capabilities),
          scopes: normalizeList(record.scopes),
          label: normalizeText(record.label || id, 160),
        };
      }
    }
    return null;
  }

  authorizeAdmin(agent) {
    return Boolean(agent && agent.capabilities.includes('broker.admin'));
  }

  #policyFor(alias) {
    const policy = this.policy();
    const secret = policy?.secrets?.[alias];
    if (!secret || typeof secret !== 'object' || secret.enabled === false) return { policy, secret: null };
    return { policy, secret };
  }

  #approvalConfig(policy, secret) {
    const raw = secret?.approval;
    const defaults = policy?.defaults || {};
    const mode = normalizeText(typeof raw === 'string' ? raw : raw?.mode || defaults.approval || 'always', 40).toLowerCase();
    const leaseSeconds = Math.min(86400, Math.max(30, Number(raw?.leaseSeconds || raw?.seconds || defaults.leaseSeconds || 300)));
    const maxUses = Math.min(1000, Math.max(1, Number(raw?.maxUses || defaults.maxUses || 1)));
    return { mode: ['always', 'lease', 'auto'].includes(mode) ? mode : 'always', leaseSeconds, maxUses };
  }

  #fingerprint(agentId, alias, capability, scope) {
    return sha256([agentId, alias, capability, scope].join('\0'));
  }

  #findLease(state, fingerprint) {
    const now = typeof this.now === 'function' ? Number(this.now()) : Number(this.now);
    return Object.values(state.approvals || {}).find(item => (
      item.fingerprint === fingerprint
      && item.status === 'approved'
      && Number(item.remainingUses || 0) > 0
      && Date.parse(item.expiresAt || '') > now
    )) || null;
  }

  #findPending(state, fingerprint) {
    return Object.values(state.approvals || {}).find(item => item.fingerprint === fingerprint && item.status === 'pending') || null;
  }

  request(agent, request = {}) {
    const alias = normalizeText(request.secret || request.alias, 200);
    const capability = normalizeText(request.capability, 200);
    const scope = normalizeText(request.scope, 300);
    const purpose = normalizeText(request.purpose, 500);
    const requestId = normalizeText(request.requestId, 200) || `req-${crypto.randomUUID()}`;
    const { policy, secret } = this.#policyFor(alias);

    const deny = reason => {
      this.audit.append({ event: 'secret_request_denied', requestId, agent: agent?.id || 'unknown', secretAlias: alias, capability, scope, reason });
      return { status: 403, body: { ok: false, decision: 'denied', reason, requestId } };
    };

    if (!agent) return deny('unauthenticated-agent');
    if (!alias || !capability || !scope || !purpose) return deny('secret-capability-scope-purpose-required');
    if (!secret) return deny('secret-policy-not-found');
    if (normalizeText(secret.capability, 200) !== capability) return deny('capability-policy-mismatch');
    if (!agent.capabilities.includes(capability)) return deny('agent-capability-not-granted');
    if (!scopeAllowed(agent.scopes, scope)) return deny('agent-scope-not-granted');
    if (!scopeAllowed(secret.scopes, scope)) return deny('secret-scope-not-granted');

    const approval = this.#approvalConfig(policy, secret);
    const fingerprint = this.#fingerprint(agent.id, alias, capability, scope);
    const state = this.approvals();
    let lease = approval.mode === 'auto' ? { id: 'policy-auto', status: 'approved', remainingUses: Number.MAX_SAFE_INTEGER } : this.#findLease(state, fingerprint);

    if (!lease) {
      let pending = this.#findPending(state, fingerprint);
      if (!pending) {
        const id = `apr-${crypto.randomUUID()}`;
        pending = {
          id,
          fingerprint,
          agent: agent.id,
          secretAlias: alias,
          capability,
          scope,
          purpose,
          status: 'pending',
          mode: approval.mode,
          leaseSeconds: approval.leaseSeconds,
          maxUses: approval.maxUses,
          requestedAt: nowIso(this.now),
        };
        state.approvals[id] = pending;
        this.saveApprovals(state);
        this.audit.append({ event: 'approval_requested', requestId, approvalId: id, agent: agent.id, secretAlias: alias, capability, scope, purpose, mode: approval.mode });
      }
      return { status: 202, body: { ok: false, decision: 'approval_required', requestId, approvalId: pending.id, scope, capability } };
    }

    const backendName = normalizeText(secret.backend, 100);
    const backendConfig = configuredBackend(policy, backendName);
    if (!backendConfig) return deny('backend-policy-not-found');
    let backend = this.backends[backendName];
    if (!backend) {
      if (backendConfig.type === 'bitwarden-secrets-manager') backend = new BitwardenSecretsManagerBackend(backendConfig);
      else return deny('unsupported-backend');
    }

    let value;
    try {
      value = backend.get(secret.locator || secret.secretId);
    } catch (error) {
      this.audit.append({ event: 'secret_backend_error', requestId, approvalId: lease.id, agent: agent.id, secretAlias: alias, capability, scope, backend: backendName, reason: normalizeText(error.message, 300) });
      return { status: 503, body: { ok: false, decision: 'backend_unavailable', reason: 'secret-backend-unavailable', requestId } };
    }

    if (lease.id !== 'policy-auto') {
      const current = state.approvals[lease.id];
      if (current) {
        current.remainingUses = Math.max(0, Number(current.remainingUses || 0) - 1);
        current.lastUsedAt = nowIso(this.now);
        if (current.remainingUses === 0) current.status = 'consumed';
        this.saveApprovals(state);
      }
    }

    this.audit.append({ event: 'secret_released', requestId, approvalId: lease.id, agent: agent.id, secretAlias: alias, capability, scope, backend: backendName, purpose });
    return { status: 200, body: { ok: true, decision: 'allowed', requestId, secret: value, approvalId: lease.id } };
  }

  store(agent, request = {}) {
    const alias = normalizeText(request.secret || request.alias, 200);
    const capability = normalizeText(request.capability, 200);
    const scope = normalizeText(request.scope, 300);
    const purpose = normalizeText(request.purpose, 500);
    const key = normalizeText(request.key, 500);
    const value = typeof request.value === 'string' ? request.value : '';
    const note = normalizeText(request.note, 1000);
    const requestId = normalizeText(request.requestId, 200) || `req-${crypto.randomUUID()}`;
    const { policy, secret } = this.#policyFor(alias);
    const write = secret?.write && typeof secret.write === 'object' ? secret.write : null;

    const deny = reason => {
      this.audit.append({ event: 'secret_write_denied', requestId, agent: agent?.id || 'unknown', secretAlias: alias, capability, scope, reason });
      return { status: 403, body: { ok: false, decision: 'denied', reason, requestId } };
    };

    if (!agent) return deny('unauthenticated-agent');
    if (!alias || !capability || !scope || !purpose || !key || !value) return deny('secret-capability-scope-purpose-key-value-required');
    if (!secret) return deny('secret-policy-not-found');
    if (!write) return deny('secret-write-policy-not-found');
    if (normalizeText(write.capability, 200) !== capability) return deny('capability-policy-mismatch');
    if (!agent.capabilities.includes(capability)) return deny('agent-capability-not-granted');
    if (!scopeAllowed(agent.scopes, scope)) return deny('agent-scope-not-granted');
    if (!scopeAllowed(write.scopes, scope)) return deny('secret-scope-not-granted');

    const projectId = normalizeText(write.projectId || secret.projectId, 200);
    if (!projectId) return deny('secret-write-project-not-configured');
    const approval = this.#approvalConfig(policy, { approval: write.approval || secret.approval });
    const fingerprint = this.#fingerprint(agent.id, alias, capability, scope);
    const state = this.approvals();
    let lease = approval.mode === 'auto' ? { id: 'policy-auto', status: 'approved', remainingUses: Number.MAX_SAFE_INTEGER } : this.#findLease(state, fingerprint);

    if (!lease) {
      let pending = this.#findPending(state, fingerprint);
      if (!pending) {
        const id = `apr-${crypto.randomUUID()}`;
        pending = {
          id, fingerprint, agent: agent.id, secretAlias: alias, capability, scope, purpose,
          operation: 'write', status: 'pending', mode: approval.mode, leaseSeconds: approval.leaseSeconds,
          maxUses: approval.maxUses, requestedAt: nowIso(this.now),
        };
        state.approvals[id] = pending;
        this.saveApprovals(state);
        this.audit.append({ event: 'approval_requested', operation: 'write', requestId, approvalId: id, agent: agent.id, secretAlias: alias, capability, scope, purpose, mode: approval.mode });
      }
      return { status: 202, body: { ok: false, decision: 'approval_required', requestId, approvalId: pending.id, scope, capability } };
    }

    const backendName = normalizeText(secret.backend, 100);
    const backendConfig = configuredBackend(policy, backendName);
    if (!backendConfig) return deny('backend-policy-not-found');
    let backend = this.backends[backendName];
    if (!backend) {
      if (backendConfig.type === 'bitwarden-secrets-manager') backend = new BitwardenSecretsManagerBackend(backendConfig);
      else return deny('unsupported-backend');
    }
    if (typeof backend.create !== 'function') return deny('backend-write-unsupported');

    let created;
    try {
      created = backend.create({ projectId, key, value, note });
    } catch (error) {
      this.audit.append({ event: 'secret_backend_error', operation: 'write', requestId, approvalId: lease.id, agent: agent.id, secretAlias: alias, capability, scope, backend: backendName, reason: normalizeText(error.message, 300) });
      return { status: 503, body: { ok: false, decision: 'backend_unavailable', reason: 'secret-backend-unavailable', requestId } };
    }

    if (lease.id !== 'policy-auto') {
      const current = state.approvals[lease.id];
      if (current) {
        current.remainingUses = Math.max(0, Number(current.remainingUses || 0) - 1);
        current.lastUsedAt = nowIso(this.now);
        if (current.remainingUses === 0) current.status = 'consumed';
        this.saveApprovals(state);
      }
    }

    this.audit.append({ event: 'secret_stored', requestId, approvalId: lease.id, agent: agent.id, secretAlias: alias, capability, scope, backend: backendName, purpose, createdId: normalizeText(created?.id, 200) });
    return { status: 201, body: { ok: true, decision: 'allowed', requestId, stored: { id: normalizeText(created?.id, 200), key: normalizeText(created?.key || key, 500), projectId: normalizeText(created?.projectId || projectId, 200) }, approvalId: lease.id } };
  }

  listApprovals(agent, { status } = {}) {
    if (!this.authorizeAdmin(agent)) return { status: 403, body: { ok: false, reason: 'admin-capability-required' } };
    const normalizedStatus = normalizeText(status, 40);
    const records = Object.values(this.approvals().approvals || {})
      .filter(item => !normalizedStatus || item.status === normalizedStatus)
      .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')))
      .map(item => ({ ...item, fingerprint: undefined }));
    return { status: 200, body: { ok: true, approvals: records } };
  }

  decideApproval(agent, id, decision, options = {}) {
    if (!this.authorizeAdmin(agent)) return { status: 403, body: { ok: false, reason: 'admin-capability-required' } };
    const approvalId = normalizeText(id, 200);
    const state = this.approvals();
    const item = state.approvals?.[approvalId];
    if (!item) return { status: 404, body: { ok: false, reason: 'approval-not-found' } };
    if (item.status !== 'pending') return { status: 409, body: { ok: false, reason: 'approval-not-pending', approval: { ...item, fingerprint: undefined } } };
    const actor = normalizeText(options.actor || agent.id, 200);
    const normalizedDecision = decision === 'approve' ? 'approve' : 'deny';
    if (normalizedDecision === 'deny') {
      item.status = 'denied';
      item.decidedAt = nowIso(this.now);
      item.decidedBy = actor;
      this.saveApprovals(state);
      this.audit.append({ event: 'approval_denied', approvalId, agent: item.agent, secretAlias: item.secretAlias, capability: item.capability, scope: item.scope, actor });
      return { status: 200, body: { ok: true, approval: { ...item, fingerprint: undefined } } };
    }

    const requestedTtl = Number(options.leaseSeconds || item.leaseSeconds || 300);
    const requestedUses = Number(options.maxUses || item.maxUses || 1);
    const ttl = Math.max(30, Math.min(Number(item.leaseSeconds || 300), Number.isFinite(requestedTtl) ? requestedTtl : Number(item.leaseSeconds || 300)));
    const uses = Math.max(1, Math.min(Number(item.maxUses || 1), Number.isFinite(requestedUses) ? requestedUses : Number(item.maxUses || 1)));
    const now = typeof this.now === 'function' ? Number(this.now()) : Number(this.now);
    item.status = 'approved';
    item.decidedAt = nowIso(now);
    item.decidedBy = actor;
    item.expiresAt = new Date(now + ttl * 1000).toISOString();
    item.remainingUses = uses;
    this.saveApprovals(state);
    this.audit.append({ event: 'approval_granted', approvalId, agent: item.agent, secretAlias: item.secretAlias, capability: item.capability, scope: item.scope, actor, expiresAt: item.expiresAt, maxUses: uses });
    return { status: 200, body: { ok: true, approval: { ...item, fingerprint: undefined } } };
  }

  status(agent) {
    if (!agent || (!agent.capabilities.includes('broker.status') && !this.authorizeAdmin(agent))) {
      return { status: 403, body: { ok: false, reason: 'status-capability-required' } };
    }
    const policy = this.policy();
    const registry = this.agents();
    const approvals = Object.values(this.approvals().approvals || {});
    const backends = Object.entries(policy.backends || {}).map(([name, config]) => {
      let ready = false;
      if (config?.type === 'bitwarden-secrets-manager') ready = new BitwardenSecretsManagerBackend(config).ready();
      else ready = Boolean(this.backends[name]?.ready?.());
      return { name, type: config?.type || 'unknown', ready };
    });
    const agents = Object.entries(registry.agents || {}).map(([id, record]) => ({
      id,
      label: record.label || id,
      enabled: record.enabled !== false,
      capabilities: normalizeList(record.capabilities),
      scopes: normalizeList(record.scopes),
    }));
    const audit = this.audit.verify();
    return {
      status: 200,
      body: {
        ok: true,
        service: '3dvr-secrets-broker',
        controlNode: this.controlNode,
        policyVersion: Number(policy.version || 1),
        configuredSecrets: Object.keys(policy.secrets || {}).length,
        pendingApprovals: approvals.filter(item => item.status === 'pending').length,
        backends,
        agents,
        audit: { ok: audit.ok, entries: audit.count, reason: audit.reason || null },
      },
    };
  }
}

function provisionAgent({ agentsFile = DEFAULTS.agentsFile, agentId, tokenFile, capabilities = [], scopes = [], label = '', rotate = false }) {
  const id = normalizeText(agentId, 120);
  if (!/^[a-z0-9][a-z0-9._-]{1,119}$/i.test(id)) throw new Error('valid agent id is required');
  if (!tokenFile) throw new Error('token file is required');
  const registry = readJson(agentsFile, { version: 1, agents: {} });
  if (registry.agents[id] && !rotate) throw new Error(`agent ${id} already exists; use rotate`);
  const token = crypto.randomBytes(32).toString('base64url');
  ensureDir(path.dirname(tokenFile));
  fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  fs.chmodSync(tokenFile, 0o600);
  registry.agents[id] = {
    label: normalizeText(label || id, 160),
    tokenHash: tokenHash(token),
    capabilities: normalizeList(capabilities),
    scopes: normalizeList(scopes),
    enabled: true,
    provisionedAt: nowIso(),
  };
  atomicWriteJson(agentsFile, registry);
  return { id, tokenFile, capabilities: registry.agents[id].capabilities, scopes: registry.agents[id].scopes };
}

module.exports = {
  AuditChain,
  BitwardenSecretsManagerBackend,
  DEFAULTS,
  SecretsBroker,
  atomicWriteJson,
  matchScope,
  normalizeList,
  provisionAgent,
  scopeAllowed,
  tokenHash,
};
