const {
  listTasks,
} = require('./agent-task-queue');
const {
  readSession,
  recordSession,
} = require('./context-hq');

const DEFAULT_CONTEXT_OWNER = process.env.THREEDVR_CONTEXT_HQ_OWNER_ALIAS
  || process.env.THREEDVR_AGENT_OWNER_ALIAS
  || '3dvr.tech@gmail.com';
const DEFAULT_TASK_OWNER = process.env.THREEDVR_AGENT_TASK_OWNER_ALIAS || '3dvr-managed';
const DEFAULT_LIMIT = 20;
const FINAL_STATUSES = new Set(['completed', 'failed']);

function normalizeText(value) {
  return String(value || '').trim();
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function taskHandoffId(task = {}) {
  return `task-handoff-${normalizeText(task.id)}`;
}

function taskTimestamp(task = {}) {
  const parsed = Date.parse(task.updatedAt || task.completedAt || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function buildTaskHandoff(task = {}) {
  const id = normalizeText(task.id);
  const status = normalizeText(task.status).toLowerCase();
  const taskText = normalizeText(task.task) || id || 'Unnamed task';
  const completed = status === 'completed';

  return {
    id: taskHandoffId(task),
    project: 'agent-operations',
    summary: `${completed ? 'Completed' : 'Failed'} agent task: ${taskText}`,
    decisions: completed
      ? 'Execution completed. Raw model, web, and tool output remains in the canonical task record and is not promoted into trusted durable memory automatically.'
      : 'Execution failed. Raw error and model/tool output remains in the canonical task record and is not promoted into trusted durable memory automatically.',
    openLoops: completed
      ? ''
      : `Review canonical task ${id} and decide whether to retry, revise, or close it.`,
    artifacts: [
      id ? `task:${id}` : '',
      task.updatedAt ? `updated:${task.updatedAt}` : '',
      task.riskClass ? `risk:${task.riskClass}` : '',
    ].filter(Boolean).join('; '),
    source: 'agent-task-queue',
    now: taskTimestamp(task),
  };
}

async function syncTaskHandoffs(options = {}) {
  const contextOwnerAlias = normalizeText(options.contextOwnerAlias) || DEFAULT_CONTEXT_OWNER;
  const taskOwnerAlias = normalizeText(options.taskOwnerAlias) || DEFAULT_TASK_OWNER;
  const limit = parseInteger(options.limit, DEFAULT_LIMIT);
  const listTasksImpl = options.listTasksImpl || listTasks;
  const readSessionImpl = options.readSessionImpl || readSession;
  const recordSessionImpl = options.recordSessionImpl || recordSession;

  const tasks = options.tasks || await listTasksImpl({
    ...options,
    ownerAlias: taskOwnerAlias,
  });
  const finalized = tasks
    .filter(task => FINAL_STATUSES.has(normalizeText(task.status).toLowerCase()))
    .slice(0, Math.max(0, limit));

  const results = [];
  for (const task of finalized) {
    const handoff = buildTaskHandoff(task);
    if (!normalizeText(task.id)) continue;

    const contextOptions = {
      ...options,
      ownerAlias: contextOwnerAlias,
    };
    const existing = await readSessionImpl(handoff.id, contextOptions);
    if (existing) {
      results.push({ id: handoff.id, taskId: task.id, status: 'existing' });
      continue;
    }

    const record = await recordSessionImpl(handoff.summary, {
      ...contextOptions,
      id: handoff.id,
      project: handoff.project,
      decisions: handoff.decisions,
      openLoops: handoff.openLoops,
      artifacts: handoff.artifacts,
      source: handoff.source,
      now: handoff.now,
    });
    results.push({ id: record.id, taskId: task.id, status: 'created' });
  }

  return {
    contextOwnerAlias,
    taskOwnerAlias,
    scanned: finalized.length,
    created: results.filter(result => result.status === 'created').length,
    existing: results.filter(result => result.status === 'existing').length,
    results,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--context-owner') options.contextOwnerAlias = argv[++index] || '';
    else if (arg === '--task-owner') options.taskOwnerAlias = argv[++index] || '';
    else if (arg === '--limit') options.limit = parseInteger(argv[++index], DEFAULT_LIMIT);
    else if (arg === '--json') options.json = true;
  }
  return options;
}

async function cli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = await syncTaskHandoffs(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Context HQ handoffs: ${report.created} created, ${report.existing} existing, ${report.scanned} finalized tasks scanned.`);
  }
  return report;
}

module.exports = {
  buildTaskHandoff,
  parseArgs,
  syncTaskHandoffs,
  taskHandoffId,
};

if (require.main === module) {
  cli().then(() => process.exit(0)).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
