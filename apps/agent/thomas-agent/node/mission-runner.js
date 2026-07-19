const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const AGENT_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(AGENT_ROOT, '..');
const DEFAULT_MISSIONS_DIR = path.join(AGENT_ROOT, 'missions');
const DEFAULT_STATE_DIR = process.env.THREEDVR_AGENT_MISSION_STATE_DIR || path.join(AGENT_ROOT, '.mission-state');
const STATE_SCHEMA_VERSION = 1;

function text(value) {
  return String(value || '').trim();
}

function timestamp(now = Date.now()) {
  return new Date(now).toISOString();
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    mission: '',
    repo: REPO_ROOT,
    missionsDir: DEFAULT_MISSIONS_DIR,
    stateDir: DEFAULT_STATE_DIR,
    execute: false,
    delegate: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--execute') options.execute = true;
    else if (arg === '--delegate') options.delegate = true;
    else if (arg === '--repo') options.repo = argv[++index] || options.repo;
    else if (arg === '--missions-dir') options.missionsDir = argv[++index] || options.missionsDir;
    else if (arg === '--state-dir') options.stateDir = argv[++index] || options.stateDir;
    else if (arg === '--json') options.json = true;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!options.mission) options.mission = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.help && !options.mission) {
    throw new Error('Usage: 3dvr mission run <mission-id> [--execute] [--delegate]');
  }
  options.repo = path.resolve(options.repo);
  options.missionsDir = path.resolve(options.missionsDir);
  options.stateDir = path.resolve(options.stateDir);
  return options;
}

function initialState(missionId) {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    mission: missionId,
    status: 'ready',
    completedTasks: [],
    evidence: [],
    lastRun: null,
    blockedTask: null,
  };
}

function validateMission(mission) {
  const errors = [];
  if (!mission || typeof mission !== 'object') return ['mission must be an object'];
  if (mission.schemaVersion !== 1) errors.push('mission schemaVersion must be 1');
  if (!text(mission.id)) errors.push('mission id is required');
  if (!text(mission.branch)) errors.push('mission branch is required');
  if (!Array.isArray(mission.tasks) || mission.tasks.length === 0) errors.push('mission tasks are required');
  const ids = new Set();
  for (const task of mission.tasks || []) {
    if (!text(task.id)) errors.push('every task needs an id');
    if (ids.has(task.id)) errors.push(`duplicate task id: ${task.id}`);
    ids.add(task.id);
    for (const dependency of task.dependsOn || []) {
      if (dependency === task.id) errors.push(`task depends on itself: ${task.id}`);
    }
  }
  for (const task of mission.tasks || []) {
    for (const dependency of task.dependsOn || []) {
      if (!ids.has(dependency)) errors.push(`unknown dependency ${dependency} for ${task.id}`);
    }
  }
  return errors;
}

async function loadMission(missionId, missionsDir = DEFAULT_MISSIONS_DIR) {
  const filePath = path.join(missionsDir, `${missionId}.json`);
  const mission = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const errors = validateMission(mission);
  if (errors.length) throw new Error(errors.join('; '));
  return mission;
}

async function readState(statePath, missionId) {
  try {
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    if (state.schemaVersion > STATE_SCHEMA_VERSION) {
      throw new Error(`state schemaVersion ${state.schemaVersion} is newer than supported version ${STATE_SCHEMA_VERSION}; refusing to overwrite it`);
    }
    if (state.schemaVersion !== STATE_SCHEMA_VERSION) return initialState(missionId);
    return {
      ...initialState(missionId),
      ...state,
      mission: missionId,
      completedTasks: Array.isArray(state.completedTasks) ? state.completedTasks : [],
      evidence: Array.isArray(state.evidence) ? state.evidence : [],
    };
  } catch (error) {
    if (error.message.includes('newer than supported')) throw error;
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return initialState(missionId);
    throw error;
  }
}

function selectNextTask(mission, state) {
  const completed = new Set(state.completedTasks || []);
  return mission.tasks.find(task => !completed.has(task.id) && (task.dependsOn || []).every(id => completed.has(id))) || null;
}

function commandText(command) {
  return command.map(value => JSON.stringify(value)).join(' ');
}

function runCommand(command, cwd, spawnImpl = spawn) {
  return new Promise(resolve => {
    const child = spawnImpl(command[0], command.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function parseWorktrees(output) {
  return output.split(/\n\n+/).filter(Boolean).map(block => {
    const lines = block.split('\n');
    return {
      path: lines.find(line => line.startsWith('worktree '))?.slice(9) || '',
      branch: lines.find(line => line.startsWith('branch '))?.slice(7).replace(/^refs\/heads\//, '') || '',
    };
  }).filter(item => item.path);
}

async function resolveWorktree(mission, options, commandRunner = runCommand) {
  const listed = await commandRunner(['git', 'worktree', 'list', '--porcelain'], options.repo);
  const existing = parseWorktrees(listed.stdout).find(item => item.branch === mission.branch);
  if (existing) return { ...existing, created: false };
  const target = path.resolve(options.repo, mission.worktreePath || `.agent-worktrees/${mission.id}`);
  if (!options.execute) return { path: '', branch: mission.branch, target, created: false };
  const result = await commandRunner(['git', 'worktree', 'add', '-b', mission.branch, target, `origin/${mission.baseBranch || 'main'}`], options.repo);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `unable to create mission worktree at ${target}`);
  return { path: target, branch: mission.branch, target, created: true };
}

async function gitStatus(worktree, commandRunner) {
  const result = await commandRunner(['git', 'status', '--porcelain=v1', '-b'], worktree);
  const lines = result.stdout.trimEnd().split('\n');
  return {
    ...result,
    branchLine: lines[0] || '',
    dirty: lines.slice(1).some(Boolean),
  };
}

async function writeStateAndStatus(state, mission, task, options, branchLine, note) {
  await fs.mkdir(options.stateDir, { recursive: true });
  const statePath = path.join(options.stateDir, `${mission.id}.json`);
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const status = [
    '# Agent Mission Status', '',
    `- Mission: ${mission.id}`,
    `- Last run: ${state.lastRun || 'never'}`,
    `- Branch: ${branchLine || 'unknown'}`,
    `- Status: ${state.status}`,
    `- Selected task: ${task?.id || 'none'}`,
    `- Completed tasks: ${state.completedTasks.join(', ') || 'none'}`,
    `- Next action: ${note || task?.title || 'none'}`,
    '',
    'Operational evidence only. Do not place secrets or personal user content here.', '',
  ].join('\n');
  await fs.writeFile(path.join(options.stateDir, 'LIVE_STATUS.md'), status);
}

async function appendEvidence(state, options, event) {
  state.evidence.push({ at: timestamp(), ...event });
  await fs.mkdir(options.stateDir, { recursive: true });
  await fs.appendFile(path.join(options.stateDir, 'MISSION_LOG.jsonl'), `${JSON.stringify(event)}\n`);
}

async function runMission(argv = process.argv.slice(2), hooks = {}) {
  const options = { ...parseArgs(argv), ...hooks.options };
  if (options.help) return { ok: true, help: true };
  const mission = await loadMission(options.mission, options.missionsDir);
  const statePath = path.join(options.stateDir, `${mission.id}.json`);
  const state = await readState(statePath, mission.id);
  const commandRunner = hooks.runCommand || ((command, cwd) => runCommand(command, cwd, hooks.spawnImpl));
  const worktree = await resolveWorktree(mission, options, commandRunner);
  if (!worktree.path) {
    state.status = 'blocked';
    state.blockedTask = selectNextTask(mission, state)?.id || null;
    state.lastRun = timestamp();
    await appendEvidence(state, options, { event: 'worktree-unavailable', target: worktree.target });
    await writeStateAndStatus(state, mission, selectNextTask(mission, state), options, 'controller worktree', `run with --execute to create ${worktree.target}`);
    return { ok: true, status: state.status, reason: 'worktree-unavailable', target: worktree.target };
  }

  const status = await gitStatus(worktree.path, commandRunner);
  const task = selectNextTask(mission, state);
  const branchName = status.branchLine.replace(/^##\s+/, '').split(/[.\s]/)[0];
  if (status.code !== 0 || status.dirty || branchName !== mission.branch) {
    state.status = 'blocked';
    state.blockedTask = task?.id || null;
    state.lastRun = timestamp();
    const reason = status.code !== 0 ? 'git-status-failed' : status.dirty ? 'worktree-dirty' : 'wrong-branch';
    await appendEvidence(state, options, { event: 'blocked', reason, branchLine: status.branchLine });
    await writeStateAndStatus(state, mission, task, options, status.branchLine, reason === 'worktree-dirty' ? 'clean the mission worktree' : `expected branch ${mission.branch}`);
    return { ok: false, status: state.status, reason, branchLine: status.branchLine };
  }
  if (!task) {
    state.status = 'complete';
    state.lastRun = timestamp();
    await appendEvidence(state, options, { event: 'mission-complete' });
    await writeStateAndStatus(state, mission, null, options, status.branchLine, 'mission complete');
    return { ok: true, status: state.status };
  }
  if (task.requiresApproval?.length) {
    state.status = 'waiting_for_approval';
    state.blockedTask = task.id;
    state.lastRun = timestamp();
    await appendEvidence(state, options, { event: 'approval-required', task: task.id, gates: task.requiresApproval });
    await writeStateAndStatus(state, mission, task, options, status.branchLine, `human approval required: ${task.requiresApproval.join(', ')}`);
    return { ok: true, status: state.status, task: task.id, gates: task.requiresApproval };
  }
  if (!options.execute) {
    state.status = 'ready';
    state.blockedTask = task.id;
    state.lastRun = timestamp();
    await writeStateAndStatus(state, mission, task, options, status.branchLine, `inspect-only; run with --execute to run ${task.id}`);
    return { ok: true, status: 'inspect_only', task: task.id, checks: task.checks || [] };
  }

  if (options.delegate && task.prompt) {
    const delegate = hooks.runAgentTask || require('./task-orchestrator').runAgentTask;
    const result = await delegate(['--backend', 'codex', '--execute', '--repo', worktree.path, '--no-print-prompt', task.prompt], hooks.delegateHooks || {});
    await appendEvidence(state, options, { event: 'delegated', task: task.id, ok: Boolean(result.ok), backend: result.backend || 'codex' });
    if (!result.ok) {
      state.status = 'blocked';
      state.blockedTask = task.id;
      state.lastRun = timestamp();
      await writeStateAndStatus(state, mission, task, options, status.branchLine, 'review delegated-task failure');
      return { ok: false, status: state.status, task: task.id, reason: 'delegation-failed', result };
    }
  }

  for (const command of task.checks || []) {
    const result = await commandRunner(command, worktree.path);
    await appendEvidence(state, options, { event: 'check', task: task.id, command, code: result.code });
    if (result.code !== 0) {
      state.status = 'blocked';
      state.blockedTask = task.id;
      state.lastRun = timestamp();
      await writeStateAndStatus(state, mission, task, options, status.branchLine, `fix failed check: ${commandText(command)}`);
      return { ok: false, status: state.status, task: task.id, command, code: result.code };
    }
  }
  state.completedTasks = [...new Set([...state.completedTasks, task.id])];
  state.status = 'ready';
  state.blockedTask = null;
  state.lastRun = timestamp();
  await appendEvidence(state, options, { event: 'task-complete', task: task.id });
  await writeStateAndStatus(state, mission, selectNextTask(mission, state), options, status.branchLine, 'continue to the next unblocked task');
  return { ok: true, status: state.status, completedTask: task.id, nextTask: selectNextTask(mission, state)?.id || null };
}

function usage() {
  console.log('Usage: 3dvr mission run <mission-id> [--execute] [--delegate] [--json]');
}

if (require.main === module) {
  runMission().then(result => {
    if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else if (result.help) usage();
    else console.log(`${String(result.status || 'done').toUpperCase()}${result.task ? `: ${result.task}` : ''}`);
  }).catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  AGENT_ROOT,
  DEFAULT_STATE_DIR,
  STATE_SCHEMA_VERSION,
  appendEvidence,
  commandText,
  initialState,
  loadMission,
  parseArgs,
  parseWorktrees,
  readState,
  resolveWorktree,
  runCommand,
  runMission,
  selectNextTask,
  validateMission,
};
