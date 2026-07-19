const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { TASK_STATES } = require('./mission-schema');

const STATE_SCHEMA_VERSION = 1;
const DEFAULT_STATE_ROOT = path.join(os.homedir(), '.3dvr', 'state', 'missions');
const iso = (now = Date.now()) => new Date(now).toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;

function stateDirectory(missionId, root = DEFAULT_STATE_ROOT) { return path.join(root, missionId); }
function initialState(mission) {
  const tasks = Object.fromEntries(mission.tasks.map(task => [task.id, { state: 'queued', attempts: 0, lastEventId: null }]));
  return { schemaVersion: STATE_SCHEMA_VERSION, missionId: mission.missionId, state: 'queued', updatedAt: iso(), tasks, currentTaskId: null, approvals: [], evidence: [], blockers: [] };
}

async function atomicWrite(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, filePath);
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return fallback; throw error; }
}

async function loadState(mission, root = DEFAULT_STATE_ROOT) {
  const dir = stateDirectory(mission.missionId, root); const fallback = initialState(mission);
  const state = await readJson(path.join(dir, 'state.json'), fallback);
  if (state.schemaVersion > STATE_SCHEMA_VERSION) throw new Error(`state schemaVersion ${state.schemaVersion} is newer than supported version ${STATE_SCHEMA_VERSION}; refusing to overwrite it`);
  if (state.schemaVersion !== STATE_SCHEMA_VERSION || state.missionId !== mission.missionId) return fallback;
  return { ...fallback, ...state, tasks: { ...fallback.tasks, ...(state.tasks || {}) } };
}

async function saveState(state, root = DEFAULT_STATE_ROOT) { state.updatedAt = iso(); await atomicWrite(path.join(stateDirectory(state.missionId, root), 'state.json'), state); return state; }

async function appendEvent(event, root = DEFAULT_STATE_ROOT) {
  const record = { eventId: event.eventId || id('evt'), timestamp: event.timestamp || iso(), severity: 'info', visibility: 'user', sensitiveFieldsRedacted: true, ...event };
  const dir = stateDirectory(record.missionId, root); await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(path.join(dir, 'events.jsonl'), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return record;
}

async function readEvents(missionId, root = DEFAULT_STATE_ROOT) {
  try { return (await fs.readFile(path.join(stateDirectory(missionId, root), 'events.jsonl'), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return []; throw error; }
}

async function transition(state, taskId, nextState, details = {}, root = DEFAULT_STATE_ROOT) {
  if (!TASK_STATES.has(nextState)) throw new Error(`invalid task state: ${nextState}`);
  const task = state.tasks[taskId]; if (!task) throw new Error(`unknown task: ${taskId}`);
  const previous = task.state; task.state = nextState; task.lastEventId = id('evt'); state.currentTaskId = taskId;
  const event = await appendEvent({ eventId: task.lastEventId, missionId: state.missionId, taskId, source: 'mission-runner', type: `task.${nextState}`, summary: details.summary || `${taskId} transitioned from ${previous} to ${nextState}.`, evidence: details.evidence || {} }, root);
  await saveState(state, root); return event;
}

module.exports = { DEFAULT_STATE_ROOT, STATE_SCHEMA_VERSION, atomicWrite, appendEvent, initialState, loadState, readEvents, saveState, stateDirectory, transition };
