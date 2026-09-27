import { createSignedPortalProof } from './forge.js';

const ROOT_KEY = '3dvr-portal';
const DEFAULT_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];
const WRITE_TIMEOUT_MS = 8000;
const SERVICES = new Set([
  '3dvr-personal-mcp.service',
  '3dvr-secrets-broker.service',
  '3dvr-self-host-portal.service',
  'openbao.service'
]);

function clean(value = '', max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function makeId() {
  return `server-control-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function encodeProof(value = '') {
  const text = String(value || '');
  if (!text) return '';
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `b64:${globalThis.btoa(binary)}`;
}

function putGun(node, value) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ queued: true, pendingSync: true });
    }, WRITE_TIMEOUT_MS);
    node.put(value, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack?.err) reject(new Error(String(ack.err)));
      else resolve(ack || {});
    });
  });
}

export function normalizeServerControlAction(action = {}) {
  const server = clean(action.server, 40).toLowerCase();
  const operation = clean(action.operation, 40).toLowerCase();
  const service = clean(action.service, 160);
  if (!['ovh', 'hetzner', 'digitalocean'].includes(server)) {
    throw new Error('Choose a known 3DVR server.');
  }
  if (!['health', 'service_status', 'service_restart'].includes(operation)) {
    throw new Error('That server operation is not supported.');
  }
  if (operation !== 'health') {
    if (server !== 'ovh') throw new Error('Service control is currently limited to the OVH control plane.');
    if (!SERVICES.has(service)) throw new Error('That service is not on the server-control allowlist.');
  }
  return { server, operation, service: operation === 'health' ? '' : service };
}

export async function queueServerControl(action = {}) {
  if (typeof globalThis.Gun !== 'function') {
    throw new Error('The 3DVR control queue is unavailable in this browser.');
  }
  const request = normalizeServerControlAction(action);
  const id = makeId();
  const proof = await createSignedPortalProof('operator-server-control', 'queue-server-control', {
    requestId: id,
    ...request
  });
  if (!proof) throw new Error('Sign in with the 3DVR owner account before controlling servers.');

  const record = {
    id,
    ...request,
    status: 'queued',
    requestedBy: 'portal-operator',
    requestedByAlias: proof.portalAlias || proof.authPub,
    authPub: proof.authPub,
    authProof: encodeProof(proof.authProof),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resultSummary: '',
    error: ''
  };

  const gun = globalThis.Gun({ peers: globalThis.__GUN_PEERS__ || DEFAULT_PEERS });
  const result = await putGun(
    gun.get(ROOT_KEY).get('control').get('serverRequests').get(id),
    record
  );

  return {
    message: result?.pendingSync
      ? 'Queued the signed server request locally. It will run when the control worker reconnects.'
      : operationMessage(request),
    label: 'Server control'
  };
}

function operationMessage(request) {
  if (request.operation === 'health') return `Queued a health check for ${request.server}.`;
  if (request.operation === 'service_status') return `Queued a status check for ${request.service} on OVH.`;
  return `Queued an owner-approved restart of ${request.service} on OVH.`;
}
