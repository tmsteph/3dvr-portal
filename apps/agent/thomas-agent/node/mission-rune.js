const { validateMission } = require('./mission-schema');

const MISSION_KEYS = new Map([
  ['repository', 'repository'],
  ['branch', 'defaultBranch'],
  ['default_branch', 'defaultBranch'],
  ['objective', 'objective'],
  ['approval_policy', 'approvalPolicy']
]);

const TASK_KEYS = new Map([
  ['objective', 'objective'],
  ['backend', 'backend'],
  ['risk', 'riskClass'],
  ['risk_class', 'riskClass'],
  ['model', 'modelTier'],
  ['model_tier', 'modelTier'],
  ['worktree', 'worktree']
]);

function runeError(lineNumber, message) {
  const error = new Error(`RUNE line ${lineNumber}: ${message}`);
  error.code = 'RUNE_PARSE_ERROR';
  return error;
}

function parseScalar(raw, lineNumber) {
  const value = raw.trim();
  if (!value) throw runeError(lineNumber, 'missing value');
  if (value.startsWith('"')) {
    try { return JSON.parse(value); } catch { throw runeError(lineNumber, 'invalid quoted string'); }
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  return value;
}

function splitList(raw, lineNumber) {
  const value = raw.trim();
  if (!value.startsWith('[') || !value.endsWith(']')) throw runeError(lineNumber, 'expected a list in [brackets]');
  const body = value.slice(1, -1).trim();
  if (!body) return [];
  const items = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const char of body) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quoted) {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      current += char;
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      items.push(parseScalar(current, lineNumber));
      current = '';
      continue;
    }
    current += char;
  }
  if (quoted) throw runeError(lineNumber, 'unterminated quoted value');
  items.push(parseScalar(current, lineNumber));
  return items;
}

function stringList(raw, lineNumber, key) {
  const values = splitList(raw, lineNumber);
  if (values.some(value => typeof value !== 'string' || !value.trim())) throw runeError(lineNumber, `${key} must contain only strings`);
  return values;
}

function defaultTask(id) {
  return {
    id,
    objective: '',
    dependsOn: [],
    status: 'queued',
    riskClass: 'read_only',
    modelTier: 'review',
    backend: 'deterministic',
    worktree: false,
    allowedFiles: [],
    commands: [],
    acceptanceTests: [],
    evidenceRequired: [],
    approvalGate: null,
    retryPolicy: { maxAttempts: 1 }
  };
}

function setMissionField(mission, key, raw, lineNumber) {
  const target = MISSION_KEYS.get(key);
  if (!target) throw runeError(lineNumber, `unknown mission field: ${key}`);
  const value = parseScalar(raw, lineNumber);
  if (typeof value !== 'string') throw runeError(lineNumber, `${key} must be text`);
  mission[target] = value;
}

function setTaskField(task, key, raw, lineNumber) {
  if (TASK_KEYS.has(key)) {
    const target = TASK_KEYS.get(key);
    const value = parseScalar(raw, lineNumber);
    if (target === 'worktree') {
      if (typeof value !== 'boolean') throw runeError(lineNumber, 'worktree must be true or false');
    } else if (typeof value !== 'string') {
      throw runeError(lineNumber, `${key} must be text`);
    }
    task[target] = value;
    return;
  }
  if (key === 'depends') {
    task.dependsOn = stringList(raw, lineNumber, key);
    return;
  }
  if (key === 'files') {
    task.allowedFiles = stringList(raw, lineNumber, key);
    return;
  }
  if (key === 'command') {
    const command = stringList(raw, lineNumber, key);
    if (!command.length) throw runeError(lineNumber, 'command cannot be empty');
    task.commands.push(command);
    return;
  }
  if (key === 'accept') {
    const value = parseScalar(raw, lineNumber);
    if (typeof value !== 'string') throw runeError(lineNumber, 'accept must be text');
    task.acceptanceTests.push(value);
    return;
  }
  if (key === 'evidence') {
    const value = parseScalar(raw, lineNumber);
    if (typeof value !== 'string') throw runeError(lineNumber, 'evidence must be text');
    task.evidenceRequired.push(value);
    return;
  }
  if (key === 'retries') {
    const value = parseScalar(raw, lineNumber);
    if (!Number.isInteger(value) || value < 1) throw runeError(lineNumber, 'retries must be an integer of 1 or more');
    task.retryPolicy.maxAttempts = value;
    return;
  }
  if (key === 'gate') {
    const values = stringList(raw, lineNumber, key);
    if (values.length !== 2) throw runeError(lineNumber, 'gate must be [action, target]');
    task.approvalGate = { action: values[0], target: values[1] };
    return;
  }
  throw runeError(lineNumber, `unknown task field: ${key}`);
}

function compileRune(source, options = {}) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  let mission = null;
  let currentTask = null;
  let missionClosed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const missionStart = line.match(/^mission\s+([A-Za-z0-9._-]+)\s*\{$/);
    if (missionStart) {
      if (mission) throw runeError(lineNumber, 'only one mission is allowed per file');
      mission = {
        schemaVersion: 1,
        missionId: missionStart[1],
        repository: '',
        defaultBranch: 'main',
        objective: '',
        approvalPolicy: 'Pause before consequential external writes, money, credentials, destructive actions, or production deployment.',
        tasks: []
      };
      continue;
    }

    const taskStart = line.match(/^task\s+([A-Za-z0-9._-]+)\s*\{$/);
    if (taskStart) {
      if (!mission || missionClosed) throw runeError(lineNumber, 'task must be inside a mission');
      if (currentTask) throw runeError(lineNumber, 'nested tasks are not supported');
      currentTask = defaultTask(taskStart[1]);
      continue;
    }

    if (line === '}') {
      if (currentTask) {
        mission.tasks.push(currentTask);
        currentTask = null;
      } else if (mission && !missionClosed) {
        missionClosed = true;
      } else {
        throw runeError(lineNumber, 'unexpected closing brace');
      }
      continue;
    }

    if (!mission || missionClosed) throw runeError(lineNumber, 'expected mission NAME {');
    const field = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+)$/);
    if (!field) throw runeError(lineNumber, 'expected field: value');
    if (currentTask) setTaskField(currentTask, field[1], field[2], lineNumber);
    else setMissionField(mission, field[1], field[2], lineNumber);
  }

  if (!mission) throw runeError(1, 'missing mission declaration');
  if (currentTask) throw runeError(lines.length, `task ${currentTask.id} is missing a closing brace`);
  if (!missionClosed) throw runeError(lines.length, `mission ${mission.missionId} is missing a closing brace`);

  const errors = validateMission(mission);
  if (errors.length) {
    const sourceName = options.sourceName ? ` in ${options.sourceName}` : '';
    throw new Error(`Invalid RUNE mission${sourceName}: ${errors.join('; ')}`);
  }
  return mission;
}

module.exports = { compileRune, parseScalar, splitList };
