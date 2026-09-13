export const WORKER_CLASSES = Object.freeze(['read', 'action', 'identity']);
export const WORKER_STATUSES = Object.freeze(['idle', 'busy', 'offline', 'degraded']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value) {
  return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
}

export function createWorker(input = {}) {
  const id = text(input.id);
  const name = text(input.name);
  const workerClass = input.class || 'read';
  const status = input.status || 'idle';

  if (!id) throw new TypeError('worker id is required');
  if (!name) throw new TypeError('worker name is required');
  if (!WORKER_CLASSES.includes(workerClass)) {
    throw new TypeError(`worker class must be one of: ${WORKER_CLASSES.join(', ')}`);
  }
  if (!WORKER_STATUSES.includes(status)) {
    throw new TypeError(`worker status must be one of: ${WORKER_STATUSES.join(', ')}`);
  }

  return {
    id,
    name,
    role: text(input.role) || null,
    class: workerClass,
    status,
    capabilities: list(input.capabilities),
    lanes: list(input.lanes),
    maxConcurrent: Number.isFinite(input.maxConcurrent) && input.maxConcurrent > 0
      ? Math.floor(input.maxConcurrent)
      : 1,
    activeCount: Number.isFinite(input.activeCount) && input.activeCount >= 0
      ? Math.floor(input.activeCount)
      : 0,
    resourceBudget: input.resourceBudget && typeof input.resourceBudget === 'object'
      ? { ...input.resourceBudget }
      : {},
    metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {}
  };
}

export function workerCanRun(worker, workItem) {
  if (!worker || !workItem) return false;
  if (worker.status !== 'idle' && worker.status !== 'busy') return false;
  if (worker.activeCount >= worker.maxConcurrent) return false;

  const capabilities = new Set(worker.capabilities || []);
  const required = workItem.requiredCapabilities || [];
  if (!required.every(capability => capabilities.has(capability))) return false;

  if (workItem.identityLease && worker.class !== 'identity') return false;
  if (workItem.risk === 'high' && worker.class === 'read') return false;

  return true;
}

export function findEligibleWorkers(workers = [], workItem) {
  return workers
    .filter(worker => workerCanRun(worker, workItem))
    .sort((a, b) => {
      if (a.class === b.class) return a.activeCount - b.activeCount;
      const order = { read: 0, action: 1, identity: 2 };
      return order[a.class] - order[b.class];
    });
}
