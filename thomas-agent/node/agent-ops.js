const crypto = require('crypto');
const os = require('os');

const DEFAULT_OWNER_ALIAS = process.env.THREEDVR_AGENT_OWNER_ALIAS || process.env.THREEDVR_PORTAL_ACCOUNT || 'anonymous@3dvr';
const DEFAULT_DEVICE_ID = process.env.THREEDVR_AGENT_DEVICE_ID || `${os.hostname()}-${process.platform}`;
const DEFAULT_LEASE_TTL_MS = parseInteger(process.env.THREEDVR_AGENT_OPS_LEASE_TTL_MS, 90_000);
const DEFAULT_WRITE_TIMEOUT_MS = parseInteger(process.env.THREEDVR_AGENT_OPS_WRITE_TIMEOUT_MS, 2500);
const DEFAULT_READ_TIMEOUT_MS = parseInteger(process.env.THREEDVR_AGENT_OPS_READ_TIMEOUT_MS, 2500);
const COORDINATION_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.THREEDVR_AGENT_OPS_ENABLED || 'true').trim());

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function hashId(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}

function slugify(input) {
  return normalizeText(input)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function scopedKey(kind, value) {
  const prefix = slugify(kind) || 'item';
  return `${prefix}-${hashId(value)}`;
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function addMs(now, ttlMs) {
  return new Date(now + Math.max(0, ttlMs)).toISOString();
}

function getPortalAgentOpsNode() {
  return require('./gun-db').portalAgentOpsNode();
}

function ownerNode(options = {}) {
  const root = options.rootNode || getPortalAgentOpsNode();
  return root.get(options.ownerAlias || DEFAULT_OWNER_ALIAS);
}

function deviceId(options = {}) {
  return normalizeText(options.deviceId) || DEFAULT_DEVICE_ID;
}

function putGun(node, payload, { timeoutMs = DEFAULT_WRITE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('agent ops write timeout'));
    }, timeoutMs);

    node.put(payload, (ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack && ack.err) {
        reject(new Error(ack.err));
        return;
      }
      resolve(ack || {});
    });
  });
}

function onceGun(node, { timeoutMs = DEFAULT_READ_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    node.once((data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(data || null);
    });
  });
}

async function writeHeartbeat(service = 'agent', options = {}) {
  if (!COORDINATION_ENABLED && !options.force) {
    return { ok: false, skipped: true, reason: 'agent ops disabled' };
  }

  const now = options.now || Date.now();
  const id = deviceId(options);
  const payload = {
    ownerAlias: options.ownerAlias || DEFAULT_OWNER_ALIAS,
    deviceId: id,
    service,
    hostName: os.hostname(),
    platform: process.platform,
    pid: process.pid,
    status: options.status || 'running',
    lastBeatAt: nowIso(now),
    metadata: options.metadata || {},
  };

  await putGun(ownerNode(options).get('devices').get(id), payload, options);
  return { ok: true, payload };
}

async function claimLease(resource, options = {}) {
  if (!COORDINATION_ENABLED && !options.force) {
    return { acquired: true, skipped: true, reason: 'agent ops disabled' };
  }

  const id = scopedKey('lease', resource);
  const now = options.now || Date.now();
  const ttlMs = options.ttlMs === undefined ? DEFAULT_LEASE_TTL_MS : options.ttlMs;
  const device = deviceId(options);
  const node = ownerNode(options).get('leases').get(id);
  const current = await onceGun(node, options);
  const currentOwner = normalizeText(current?.deviceId);
  const currentExpiresAt = Date.parse(current?.expiresAt || '');
  const stillHeld = currentOwner && currentOwner !== device && Number.isFinite(currentExpiresAt) && currentExpiresAt > now;

  if (stillHeld) {
    return {
      acquired: false,
      resource,
      key: id,
      ownerDeviceId: currentOwner,
      expiresAt: current.expiresAt,
    };
  }

  const token = options.token || `${device}-${now}-${crypto.randomBytes(4).toString('hex')}`;
  const lease = {
    resource,
    key: id,
    token,
    deviceId: device,
    ownerAlias: options.ownerAlias || DEFAULT_OWNER_ALIAS,
    acquiredAt: nowIso(now),
    expiresAt: addMs(now, ttlMs),
    ttlMs,
  };

  await putGun(node, lease, options);
  return { acquired: true, lease };
}

async function releaseLease(resource, token, options = {}) {
  if (!COORDINATION_ENABLED && !options.force) {
    return { released: false, skipped: true, reason: 'agent ops disabled' };
  }

  const id = scopedKey('lease', resource);
  const node = ownerNode(options).get('leases').get(id);
  const current = await onceGun(node, options);
  if (token && current?.token && current.token !== token) {
    return { released: false, reason: 'lease token mismatch', key: id };
  }

  await putGun(node, {
    ...current,
    releasedAt: nowIso(options.now || Date.now()),
    expiresAt: nowIso(options.now || Date.now()),
  }, options);
  return { released: true, key: id };
}

async function isHandled(kind, id, options = {}) {
  if (!COORDINATION_ENABLED && !options.force) {
    return { handled: false, skipped: true, reason: 'agent ops disabled' };
  }

  const key = scopedKey(kind, id);
  const record = await onceGun(ownerNode(options).get('handled').get(key), options);
  return {
    handled: Boolean(record?.handledAt),
    key,
    record,
  };
}

async function markHandled(kind, id, details = {}, options = {}) {
  if (!COORDINATION_ENABLED && !options.force) {
    return { marked: false, skipped: true, reason: 'agent ops disabled' };
  }

  const key = scopedKey(kind, id);
  const record = {
    key,
    kind,
    originalId: String(id || ''),
    handledAt: nowIso(options.now || Date.now()),
    deviceId: deviceId(options),
    ownerAlias: options.ownerAlias || DEFAULT_OWNER_ALIAS,
    details,
  };

  await putGun(ownerNode(options).get('handled').get(key), record, options);
  return { marked: true, key, record };
}

module.exports = {
  DEFAULT_OWNER_ALIAS,
  DEFAULT_DEVICE_ID,
  COORDINATION_ENABLED,
  scopedKey,
  writeHeartbeat,
  claimLease,
  releaseLease,
  isHandled,
  markHandled,
  putGun,
  onceGun,
};
