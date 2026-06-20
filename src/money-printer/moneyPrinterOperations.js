import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  createGithubBranchPlan,
  createGithubPullRequestPlan,
  createIssueFromOperation
} from './moneyPrinterGithubConnector.js';
import {
  createVercelPreviewDeploymentPlan,
  inspectVercelDeployment,
  inspectVercelProject,
  listVercelDeployments
} from './moneyPrinterVercelConnector.js';
import {
  getMoneyPrinterWorkspacePaths,
  readJsonFile,
  writeJsonFile
} from './moneyPrinterFileStorage.js';

export const OPERATION_STATUSES = Object.freeze([
  'planned',
  'approved',
  'executing',
  'executed',
  'failed',
  'skipped'
]);

export const RED_ZONE_ACTIONS = new Set([
  'sendMassEmail',
  'sendEmail',
  'moveMoney',
  'spendMoney',
  'changeDns',
  'deleteData',
  'productionMerge',
  'issueRefund',
  'changePrice'
]);

function nowIso() {
  return new Date().toISOString();
}

export function getMoneyPrinterOperationPaths(rootDir = process.cwd()) {
  const paths = getMoneyPrinterWorkspacePaths(rootDir);
  return {
    ...paths,
    operationsPath: path.join(paths.workspaceDir, 'operations.json'),
    operationLogPath: path.join(paths.logsDir, 'operations.jsonl')
  };
}

function slugPart(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function createOperationId(operation = {}, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const core = [
    slugPart(operation.provider || 'provider'),
    slugPart(operation.action || 'action'),
    slugPart(operation.title || operation.summary || 'operation')
  ].filter(Boolean).join('-');
  const suffix = Math.random().toString(36).slice(2, 7);
  return `op-${stamp}-${core || 'money-printer'}-${suffix}`;
}

function normalizeRisk(value = '') {
  const risk = String(value || '').trim().toLowerCase();
  if (['green', 'yellow', 'red'].includes(risk)) return risk;
  return 'yellow';
}

function inferRisk(operation = {}) {
  const action = String(operation.action || '').trim();
  if (RED_ZONE_ACTIONS.has(action)) return 'red';
  if (String(operation.provider || '').toLowerCase() === 'github' && action === 'createIssue') return 'yellow';
  return normalizeRisk(operation.risk || operation.zone || 'yellow');
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function operationSignature(operation = {}) {
  return [
    operation.provider,
    operation.action,
    operation.title,
    operation.summary,
    stableJson(operation.payload || {})
  ].map(value => String(value || '').trim().toLowerCase()).join('|');
}

export function createConnectorOperationPlan(operation = {}) {
  if (!operation || typeof operation !== 'object') return null;
  const provider = String(operation.provider || operation.connector || '').trim().toLowerCase();
  const action = String(operation.action || '').trim();
  const title = String(operation.title || operation.summary || '').trim();
  if (!provider || !action || !title) return null;
  const risk = inferRisk({ ...operation, provider, action });
  return {
    id: operation.id || createOperationId({ ...operation, provider, action, title }),
    provider,
    action,
    title,
    summary: String(operation.summary || title).trim(),
    risk,
    status: OPERATION_STATUSES.includes(operation.status) ? operation.status : 'planned',
    payload: operation.payload && typeof operation.payload === 'object' ? operation.payload : {},
    createdAt: operation.createdAt || nowIso(),
    updatedAt: operation.updatedAt || nowIso(),
    approvedAt: operation.approvedAt || '',
    executedAt: operation.executedAt || '',
    result: operation.result || null
  };
}

function mergeOperations(existing = [], incoming = []) {
  const byIdentity = new Map();
  const bySignature = new Map();
  const added = [];

  existing.forEach(operation => {
    byIdentity.set(operation.id, operation);
    bySignature.set(operationSignature(operation), operation);
  });

  incoming.forEach(operation => {
    if (byIdentity.has(operation.id)) {
      return;
    }
    const signature = operationSignature(operation);
    if (bySignature.has(signature)) {
      return;
    }
    byIdentity.set(operation.id, operation);
    bySignature.set(signature, operation);
    added.push(operation);
  });

  return {
    operations: Array.from(byIdentity.values()),
    added
  };
}

export async function loadMoneyPrinterOperations(rootDir = process.cwd()) {
  const { operationsPath } = getMoneyPrinterOperationPaths(rootDir);
  const value = await readJsonFile(operationsPath, []);
  return Array.isArray(value) ? value.map(createConnectorOperationPlan).filter(Boolean) : [];
}

export async function saveMoneyPrinterOperations(rootDir = process.cwd(), operations = []) {
  const { operationsPath } = getMoneyPrinterOperationPaths(rootDir);
  await writeJsonFile(operationsPath, operations.map(createConnectorOperationPlan).filter(Boolean));
  return operationsPath;
}

export async function appendMoneyPrinterOperationLog(rootDir = process.cwd(), entry = {}) {
  const { operationLogPath } = getMoneyPrinterOperationPaths(rootDir);
  await mkdir(path.dirname(operationLogPath), { recursive: true });
  const event = {
    timestamp: nowIso(),
    ...entry
  };
  await appendFile(operationLogPath, `${JSON.stringify(event)}\n`, 'utf8');
  return {
    event,
    path: operationLogPath
  };
}

export async function addMoneyPrinterOperations(rootDir = process.cwd(), operations = []) {
  const normalized = operations.map(createConnectorOperationPlan).filter(Boolean);
  const existing = await loadMoneyPrinterOperations(rootDir);
  const merged = mergeOperations(existing, normalized);
  const pathWritten = await saveMoneyPrinterOperations(rootDir, merged.operations);
  return {
    operations: merged.operations,
    added: merged.added,
    path: pathWritten
  };
}

export async function approveMoneyPrinterOperation(rootDir = process.cwd(), operationId = '') {
  const operations = await loadMoneyPrinterOperations(rootDir);
  let approved = null;
  const updated = operations.map(operation => {
    if (operation.id !== operationId) return operation;
    approved = {
      ...operation,
      status: operation.risk === 'red' ? 'skipped' : 'approved',
      approvedAt: operation.risk === 'red' ? '' : nowIso(),
      updatedAt: nowIso(),
      result: operation.risk === 'red'
        ? { ok: false, message: 'Red-zone operations cannot be approved by the local task ledger.' }
        : operation.result
    };
    return approved;
  });

  if (!approved) {
    throw new Error(`Operation not found: ${operationId}`);
  }

  await saveMoneyPrinterOperations(rootDir, updated);
  await appendMoneyPrinterOperationLog(rootDir, {
    operationId,
    action: 'approve',
    status: approved.status,
    risk: approved.risk
  });
  return approved;
}

function executeNotSupported(operation) {
  return {
    ok: false,
    provider: operation.provider,
    action: operation.action,
    status: 'skipped',
    message: `No executor is available for ${operation.provider}.${operation.action}.`
  };
}

export async function executeConnectorOperation(operation = {}, options = {}) {
  if (operation.risk === 'red' || RED_ZONE_ACTIONS.has(operation.action)) {
    return {
      ok: false,
      provider: operation.provider,
      action: operation.action,
      status: 'skipped',
      blocked: true,
      message: 'Red-zone operation blocked.'
    };
  }

  if (operation.provider === 'github') {
    if (operation.action === 'createIssue' || operation.action === 'createIssueFromOperation') {
      return createIssueFromOperation(operation, options);
    }
    if (operation.action === 'createBranchPlan') return createGithubBranchPlan(operation);
    if (operation.action === 'createPullRequestPlan') return createGithubPullRequestPlan(operation);
  }

  if (operation.provider === 'vercel') {
    if (operation.action === 'inspectProject') return inspectVercelProject(options);
    if (operation.action === 'listDeployments') return listVercelDeployments(options);
    if (operation.action === 'inspectDeployment') return inspectVercelDeployment({ ...options, payload: operation.payload });
    if (operation.action === 'createPreviewDeploymentPlan') return createVercelPreviewDeploymentPlan(operation, options);
  }

  return executeNotSupported(operation);
}

export async function executeMoneyPrinterOperation(rootDir = process.cwd(), operationId = '', options = {}) {
  const operations = await loadMoneyPrinterOperations(rootDir);
  const target = operations.find(operation => operation.id === operationId);
  if (!target) {
    throw new Error(`Operation not found: ${operationId}`);
  }

  if (target.status !== 'approved') {
    const skipped = {
      ...target,
      status: 'skipped',
      updatedAt: nowIso(),
      result: {
        ok: false,
        status: 'skipped',
        message: 'Operation must be approved before execution.'
      }
    };
    const updated = operations.map(operation => operation.id === operationId ? skipped : operation);
    await saveMoneyPrinterOperations(rootDir, updated);
    await appendMoneyPrinterOperationLog(rootDir, {
      operationId,
      action: 'execute',
      status: 'skipped',
      message: skipped.result.message
    });
    return skipped;
  }

  const executing = {
    ...target,
    status: 'executing',
    updatedAt: nowIso()
  };
  await saveMoneyPrinterOperations(
    rootDir,
    operations.map(operation => operation.id === operationId ? executing : operation)
  );

  const result = await executeConnectorOperation(executing, {
    ...options,
    execute: options.execute === true
  });
  const finalStatus = result.ok && result.status !== 'skipped' ? 'executed' : result.status === 'failed' ? 'failed' : 'skipped';
  const finalOperation = {
    ...executing,
    status: finalStatus,
    executedAt: finalStatus === 'executed' ? nowIso() : '',
    updatedAt: nowIso(),
    result
  };
  const latest = await loadMoneyPrinterOperations(rootDir);
  await saveMoneyPrinterOperations(
    rootDir,
    latest.map(operation => operation.id === operationId ? finalOperation : operation)
  );
  await appendMoneyPrinterOperationLog(rootDir, {
    operationId,
    action: 'execute',
    status: finalOperation.status,
    result
  });
  return finalOperation;
}

export async function executeApprovedMoneyPrinterOperations(rootDir = process.cwd(), options = {}) {
  const operations = await loadMoneyPrinterOperations(rootDir);
  const approved = operations.filter(operation => operation.status === 'approved');
  const results = [];
  for (const operation of approved) {
    results.push(await executeMoneyPrinterOperation(rootDir, operation.id, options));
  }
  return results;
}
