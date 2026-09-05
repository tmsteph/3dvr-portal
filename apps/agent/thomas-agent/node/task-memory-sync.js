const { listTasks } = require('./agent-task-queue');
const { importContextSessions } = require('./digital-organism');
const { buildTaskHandoff } = require('./task-handoff-sync');

const DEFAULT_TASK_OWNER = process.env.THREEDVR_AGENT_TASK_OWNER_ALIAS || '3dvr-managed';
const DEFAULT_LIMIT = 100;
const FINAL_STATUSES = new Set(['completed', 'failed']);

function normalizeText(value) {
  return String(value || '').trim();
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isSyntheticProbe(task = {}) {
  const backend = normalizeText(task.backend).toLowerCase();
  const text = normalizeText(task.task).toLowerCase();
  return backend === 'health'
    || text.includes('worker health check')
    || text.includes('worker-ok');
}

function taskTimestamp(task = {}) {
  const parsed = Date.parse(task.updatedAt || task.completedAt || task.createdAt || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function taskSessionsFromTasks(tasks = [], options = {}) {
  const limit = parseInteger(options.limit, DEFAULT_LIMIT);
  return tasks
    .filter(task => FINAL_STATUSES.has(normalizeText(task.status).toLowerCase()))
    .filter(task => options.includeSynthetic === true || !isSyntheticProbe(task))
    .slice(0, limit)
    .sort((a, b) => taskTimestamp(a) - taskTimestamp(b))
    .map((task) => {
      const handoff = buildTaskHandoff(task);
      return {
        id: handoff.id,
        project: handoff.project,
        summary: handoff.summary,
        decisions: handoff.decisions,
        openLoops: handoff.openLoops,
        artifacts: handoff.artifacts,
        source: handoff.source,
        createdAt: new Date(handoff.now).toISOString(),
      };
    });
}

async function importTaskHandoffsFromTasks(tasks = [], options = {}, runtime = {}) {
  const importContextSessionsImpl = runtime.importContextSessionsImpl || importContextSessions;
  const sessions = taskSessionsFromTasks(tasks, options);
  const result = await importContextSessionsImpl(sessions, options);
  return {
    scanned: sessions.length,
    imported: result.imported,
    skipped: result.skipped,
  };
}

async function syncLocalTaskHandoffs(options = {}, runtime = {}) {
  const listTasksImpl = runtime.listTasksImpl || listTasks;
  const taskOwnerAlias = normalizeText(options.taskOwnerAlias) || DEFAULT_TASK_OWNER;
  const limit = parseInteger(options.limit, DEFAULT_LIMIT);
  const tasks = await listTasksImpl({
    ...options,
    ownerAlias: taskOwnerAlias,
    queueStore: options.queueStore || 'sqlite',
    limit,
  });
  const result = await importTaskHandoffsFromTasks(tasks, { ...options, limit }, runtime);
  return { taskOwnerAlias, ...result };
}

module.exports = {
  DEFAULT_LIMIT,
  DEFAULT_TASK_OWNER,
  importTaskHandoffsFromTasks,
  isSyntheticProbe,
  syncLocalTaskHandoffs,
  taskSessionsFromTasks,
};
