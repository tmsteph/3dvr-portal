import {
  actionReceiptFromRuntimeRecord,
  createActionReceipt
} from '../src/operator-runtime/action-receipt.js';

const LOCAL_KEY = '3dvr.operator.actionReceipts.v1';
const ROOT_KEY = '3dvr-portal';
const DEFAULT_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];

function clean(value = '', max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function readLocalReceipts() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem?.(LOCAL_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalReceipt(receipt) {
  if (!globalThis.localStorage?.setItem) return;
  const current = readLocalReceipts().filter(item => item?.id !== receipt.id);
  current.unshift(receipt);
  try {
    globalThis.localStorage.setItem(LOCAL_KEY, JSON.stringify(current.slice(0, 120)));
  } catch {}
}

function ownerAlias() {
  return clean(globalThis.localStorage?.getItem?.('alias'), 160) || 'portal-operator';
}

function gunRecord(receipt) {
  return {
    id: receipt.id,
    actionId: receipt.actionId,
    kind: receipt.kind,
    source: receipt.source,
    title: receipt.title,
    domain: receipt.domain,
    workflow: receipt.workflow,
    status: receipt.status,
    terminal: receipt.terminal,
    verificationStatus: receipt.verificationStatus,
    verified: receipt.verified,
    actor: receipt.actor,
    workerId: receipt.workerId,
    workerLane: receipt.workerLane,
    resultSummary: receipt.resultSummary,
    error: receipt.error,
    url: receipt.url,
    createdAt: receipt.createdAt,
    startedAt: receipt.startedAt,
    updatedAt: receipt.updatedAt,
    completedAt: receipt.completedAt,
    evidenceCount: receipt.evidence.length,
    receiptJson: JSON.stringify(receipt)
  };
}

export function loadOperatorActionReceipts() {
  return readLocalReceipts();
}

export function persistOperatorActionReceipt(input = {}) {
  const receipt = createActionReceipt(input);
  writeLocalReceipt(receipt);

  try {
    if (typeof globalThis.Gun === 'function') {
      const gun = globalThis.Gun({ peers: globalThis.__GUN_PEERS__ || DEFAULT_PEERS });
      gun.get(ROOT_KEY)
        .get('operator')
        .get('receipts')
        .get(ownerAlias())
        .get(receipt.id)
        .put(gunRecord(receipt));
    }
  } catch {}

  return receipt;
}

function actionIdFromBackground(background = {}, record = {}) {
  const direct = clean(record.id || record.requestId || background.id, 240);
  if (direct) return direct;

  const value = clean(background.value, 1000);
  if (!value) return 'unknown';
  try {
    return new URL(value, globalThis.location?.origin || 'https://portal.3dvr.tech')
      .searchParams.get('id') || value;
  } catch {
    return value;
  }
}

function backgroundContext(background = {}, action = {}, outcome = {}, record = {}) {
  const kind = clean(background.kind, 80) || 'action';
  const titleByKind = {
    operator_runtime: 'Operator delegated task',
    server_control: 'Server control request',
    forge: 'Forge code change'
  };
  const domainByKind = {
    operator_runtime: 'operator',
    server_control: 'infrastructure',
    forge: 'engineering'
  };

  return {
    actionId: actionIdFromBackground(background, record),
    kind,
    source: 'portal-operator',
    title: clean(action.title, 240) || titleByKind[kind] || 'Operator action',
    intent: clean(action.text, 4000),
    domain: domainByKind[kind] || 'operator',
    workflow: kind,
    url: clean(outcome.url || background.url || background.value, 1000)
  };
}

export function persistQueuedOperatorAction(action = {}, outcome = {}) {
  const background = outcome.backgroundTask;
  if (!background?.kind) return null;
  const now = new Date().toISOString();
  const context = backgroundContext(background, action, outcome);
  return persistOperatorActionReceipt(actionReceiptFromRuntimeRecord({
    id: context.actionId,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    requestedBy: 'portal-operator'
  }, context));
}

export function persistBackgroundActionUpdate(background = {}, update = {}, action = {}) {
  if (!background?.kind) return null;
  const record = update.record && typeof update.record === 'object'
    ? update.record
    : {
        id: actionIdFromBackground(background),
        status: update.status || 'queued',
        resultSummary: update.terminal ? update.message : '',
        updatedAt: new Date().toISOString()
      };
  const context = backgroundContext(background, action, {}, record);
  return persistOperatorActionReceipt(actionReceiptFromRuntimeRecord(record, context));
}
