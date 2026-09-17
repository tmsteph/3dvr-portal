export const WORKER_EXECUTION_CLASSES = Object.freeze(['read', 'action', 'identity']);
export const WORKER_STATES = Object.freeze(['idle', 'running', 'paused', 'degraded', 'offline']);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const cleanList = (value, max = 30) => [...new Set((Array.isArray(value) ? value : [])
  .map(item => clean(item, 160)).filter(Boolean))].slice(0, max);

function finiteBounded(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function normalizeWorker(record = {}, options = {}) {
  const now = clean(options.now || new Date().toISOString(), 80);
  const id = clean(record.id || options.id, 160);
  if (!id) throw new Error('Worker id is required.');

  const executionClass = WORKER_EXECUTION_CLASSES.includes(record.executionClass)
    ? record.executionClass : 'read';
  const healthState = WORKER_STATES.includes(record.health?.state)
    ? record.health.state : 'idle';

  return {
    id,
    name: clean(record.name || id, 160),
    executionClass,
    capabilities: cleanList(record.capabilities),
    lane: clean(record.lane, 100),
    resourceBudget: {
      memoryMb: finiteBounded(record.resourceBudget?.memoryMb, 512, 64, 8192),
      cpuPercent: finiteBounded(record.resourceBudget?.cpuPercent, 50, 1, 400),
      maxConcurrentTasks: finiteBounded(record.resourceBudget?.maxConcurrentTasks, 1, 1, 20)
    },
    health: {
      state: healthState,
      lastHeartbeatAt: clean(record.health?.lastHeartbeatAt || now, 80),
      detail: clean(record.health?.detail, 500)
    },
    currentWorkItemIds: cleanList(record.currentWorkItemIds),
    updatedAt: clean(record.updatedAt || now, 80)
  };
}

export function workerCanRun(worker = {}, workItem = {}) {
  if (!['idle', 'running'].includes(worker.health?.state)) return false;
  if ((worker.currentWorkItemIds?.length || 0) >= (worker.resourceBudget?.maxConcurrentTasks || 1)) return false;

  const capabilities = new Set(worker.capabilities || []);
  if (!(workItem.requiredCapabilities || []).every(capability => capabilities.has(capability))) return false;

  if (workItem.identityLease?.required && worker.executionClass !== 'identity') return false;
  if (!workItem.identityLease?.required && workItem.risk === 'high' && worker.executionClass === 'read') return false;
  return true;
}

export function workerIsStale(worker = {}, { now = Date.now(), staleAfterMs = 5 * 60_000 } = {}) {
  const heartbeat = Date.parse(worker.health?.lastHeartbeatAt || '');
  return !Number.isFinite(heartbeat) || now - heartbeat > staleAfterMs;
}
