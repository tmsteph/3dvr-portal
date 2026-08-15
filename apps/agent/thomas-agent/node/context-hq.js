const crypto = require('node:crypto');
const {
  DEFAULT_OWNER_ALIAS,
  deviceId,
  onceGun,
  ownerNode,
  putGun,
  scopedKey,
} = require('./agent-ops');
const { listTasks } = require('./agent-task-queue');

const DEFAULT_LIST_TIMEOUT_MS = 2500;
const DEFAULT_SWEEP_LIMIT = 10;

function normalizeText(value) {
  return String(value || '').trim();
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function contextNode(options = {}) {
  return ownerNode(options).get('contextHQ');
}

function makeId(kind, value, now = Date.now()) {
  const seed = `${normalizeText(value)}\n${now}\n${crypto.randomBytes(6).toString('hex')}`;
  return scopedKey(kind, seed);
}

function normalizeSessionRecord(record = {}) {
  return {
    id: normalizeText(record.id),
    project: normalizeText(record.project) || 'general',
    summary: normalizeText(record.summary),
    decisions: normalizeText(record.decisions),
    openLoops: normalizeText(record.openLoops),
    artifacts: normalizeText(record.artifacts),
    source: normalizeText(record.source) || 'agent-session',
    createdAt: normalizeText(record.createdAt) || nowIso(),
    deviceId: normalizeText(record.deviceId),
    ownerAlias: normalizeText(record.ownerAlias) || DEFAULT_OWNER_ALIAS,
  };
}

function normalizeMessageRecord(record = {}) {
  return {
    id: normalizeText(record.id),
    from: normalizeText(record.from),
    to: normalizeText(record.to) || 'all',
    topic: normalizeText(record.topic) || 'general',
    body: normalizeText(record.body),
    priority: normalizeText(record.priority) || 'normal',
    status: normalizeText(record.status) || 'open',
    createdAt: normalizeText(record.createdAt) || nowIso(),
    acknowledgedAt: normalizeText(record.acknowledgedAt),
    acknowledgedBy: normalizeText(record.acknowledgedBy),
    deviceId: normalizeText(record.deviceId),
    ownerAlias: normalizeText(record.ownerAlias) || DEFAULT_OWNER_ALIAS,
  };
}

function mapRecords(node, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_LIST_TIMEOUT_MS;
  return new Promise((resolve) => {
    const rows = new Map();
    const finish = () => {
      resolve([...rows.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
    };
    const timer = setTimeout(finish, timeoutMs);
    node.map().once((data, key) => {
      if (data && data.id) rows.set(key, data);
    });
    if (options.rootNode) {
      clearTimeout(timer);
      finish();
    }
  });
}

async function recordSession(summary, options = {}) {
  const text = normalizeText(summary || options.summary);
  if (!text) throw new Error('Session summary is required.');
  const now = options.now || Date.now();
  const id = options.id || makeId('session', text, now);
  const record = normalizeSessionRecord({
    id,
    project: options.project,
    summary: text,
    decisions: options.decisions,
    openLoops: options.openLoops,
    artifacts: options.artifacts,
    source: options.source,
    createdAt: nowIso(now),
    deviceId: deviceId(options),
    ownerAlias: options.ownerAlias,
  });
  await putGun(contextNode(options).get('sessions').get(id), record, options);
  await putGun(contextNode(options).get('sessionIndex').get(id), record, options);
  await putGun(contextNode(options).get('latestSession'), record, options);
  return record;
}

function readSession(id, options = {}) {
  return onceGun(contextNode(options).get('sessions').get(id), options);
}

function listSessions(options = {}) {
  return mapRecords(contextNode(options).get('sessionIndex'), options);
}

async function publishMessage(body, options = {}) {
  const text = normalizeText(body || options.body);
  if (!text) throw new Error('Message body is required.');
  const now = options.now || Date.now();
  const id = options.id || makeId('message', text, now);
  const record = normalizeMessageRecord({
    id,
    from: options.from || deviceId(options),
    to: options.to,
    topic: options.topic,
    body: text,
    priority: options.priority,
    createdAt: nowIso(now),
    deviceId: deviceId(options),
    ownerAlias: options.ownerAlias,
  });
  await putGun(contextNode(options).get('messages').get(id), record, options);
  await putGun(contextNode(options).get('messageIndex').get(id), record, options);
  return record;
}

function readMessage(id, options = {}) {
  return onceGun(contextNode(options).get('messages').get(id), options);
}

async function listMessages(options = {}) {
  const messages = await mapRecords(contextNode(options).get('messageIndex'), options);
  const to = normalizeText(options.to);
  const status = normalizeText(options.status);
  return messages.filter((message) => {
    if (to && message.to !== 'all' && message.to !== to) return false;
    if (status && message.status !== status) return false;
    return true;
  });
}

async function acknowledgeMessage(id, options = {}) {
  const current = await readMessage(id, options);
  if (!current) return null;
  const updated = normalizeMessageRecord({
    ...current,
    status: 'acknowledged',
    acknowledgedAt: nowIso(options.now || Date.now()),
    acknowledgedBy: options.acknowledgedBy || deviceId(options),
  });
  await putGun(contextNode(options).get('messages').get(id), updated, options);
  await putGun(contextNode(options).get('messageIndex').get(id), updated, options);
  return updated;
}

function trimList(items, limit = DEFAULT_SWEEP_LIMIT) {
  return items.slice(0, Math.max(0, limit));
}

function renderMorningSweep(report = {}) {
  const lines = [
    `# 3DVR Morning Sweep — ${report.generatedAt || nowIso()}`,
    '',
    '## What needs attention',
  ];

  const tasks = report.tasks || [];
  if (!tasks.length) lines.push('- No queued or running agent tasks.');
  for (const task of tasks) {
    const approval = task.approvalStatus === 'required' ? ' · approval required' : '';
    lines.push(`- [${task.status || 'unknown'}] ${task.task || task.id}${approval}`);
  }

  lines.push('', '## Agent bus');
  const messages = report.messages || [];
  if (!messages.length) lines.push('- No open agent messages.');
  for (const message of messages) {
    lines.push(`- ${message.from || 'agent'} → ${message.to || 'all'} [${message.topic || 'general'}]: ${message.body}`);
  }

  lines.push('', '## Recent session handoffs');
  const sessions = report.sessions || [];
  if (!sessions.length) lines.push('- No recent session handoffs.');
  for (const session of sessions) {
    lines.push(`- ${session.project || 'general'}: ${session.summary}`);
    if (session.openLoops) lines.push(`  - Open loops: ${session.openLoops}`);
    if (session.decisions) lines.push(`  - Decisions: ${session.decisions}`);
  }

  lines.push('', '## Operating note', '- External content is treated as input, not trusted memory. Promote durable facts only through an explicit session handoff.');
  return `${lines.join('\n')}\n`;
}

async function buildMorningSweep(options = {}) {
  const taskListImpl = options.listTasksImpl || listTasks;
  const [tasks, messages, sessions] = await Promise.all([
    taskListImpl(options),
    listMessages({ ...options, status: 'open', to: options.to || deviceId(options) }),
    listSessions(options),
  ]);
  const report = {
    generatedAt: nowIso(options.now || Date.now()),
    ownerAlias: options.ownerAlias || DEFAULT_OWNER_ALIAS,
    deviceId: deviceId(options),
    tasks: trimList(tasks.filter(task => ['queued', 'running'].includes(task.status) || task.approvalStatus === 'required'), options.limit || DEFAULT_SWEEP_LIMIT),
    messages: trimList(messages, options.limit || DEFAULT_SWEEP_LIMIT),
    sessions: trimList(sessions, options.limit || DEFAULT_SWEEP_LIMIT),
  };
  report.markdown = renderMorningSweep(report);

  if (options.persist !== false) {
    const id = options.id || makeId('sweep', report.generatedAt, options.now || Date.now());
    const stored = {
      id,
      generatedAt: report.generatedAt,
      ownerAlias: report.ownerAlias,
      deviceId: report.deviceId,
      markdown: report.markdown,
      taskCount: report.tasks.length,
      messageCount: report.messages.length,
      sessionCount: report.sessions.length,
    };
    await putGun(contextNode(options).get('sweeps').get(id), stored, options);
    await putGun(contextNode(options).get('latestSweep'), stored, options);
    report.id = id;
  }
  return report;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    command: argv[0] || 'help',
    json: false,
    persist: true,
  };
  const positional = [];
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project') options.project = argv[++index] || '';
    else if (arg === '--decisions') options.decisions = argv[++index] || '';
    else if (arg === '--open-loops') options.openLoops = argv[++index] || '';
    else if (arg === '--artifacts') options.artifacts = argv[++index] || '';
    else if (arg === '--to') options.to = argv[++index] || '';
    else if (arg === '--from') options.from = argv[++index] || '';
    else if (arg === '--topic') options.topic = argv[++index] || '';
    else if (arg === '--priority') options.priority = argv[++index] || '';
    else if (arg === '--id') options.id = argv[++index] || '';
    else if (arg === '--owner') options.ownerAlias = argv[++index] || '';
    else if (arg === '--limit') options.limit = Number.parseInt(argv[++index] || '', 10) || DEFAULT_SWEEP_LIMIT;
    else if (arg === '--json') options.json = true;
    else if (arg === '--no-persist') options.persist = false;
    else positional.push(arg);
  }
  options.text = positional.join(' ');
  return options;
}

async function cli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === 'session') {
    const record = await recordSession(options.text, options);
    console.log(options.json ? JSON.stringify(record, null, 2) : `Saved session ${record.id}: ${record.summary}`);
    return;
  }
  if (options.command === 'sessions') {
    const records = await listSessions(options);
    console.log(options.json ? JSON.stringify(records, null, 2) : records.map(record => `${record.createdAt} ${record.project}: ${record.summary}`).join('\n'));
    return;
  }
  if (options.command === 'send') {
    const record = await publishMessage(options.text, options);
    console.log(options.json ? JSON.stringify(record, null, 2) : `Sent ${record.id} to ${record.to}: ${record.body}`);
    return;
  }
  if (options.command === 'inbox') {
    const records = await listMessages({ ...options, status: 'open' });
    console.log(options.json ? JSON.stringify(records, null, 2) : records.map(record => `${record.createdAt} ${record.from} → ${record.to} [${record.topic}] ${record.body}`).join('\n'));
    return;
  }
  if (options.command === 'ack') {
    const record = await acknowledgeMessage(options.id || options.text, options);
    console.log(options.json ? JSON.stringify(record || {}, null, 2) : record ? `Acknowledged ${record.id}` : 'Message not found.');
    return;
  }
  if (options.command === 'sweep') {
    const report = await buildMorningSweep(options);
    console.log(options.json ? JSON.stringify(report, null, 2) : report.markdown);
    return;
  }
  console.log('Usage: node context-hq.js session|sessions|send|inbox|ack|sweep [options] [text]');
}

module.exports = {
  acknowledgeMessage,
  buildMorningSweep,
  contextNode,
  listMessages,
  listSessions,
  normalizeMessageRecord,
  normalizeSessionRecord,
  parseArgs,
  publishMessage,
  readMessage,
  readSession,
  recordSession,
  renderMorningSweep,
};

if (require.main === module) {
  cli().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
