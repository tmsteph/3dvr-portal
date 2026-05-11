import crypto from 'node:crypto';

const DEFAULT_GUN_PEERS = Object.freeze([
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
]);
const DEFAULT_PORTAL_ROOT = '3dvr-portal';
const DEFAULT_QUEUE_OWNER = process.env.THREEDVR_AGENT_SHARED_OWNER_ALIAS || '3dvr-managed';
const DEFAULT_BACKEND = 'codex';
const DEFAULT_TENANT_PLAN = 'free';
const VALID_RISK_CLASSES = new Set(['read_only', 'draft', 'workspace_write', 'external_write', 'money', 'credential']);
const APPROVAL_REQUIRED_RISKS = new Set(['external_write', 'money', 'credential']);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCsv(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values
    .map(item => normalizeText(item).toLowerCase())
    .filter(Boolean))]
    .join(',');
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function hashId(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}

function scopedTaskId(task, now = Date.now(), entropy = crypto.randomBytes(6).toString('hex')) {
  const seed = `${normalizeText(task)}\n${now}\n${entropy}`;
  return `remote-task-${hashId(seed)}`;
}

function normalizeRiskClass(value) {
  const risk = normalizeText(value).toLowerCase() || 'draft';
  return VALID_RISK_CLASSES.has(risk) ? risk : 'draft';
}

function resolveTenant(body = {}) {
  const identity = body.identity && typeof body.identity === 'object' ? body.identity : {};
  const provider = normalizeText(body.authProvider || identity.authProvider || identity.provider);
  const subject = normalizeText(body.authSubject || identity.authSubject || identity.sub || identity.pub);
  const verifiedEmail = normalizeText(body.verifiedEmail || identity.verifiedEmail || identity.email);
  const alias = normalizeText(body.tenantAlias || body.portalAlias || identity.alias || verifiedEmail);
  const guestId = normalizeText(body.guestId || identity.guestId);
  const tenantId = normalizeText(body.tenantId)
    || (provider && subject ? `${provider}:${subject}` : '')
    || (verifiedEmail ? `email:${verifiedEmail.toLowerCase()}` : '')
    || (guestId ? `guest:${guestId}` : '')
    || 'guest:anonymous';

  return {
    tenantId,
    tenantAlias: alias || tenantId,
    tenantPlan: normalizeText(body.tenantPlan || identity.tenantPlan) || DEFAULT_TENANT_PLAN
  };
}

export function normalizeAgentTaskPayload(body = {}, options = {}) {
  const task = normalizeText(body.task || body.prompt || body.message);
  if (!task) {
    throw new Error('Task is required.');
  }

  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const tenant = resolveTenant(body);
  const riskClass = normalizeRiskClass(body.riskClass || body.risk);
  const unsafe = Boolean(body.unsafe);
  const approvalStatus = normalizeText(body.approvalStatus)
    || (unsafe ? 'approved' : APPROVAL_REQUIRED_RISKS.has(riskClass) ? 'required' : 'not_required');
  const backend = normalizeText(body.backend) || DEFAULT_BACKEND;
  const requiredCapabilities = normalizeCsv(body.requiredCapabilities || body.requires || backend);
  const id = normalizeText(body.id) || scopedTaskId(task, now, options.entropy);

  return {
    id,
    task,
    tenantId: tenant.tenantId,
    tenantAlias: tenant.tenantAlias,
    tenantPlan: tenant.tenantPlan,
    backend,
    repo: normalizeText(body.repo),
    model: normalizeText(body.model),
    thinking: normalizeText(body.thinking),
    unsafe,
    riskClass,
    approvalStatus,
    requiredCapabilities,
    maxRuntimeMs: Number.isFinite(Number(body.maxRuntimeMs)) ? Math.max(0, Math.round(Number(body.maxRuntimeMs))) : 0,
    status: 'queued',
    requestedBy: normalizeText(body.requestedBy) || 'portal',
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
    resultSummary: '',
    error: '',
    workerDeviceId: ''
  };
}

function queueOwnerFromBody(body = {}, config = {}) {
  return normalizeText(body.queueOwnerAlias)
    || normalizeText(config.THREEDVR_AGENT_SHARED_OWNER_ALIAS)
    || DEFAULT_QUEUE_OWNER;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function putGun(node, payload, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Gun write timeout'));
    }, timeoutMs);

    node.put(payload, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack?.err) {
        reject(new Error(ack.err));
        return;
      }
      resolve(ack || {});
    });
  });
}

async function resolveGun(deps = {}, config = {}) {
  if (deps.gun) return deps.gun;
  const moduleResult = deps.Gun ? { default: deps.Gun } : await import('gun');
  const GunImpl = moduleResult.default || moduleResult.Gun || moduleResult;
  return GunImpl({
    peers: config.THREEDVR_GUN_PEERS
      ? String(config.THREEDVR_GUN_PEERS).split(',').map(peer => peer.trim()).filter(Boolean)
      : DEFAULT_GUN_PEERS,
    localStorage: false,
    radisk: false
  });
}

export async function enqueuePortalAgentTask(body = {}, deps = {}, config = process.env) {
  const record = normalizeAgentTaskPayload(body, deps);
  const ownerAlias = queueOwnerFromBody(body, config);
  const rootName = normalizeText(config.THREEDVR_GUN_PORTAL_ROOT) || DEFAULT_PORTAL_ROOT;
  const gun = await resolveGun(deps, config);
  const queueNode = gun.get(rootName).get('agentOps').get(ownerAlias).get('taskQueue');
  const summary = {
    id: record.id,
    status: record.status,
    task: record.task,
    tenantId: record.tenantId,
    tenantAlias: record.tenantAlias,
    tenantPlan: record.tenantPlan,
    riskClass: record.riskClass,
    approvalStatus: record.approvalStatus,
    requiredCapabilities: record.requiredCapabilities,
    updatedAt: record.updatedAt
  };

  await putGun(queueNode.get('tasks').get(record.id), record, deps.timeoutMs);
  await putGun(queueNode.get('latest').get(record.id), summary, deps.timeoutMs);

  return {
    ok: true,
    task: record,
    queueOwnerAlias: ownerAlias,
    gunPath: `${rootName}/agentOps/${ownerAlias}/taskQueue/tasks/${record.id}`
  };
}

export function createAgentTasksHandler(deps = {}, config = process.env) {
  return async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    try {
      const payload = await enqueuePortalAgentTask(req.body || {}, deps, config);
      return res.status(202).json(payload);
    } catch (error) {
      const message = error?.message || 'Unable to enqueue agent task.';
      const statusCode = /required/i.test(message) ? 400 : 500;
      return res.status(statusCode).json({ error: message });
    }
  };
}

export default createAgentTasksHandler();
