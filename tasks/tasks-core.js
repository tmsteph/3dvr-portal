const TASK_FIELDS = [
  'id',
  'title',
  'description',
  'priority',
  'dueDate',
  'assignee',
  'status',
  'completed',
  'createdAt',
  'updatedAt',
  'createdBy',
  'contextType',
  'contextReference',
  'contextLink',
  'comments',
  'history'
];

const TASK_STATUS_VALUES = ['pending', 'progress', 'done'];
const TASK_PRIORITY_VALUES = ['low', 'medium', 'high'];

export const TASK_CACHE_KEY = 'tasks:cache:board';
export const LEGACY_TASK_CACHE_KEYS = ['3dvr-tasks'];
export const TASK_QUEUE_KEY = 'tasks:queue:board';

export function createMemoryStorage() {
  const memory = new Map();
  return {
    getItem(key) {
      return memory.has(key) ? memory.get(String(key)) : null;
    },
    setItem(key, value) {
      memory.set(String(key), String(value));
    },
    removeItem(key) {
      memory.delete(String(key));
    },
    clear() {
      memory.clear();
    },
    key(index) {
      const keys = Array.from(memory.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    get length() {
      return memory.size;
    }
  };
}

function coerceString(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

function coerceTimestamp(value, fallback) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.trunc(numeric);
  }
  return typeof fallback === 'function' ? fallback() : fallback;
}

function sanitizeTaskArray(value, sanitizer) {
  if (!Array.isArray(value)) {
    return [];
  }
  const items = [];
  value.forEach(entry => {
    const clean = sanitizer(entry);
    if (clean) {
      items.push(clean);
    }
  });
  return items;
}

function sanitizeTaskComment(entry = {}) {
  const text = coerceString(entry.text);
  if (!text) return null;
  const author = coerceString(entry.author) || 'Guest';
  const timestamp = coerceTimestamp(entry.timestamp, () => Date.now());
  return { author, text, timestamp };
}

function sanitizeTaskHistory(entry = {}) {
  const action = coerceString(entry.action);
  if (!action) return null;
  const user = coerceString(entry.user) || 'Guest';
  const timestamp = coerceTimestamp(entry.timestamp, () => Date.now());
  const details = coerceString(entry.details);
  const normalized = { action, user, timestamp };
  if (details) {
    normalized.details = details;
  }
  return normalized;
}

export function sanitizeTaskRecord(task = {}, {
  fallbackAssignee = 'Guest',
  fallbackCreator = 'Guest',
  now = () => Date.now()
} = {}) {
  const id = coerceString(task.id);
  if (!id) {
    throw new Error('Task record is missing a valid id');
  }

  const priorityRaw = coerceString(task.priority).toLowerCase();
  const priority = TASK_PRIORITY_VALUES.includes(priorityRaw) ? priorityRaw : 'medium';
  const statusRaw = coerceString(task.status).toLowerCase();
  const status = TASK_STATUS_VALUES.includes(statusRaw) ? statusRaw : 'pending';

  const createdAt = coerceTimestamp(task.createdAt, now);
  const updatedAt = coerceTimestamp(task.updatedAt, createdAt);

  const record = {
    id,
    title: coerceString(task.title),
    description: coerceString(task.description),
    priority,
    dueDate: coerceString(task.dueDate),
    assignee: coerceString(task.assignee) || fallbackAssignee,
    status,
    completed: status === 'done' ? true : Boolean(task.completed),
    createdAt,
    updatedAt,
    createdBy: coerceString(task.createdBy) || fallbackCreator,
    contextType: coerceString(task.contextType).toLowerCase(),
    contextReference: coerceString(task.contextReference),
    contextLink: coerceString(task.contextLink),
    comments: sanitizeTaskArray(task.comments, sanitizeTaskComment),
    history: sanitizeTaskArray(task.history, sanitizeTaskHistory)
  };

  TASK_FIELDS.forEach(field => {
    if (!(field in record)) {
      record[field] = '';
    }
  });

  return record;
}

function safeParse(json) {
  if (typeof json !== 'string') {
    return null;
  }
  try {
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

export function readTaskCache(storage, {
  cacheKey = TASK_CACHE_KEY,
  legacyKeys = LEGACY_TASK_CACHE_KEYS,
  now = () => Date.now(),
  fallbackAssignee,
  fallbackCreator
} = {}) {
  if (!storage || typeof storage.getItem !== 'function') {
    return {};
  }

  const keys = [cacheKey, ...(Array.isArray(legacyKeys) ? legacyKeys : [])];
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    const parsed = safeParse(raw);
    if (!parsed) continue;

    let entries;
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else if (parsed && typeof parsed === 'object') {
      entries = Object.values(parsed);
    } else {
      continue;
    }

    const map = {};
    entries.forEach(entry => {
      try {
        const record = sanitizeTaskRecord(entry, { now, fallbackAssignee, fallbackCreator });
        map[record.id] = record;
      } catch (err) {
        // ignore invalid entries
      }
    });
    if (Object.keys(map).length) {
      return map;
    }
  }
  return {};
}

export function writeTaskCache(storage, tasks = {}, {
  cacheKey = TASK_CACHE_KEY,
  legacyKeys = LEGACY_TASK_CACHE_KEYS,
  now = () => Date.now(),
  fallbackAssignee,
  fallbackCreator
} = {}) {
  if (!storage || typeof storage.setItem !== 'function') {
    return {};
  }
  const sanitized = {};
  Object.values(tasks || {}).forEach(task => {
    try {
      const record = sanitizeTaskRecord(task, { now, fallbackAssignee, fallbackCreator });
      sanitized[record.id] = record;
    } catch (err) {
      // ignore
    }
  });
  try {
    storage.setItem(cacheKey, JSON.stringify(sanitized));
    if (Array.isArray(legacyKeys)) {
      legacyKeys.forEach(key => {
        if (key && key !== cacheKey && typeof storage.removeItem === 'function') {
          try {
            storage.removeItem(key);
          } catch (err) {
            // ignore
          }
        }
      });
    }
  } catch (err) {
    // ignore write failures
  }
  return sanitized;
}

export function readTaskQueue(storage, { queueKey = TASK_QUEUE_KEY } = {}) {
  if (!storage || typeof storage.getItem !== 'function') {
    return [];
  }
  const raw = storage.getItem(queueKey);
  if (!raw) return [];
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map(entry => sanitizeTaskOperation(entry)).filter(Boolean);
}

export function writeTaskQueue(storage, queue = [], { queueKey = TASK_QUEUE_KEY } = {}) {
  if (!storage || typeof storage.setItem !== 'function') {
    return [];
  }
  const sanitized = queue.map(entry => sanitizeTaskOperation(entry)).filter(Boolean);
  try {
    storage.setItem(queueKey, JSON.stringify(sanitized));
  } catch (err) {
    // ignore
  }
  return sanitized;
}

export function sanitizeTaskOperation(operation = {}, {
  now = () => Date.now(),
  fallbackAssignee,
  fallbackCreator
} = {}) {
  const type = operation.type === 'remove' ? 'remove' : 'put';
  const taskId = coerceString(operation.taskId || (operation.task && operation.task.id));
  if (!taskId) {
    return null;
  }
  const timestamp = coerceTimestamp(operation.timestamp, now);
  if (type === 'remove') {
    return { type: 'remove', taskId, timestamp };
  }
  try {
    const task = sanitizeTaskRecord(operation.task || operation.record || operation.data || {}, {
      now,
      fallbackAssignee,
      fallbackCreator
    });
    return { type: 'put', taskId: task.id, task, timestamp };
  } catch (err) {
    return null;
  }
}

export function optimizeTaskQueue(queue = []) {
  const optimized = [];
  const indexById = new Map();
  queue.forEach(entry => {
    const op = sanitizeTaskOperation(entry);
    if (!op) return;
    if (indexById.has(op.taskId)) {
      const index = indexById.get(op.taskId);
      optimized[index] = op;
    } else {
      indexById.set(op.taskId, optimized.length);
      optimized.push(op);
    }
  });
  return optimized;
}

export function enqueueTaskOperation(storage, operation, options = {}) {
  const op = sanitizeTaskOperation(operation, options);
  if (!op) {
    return readTaskQueue(storage, options);
  }
  const queue = readTaskQueue(storage, options);
  queue.push(op);
  const optimized = optimizeTaskQueue(queue);
  return writeTaskQueue(storage, optimized, options);
}

export async function flushTaskQueue({
  storage,
  queueKey = TASK_QUEUE_KEY,
  onPut,
  onRemove,
  onError,
  now,
  fallbackAssignee,
  fallbackCreator
} = {}) {
  const queue = readTaskQueue(storage, { queueKey, now, fallbackAssignee, fallbackCreator });
  if (!queue.length) {
    return { flushed: 0, remaining: 0 };
  }
  const remaining = [];
  let flushed = 0;
  for (const entry of queue) {
    const op = sanitizeTaskOperation(entry, { now, fallbackAssignee, fallbackCreator });
    if (!op) continue;
    try {
      if (op.type === 'put') {
        if (typeof onPut === 'function') {
          await onPut(op.taskId, op.task, op);
        }
      } else if (op.type === 'remove') {
        if (typeof onRemove === 'function') {
          await onRemove(op.taskId, op);
        }
      }
      flushed += 1;
    } catch (err) {
      if (typeof onError === 'function') {
        try {
          onError(err, op);
        } catch (inner) {
          // ignore nested errors
        }
      }
      remaining.push(op);
    }
  }
  if (remaining.length !== queue.length) {
    writeTaskQueue(storage, remaining, { queueKey });
  }
  return { flushed, remaining: remaining.length };
}

export function applyTaskOperation(taskMap = {}, operation = {}, options = {}) {
  const op = sanitizeTaskOperation(operation, options);
  if (!op) return { ...taskMap };
  const next = { ...taskMap };
  if (op.type === 'put') {
    next[op.taskId] = op.task;
  } else if (op.type === 'remove') {
    delete next[op.taskId];
  }
  return next;
}

const TasksCore = {
  TASK_FIELDS,
  TASK_CACHE_KEY,
  LEGACY_TASK_CACHE_KEYS,
  TASK_QUEUE_KEY,
  createMemoryStorage,
  sanitizeTaskRecord,
  readTaskCache,
  writeTaskCache,
  readTaskQueue,
  writeTaskQueue,
  sanitizeTaskOperation,
  optimizeTaskQueue,
  enqueueTaskOperation,
  flushTaskQueue,
  applyTaskOperation
};

if (typeof window !== 'undefined') {
  window.TasksCore = Object.freeze({ ...TasksCore });
}

export default TasksCore;
