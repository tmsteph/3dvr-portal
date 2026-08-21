const {
  acknowledgeMessage,
  contextNode,
} = require('./context-hq');
const { enqueueTask } = require('./agent-task-queue');
const {
  isHandled,
  markHandled,
  scopedKey,
  writeHeartbeat,
} = require('./agent-ops');

const DEFAULT_CONTEXT_OWNER_ALIAS = process.env.THREEDVR_CONTEXT_HQ_OWNER_ALIAS
  || process.env.THREEDVR_AGENT_OWNER_ALIAS
  || '3dvr.tech@gmail.com';
const DEFAULT_TASK_OWNER_ALIAS = process.env.THREEDVR_AGENT_TASK_OWNER_ALIAS || '3dvr-managed';
const DEFAULT_TARGET = process.env.THREEDVR_CONTEXT_TASK_TARGET || 'do-worker';
const DEFAULT_BACKEND = process.env.THREEDVR_CONTEXT_TASK_BACKEND || 'auto';
const DEFAULT_ROUTER_ID = process.env.THREEDVR_CONTEXT_TASK_ROUTER_ID || 'context-task-router';
const DEFAULT_HEARTBEAT_SECONDS = parseInteger(process.env.THREEDVR_CONTEXT_TASK_HEARTBEAT_SECONDS, 60);
const VALID_RISK_CLASSES = new Set(['read_only', 'draft', 'workspace_write', 'external_write', 'money', 'credential']);
const APPROVAL_REQUIRED_RISKS = new Set(['external_write', 'money', 'credential']);

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function parseTaskTopic(topic) {
  const normalized = normalizeText(topic).toLowerCase();
  if (normalized === 'task') {
    return { matches: true, riskClass: 'draft' };
  }
  if (!normalized.startsWith('task:')) {
    return { matches: false, reason: 'topic is not an explicit task' };
  }

  const riskClass = normalizeText(normalized.slice('task:'.length)).replace(/-/g, '_');
  if (!VALID_RISK_CLASSES.has(riskClass)) {
    return { matches: false, reason: `unsupported task risk: ${riskClass || 'empty'}` };
  }
  return { matches: true, riskClass };
}

function shouldRouteMessage(message = {}, options = {}) {
  if (!normalizeText(message.id)) return { ok: false, reason: 'message id missing' };
  if (normalizeText(message.status || 'open') !== 'open') return { ok: false, reason: 'message is not open' };
  if (normalizeText(message.to) !== normalizeText(options.target || DEFAULT_TARGET)) {
    return { ok: false, reason: 'message is not addressed to the task worker' };
  }
  if (!normalizeText(message.body)) return { ok: false, reason: 'message body missing' };

  const topic = parseTaskTopic(message.topic);
  if (!topic.matches) return { ok: false, reason: topic.reason };
  return { ok: true, riskClass: topic.riskClass };
}

async function routeMessage(message = {}, options = {}) {
  const route = shouldRouteMessage(message, options);
  if (!route.ok) return { ok: false, skipped: true, reason: route.reason };

  const contextOwnerAlias = options.contextOwnerAlias || DEFAULT_CONTEXT_OWNER_ALIAS;
  const taskOwnerAlias = options.taskOwnerAlias || DEFAULT_TASK_OWNER_ALIAS;
  const isHandledImpl = options.isHandledImpl || isHandled;
  const markHandledImpl = options.markHandledImpl || markHandled;
  const enqueueTaskImpl = options.enqueueTaskImpl || enqueueTask;
  const acknowledgeMessageImpl = options.acknowledgeMessageImpl || acknowledgeMessage;
  const commonOps = options.rootNode ? { rootNode: options.rootNode, force: true } : {};

  const handled = await isHandledImpl('context-task', message.id, {
    ...commonOps,
    ownerAlias: contextOwnerAlias,
  });
  if (handled?.handled) {
    return { ok: true, skipped: true, reason: 'message already routed', taskId: handled.record?.details?.taskId || '' };
  }

  const taskId = scopedKey('context-task', message.id);
  const approvalStatus = APPROVAL_REQUIRED_RISKS.has(route.riskClass) ? 'required' : 'not_required';
  const task = await enqueueTaskImpl(message.body, {
    ...commonOps,
    id: taskId,
    ownerAlias: taskOwnerAlias,
    tenantId: taskOwnerAlias,
    tenantAlias: normalizeText(message.from) || contextOwnerAlias,
    backend: options.backend || DEFAULT_BACKEND,
    riskClass: route.riskClass,
    approvalStatus,
    requiredCapabilities: options.requiredCapabilities || options.backend || DEFAULT_BACKEND,
    requestedBy: `context:${normalizeText(message.from) || 'unknown'}`,
  });

  await markHandledImpl('context-task', message.id, {
    taskId: task.id,
    riskClass: route.riskClass,
    approvalStatus,
    sourceMessageId: message.id,
  }, {
    ...commonOps,
    ownerAlias: contextOwnerAlias,
  });

  await acknowledgeMessageImpl(message.id, {
    ...commonOps,
    ownerAlias: contextOwnerAlias,
    acknowledgedBy: options.routerId || DEFAULT_ROUTER_ID,
  });

  return {
    ok: true,
    routed: true,
    taskId: task.id,
    riskClass: route.riskClass,
    approvalStatus,
  };
}

function startRouter(options = {}) {
  const contextOwnerAlias = options.contextOwnerAlias || DEFAULT_CONTEXT_OWNER_ALIAS;
  const taskOwnerAlias = options.taskOwnerAlias || DEFAULT_TASK_OWNER_ALIAS;
  const target = options.target || DEFAULT_TARGET;
  const root = contextNode({
    ...(options.rootNode ? { rootNode: options.rootNode } : {}),
    ownerAlias: contextOwnerAlias,
  }).get('messageIndex');
  const feed = root.map();
  const inFlight = new Set();

  const processMessage = (message) => {
    const id = normalizeText(message?.id);
    if (!id || inFlight.has(id)) return;
    const eligible = shouldRouteMessage(message, { ...options, target });
    if (!eligible.ok) return;

    inFlight.add(id);
    routeMessage(message, {
      ...options,
      contextOwnerAlias,
      taskOwnerAlias,
      target,
    }).then((result) => {
      if (result.routed) {
        console.log(`[context-task-router] ${id} -> ${result.taskId} (${result.riskClass}, approval=${result.approvalStatus})`);
      }
    }).catch((error) => {
      console.error(`[context-task-router] ${id} failed: ${error.message || error}`);
    }).finally(() => {
      inFlight.delete(id);
    });
  };

  feed.on(processMessage);

  const heartbeat = () => writeHeartbeat('context-task-router', {
    ...(options.rootNode ? { rootNode: options.rootNode, force: true } : {}),
    ownerAlias: taskOwnerAlias,
    status: 'running',
    metadata: {
      contextOwnerAlias,
      taskOwnerAlias,
      target,
      backend: options.backend || DEFAULT_BACKEND,
      mode: 'event-driven',
    },
  }).catch((error) => {
    console.warn(`[context-task-router] heartbeat skipped: ${error.message || error}`);
  });

  heartbeat();
  const interval = setInterval(heartbeat, Math.max(10, options.heartbeatSeconds || DEFAULT_HEARTBEAT_SECONDS) * 1000);

  return {
    stop() {
      clearInterval(interval);
      if (typeof feed.off === 'function') feed.off();
    },
  };
}

function main() {
  const router = startRouter();
  console.log(`[context-task-router] alive; ${DEFAULT_CONTEXT_OWNER_ALIAS} -> ${DEFAULT_TASK_OWNER_ALIAS}; target=${DEFAULT_TARGET}`);
  const stop = () => {
    router.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

module.exports = {
  APPROVAL_REQUIRED_RISKS,
  parseTaskTopic,
  routeMessage,
  shouldRouteMessage,
  startRouter,
};

if (require.main === module) {
  main();
}
