#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { validateMission } = require('./mission-schema');
const { DEFAULT_STATE_ROOT, appendEvent, initialState, loadState, readEvents, saveState, transition } = require('./mission-store');
const { approve: approveRecord, createApproval } = require('./mission-approvals');
const { nextTask, plan, retryAllowed } = require('./mission-planner');
const { renderStatus, writeStatus } = require('./mission-status');
const { workerResult } = require('./mission-evidence');
const { inspectRepository } = require('./mission-git');
const { inspectPullRequest } = require('./mission-github');

const ROOT = path.resolve(__dirname, '..', '..');
const REPOSITORY_ROOT = path.resolve(ROOT, '..', '..');
const MISSIONS = path.join(ROOT, 'missions');

function parseArgs(argv = process.argv.slice(2)) {
  const options = { command: 'run', missionId: '', execute: false, simulate: false, delegate: false, json: false, stateRoot: process.env.THREEDVR_MISSION_STATE_ROOT || DEFAULT_STATE_ROOT, repo: REPOSITORY_ROOT, task: '', approvalId: '', headSha: '' };
  const values = [...argv];
  if (['run','resume','validate','status','pause','cancel','approve','reject','events'].includes(values[0])) options.command = values.shift();
  options.missionId = values.shift() || '';
  for (let i = 0; i < values.length; i += 1) {
    const arg = values[i];
    if (arg === '--execute') options.execute = true;
    else if (arg === '--simulate') options.simulate = true;
    else if (arg === '--delegate') options.delegate = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--state-root') options.stateRoot = values[++i] || options.stateRoot;
    else if (arg === '--repo') options.repo = values[++i] || options.repo;
    else if (arg === '--approval') options.approvalId = values[++i] || '';
    else if (arg === '--head-sha') options.headSha = values[++i] || '';
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else options.task = options.task ? `${options.task} ${arg}` : arg;
  }
  if (!options.missionId) throw new Error('Usage: 3dvr mission <validate|status|run|resume|pause|cancel|approve|reject|events> <mission-id>');
  options.stateRoot = path.resolve(options.stateRoot); options.repo = path.resolve(options.repo);
  return options;
}

async function loadMission(missionId, missionsDir = MISSIONS) {
  const mission = JSON.parse(await fs.readFile(path.join(missionsDir, `${missionId}.json`), 'utf8'));
  const errors = validateMission(mission); if (errors.length) throw new Error(errors.join('; '));
  return mission;
}

function commandText(command) { return command.map(value => JSON.stringify(value)).join(' '); }
function runCommand(command, cwd) {
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env }); let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` })); child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

async function ensureWorktree(mission, options) {
  if (!mission.tasks.some(task => task.worktree)) return options.repo;
  const inspection = await runCommand(['git', 'worktree', 'list', '--porcelain'], options.repo);
  const blocks = inspection.stdout.split(/\n\n+/).filter(Boolean);
  const existing = blocks.find(block => block.includes(`branch refs/heads/${mission.branch || ''}`));
  if (existing) return existing.split('\n').find(line => line.startsWith('worktree ')).slice(9);
  if (!options.execute) return options.repo;
  const target = path.join(options.repo, '.agent-worktrees', mission.missionId); await fs.mkdir(path.dirname(target), { recursive: true });
  const result = await runCommand(['git', 'worktree', 'add', target, `origin/${mission.defaultBranch}`], options.repo);
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'unable to create isolated worktree');
  return target;
}

async function persist(mission, state, options) { const events = await readEvents(mission.missionId, options.stateRoot); await saveState(state, options.stateRoot); await writeStatus(mission, state, events, options.stateRoot); return events; }
async function record(mission, state, options, taskId, type, summary, evidence = {}) { await appendEvent({ missionId: mission.missionId, taskId, source: 'mission-runner', type, severity: 'info', summary, evidence }, options.stateRoot); return persist(mission, state, options); }

async function completeTask(mission, state, task, options, evidence) {
  state.state = 'running';
  await transition(state, task.id, 'running', { summary: `${task.id} started.` }, options.stateRoot);
  await transition(state, task.id, 'validating', { summary: `${task.id} checks are running.` }, options.stateRoot);
  state.tasks[task.id].evidence = workerResult({ taskId: task.id, status: 'completed', ...evidence });
  await transition(state, task.id, 'completed', { summary: evidence.summary || `${task.id} completed.`, evidence: state.tasks[task.id].evidence }, options.stateRoot);
  state.state = 'ready'; state.currentTaskId = null; await persist(mission, state, options);
}

async function runOne(mission, state, options, hooks = {}) {
  const selection = plan(mission, state); const task = selection.task;
  if (selection.complete) { state.state = 'completed'; await record(mission, state, options, null, 'mission.completed', 'Mission completed.', {}); return { status: 'completed' }; }
  if (!task) { state.state = 'blocked'; state.blockers = selection.blocked.map(item => `${item.id} depends on a failed or cancelled task`); await record(mission, state, options, null, 'mission.blocked', 'Mission is blocked by unresolved dependencies.', { blockers: state.blockers }); return { status: 'blocked', blockers: state.blockers }; }
  state.currentTaskId = task.id;
  if (!options.execute) { state.state = 'ready'; state.tasks[task.id].state = 'ready'; await record(mission, state, options, task.id, 'task.ready', `Next unblocked task: ${task.id}. Inspect-only mode did not execute it.`, { taskId: task.id }); return { status: 'ready', taskId: task.id, checks: task.commands }; }
  if (task.id === 'merge-daily-direction-privacy' && options.execute) {
    try {
      const pr = await inspectPullRequest(mission.repository, 1169, options.repo);
      if (pr.state === 'MERGED') { await completeTask(mission, state, task, options, { summary: 'PR #1169 is already merged; no merge was repeated.', observations: ['satisfied from GitHub evidence'], pullRequest: { number: 1169, state: pr.state, headSha: pr.headRefOid } }); return { status: 'ready', completedTask: task.id, nextTask: nextTask(mission, state)?.id || null }; }
    } catch (error) { state.blockers = ['GitHub inspection unavailable; privacy merge was not repeated']; await record(mission, state, options, task.id, 'task.blocked', 'Could not verify the existing privacy merge.', { error: error.message }); return { status: 'blocked', taskId: task.id, reason: 'github-inspection-failed' }; }
  }
  if (task.approvalGate) {
    state.state = 'awaiting_approval'; state.tasks[task.id].state = 'awaiting_approval';
    if (!state.approvals.some(item => item.taskId === task.id && item.status === 'required')) state.approvals.push(createApproval(mission.missionId, task.id, task.approvalGate, options.headSha || 'unknown'));
    await record(mission, state, options, task.id, 'task.awaiting_approval', `Approval required before ${task.approvalGate.action} on ${task.approvalGate.target}.`, { approval: state.approvals.find(item => item.taskId === task.id) });
    return { status: 'awaiting_approval', taskId: task.id, approval: state.approvals.find(item => item.taskId === task.id) };
  }
  const worktree = await ensureWorktree(mission, options); const repoState = await inspectRepository(worktree);
  if (!repoState.clean) { state.state = 'blocked'; state.blockers = ['mission worktree is dirty']; await record(mission, state, options, task.id, 'task.blocked', 'Mission worktree is dirty; no files were touched.', { branch: repoState.branch }); return { status: 'blocked', reason: 'dirty-worktree' }; }
  state.tasks[task.id].attempts += 1; const checks = [];
  for (const command of task.commands) { const result = await runCommand(command, worktree); checks.push({ command, code: result.code }); if (result.code !== 0) { const retry = retryAllowed(task, state); state.state = retry ? 'ready' : 'failed'; state.tasks[task.id].state = retry ? 'ready' : 'failed'; await record(mission, state, options, task.id, retry ? 'task.retryable_failure' : 'task.failed', `${retry ? 'Retryable' : 'Terminal'} failure: ${commandText(command)}`, { checks, attempts: state.tasks[task.id].attempts, maxAttempts: task.retryPolicy.maxAttempts }); return { status: state.state, taskId: task.id, checks, retry }; } }
  if (options.delegate && ['codex', 'openclaw'].includes(task.backend)) {
    const dispatch = hooks.runAgentTask || require('./task-orchestrator').runAgentTask;
    const result = await dispatch(['--backend', task.backend, '--execute', '--repo', worktree, '--no-print-prompt', task.objective]);
    await record(mission, state, options, task.id, 'worker.dispatched', `Bounded ${task.backend} dispatch completed with a worker result.`, { backend: task.backend, result: workerResult({ taskId: task.id, ...result }) });
    if (!result?.ok) { state.state = 'failed'; state.tasks[task.id].state = 'failed'; await persist(mission, state, options); return { status: 'failed', taskId: task.id, reason: 'worker-failed' }; }
  }
  await completeTask(mission, state, task, options, { summary: `${task.id} completed with declared checks.`, commandsRun: checks });
  return { status: 'ready', completedTask: task.id, nextTask: nextTask(mission, state)?.id || null };
}

async function simulate(mission, state, options) {
  const gate = mission.tasks.find(task => task.approvalGate?.target === 'tmsteph/3dvr-portal#1170');
  for (const task of mission.tasks) {
    if (task.id === gate.id) break;
    if (state.tasks[task.id].state !== 'completed') await completeTask(mission, state, task, options, { summary: `${task.id} simulated with fixture evidence.`, observations: ['fixture repository and GitHub state used; no network writes'] });
  }
  state.state = 'awaiting_approval'; state.currentTaskId = gate.id; state.tasks[gate.id].state = 'awaiting_approval'; state.approvals = [createApproval(mission.missionId, gate.id, gate.approvalGate, 'fixture-life-upgrade-head')];
  await record(mission, state, options, gate.id, 'task.awaiting_approval', 'Simulation stopped at the Life Upgrade merge approval gate.', { mode: 'simulate', networkWrites: false });
  return { status: state.state, stoppedAt: gate.id };
}

async function runMission(argv = process.argv.slice(2), hooks = {}) {
  const options = { ...parseArgs(argv), ...(hooks.options || {}) }; const mission = await loadMission(options.missionId, hooks.missionsDir || MISSIONS);
  let state = await loadState(mission, options.stateRoot);
  if (options.simulate) { state = initialState(mission); return simulate(mission, state, options); }
  if (options.command === 'validate') return { status: 'valid', missionId: mission.missionId, taskCount: mission.tasks.length };
  if (options.command === 'events') return readEvents(mission.missionId, options.stateRoot);
  if (options.command === 'status') return { ...state, liveStatus: renderStatus(mission, state, await readEvents(mission.missionId, options.stateRoot)) };
  if (options.command === 'pause' || options.command === 'cancel') { state.state = options.command === 'pause' ? 'blocked' : 'cancelled'; await record(mission, state, options, state.currentTaskId, `mission.${options.command}d`, `Mission ${options.command}d by operator.`, {}); return { status: state.state }; }
  if (options.command === 'approve' || options.command === 'reject') { const approval = state.approvals.find(item => item.approvalId === options.approvalId); if (!approval) throw new Error('approval id not found'); if (options.command === 'approve') Object.assign(approval, approveRecord(approval, options.headSha || (await inspectRepository(options.repo)).headSha)); else approval.status = 'rejected'; await record(mission, state, options, approval.taskId, `approval.${approval.status}`, `Approval ${approval.status}.`, { approval: { approvalId: approval.approvalId, action: approval.action, target: approval.target, headSha: approval.headSha } }); return { status: approval.status, approval }; }
  if (options.command === 'resume') options.execute = true;
  if (options.simulate) return simulate(mission, state, options);
  return runOne(mission, state, options, hooks);
}

if (require.main === module) runMission().then(result => { if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2)); else console.log(typeof result === 'string' ? result : `${String(result.status || 'done').toUpperCase()}${result.taskId ? `: ${result.taskId}` : ''}`); }).catch(error => { console.error(error.message || error); process.exitCode = 1; });

module.exports = { commandText, loadMission, parseArgs, runCommand, runMission };
