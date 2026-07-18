import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadMission, validateMission } from './validate-mission.mjs';

const repo = path.resolve(new URL('../..', import.meta.url).pathname);
const stateDir = path.join(repo, '.agent-state');
const logPath = path.join(stateDir, 'MISSION_LOG.jsonl');

function parseArgs(argv) {
  const options = { mission: '', execute: false, delegate: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--execute') options.execute = true;
    else if (arg === '--delegate') options.delegate = argv[++index] || '';
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!options.mission) options.mission = arg;
  }
  if (!options.mission) throw new Error('Usage: npm run agent:mission -- <mission-id> [--execute] [--delegate codex]');
  return options;
}

function commandText(command) {
  return command.map(value => JSON.stringify(value)).join(' ');
}

function runCommand(command, cwd) {
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

async function readState(filePath, missionId) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return { schemaVersion: 1, mission: missionId, status: 'ready', completedTasks: [], evidence: [] };
  }
}

function selectTask(mission, state) {
  return mission.tasks.find(task =>
    !state.completedTasks.includes(task.id) &&
    (task.dependsOn || []).every(dependency => state.completedTasks.includes(dependency))
  );
}

function timestamp() { return new Date().toISOString(); }

async function writeLiveStatus({ mission, state, branchLine, task, status, note = '' }) {
  const lines = [
    '# Agent Mission Status',
    '',
    `- Mission: ${mission.id}`,
    `- Last run: ${state.lastRun || timestamp()}`,
    `- Branch: ${branchLine || 'unknown'}`,
    `- Selected task: ${task?.id || 'none'}`,
    `- Status: ${status}`,
    `- Completed tasks: ${(state.completedTasks || []).join(', ') || 'none'}`,
    `- Next action: ${note || task?.title || 'none'}`,
    '',
    'This file contains operational status only. Do not put secrets or personal life content here.',
    ''
  ];
  await writeFile(path.join(stateDir, 'LIVE_STATUS.md'), lines.join('\n'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const missionPath = path.join(repo, 'docs/agent/missions', `${options.mission}.yaml`);
  const statePath = path.join(stateDir, `${options.mission}.json`);
  const mission = await loadMission(missionPath);
  const errors = validateMission(mission);
  if (errors.length) throw new Error(errors.join('; '));
  const state = await readState(statePath, mission.id);
  const status = await runCommand(['git', 'status', '--porcelain=v1', '-b'], repo);
  const branchLine = status.stdout.split('\n')[0] || '';
  const branchName = branchLine.replace(/^##\s+/, '').split(/[.\s]/)[0] || '';
  const dirty = status.stdout.split('\n').slice(1).some(Boolean);
  const task = selectTask(mission, state);
  const evidence = { at: timestamp(), branch: branchLine, branchName, dirty, task: task?.id || null };

  if (mission.repository && mission.pullRequests?.length) {
    const github = await runCommand(['node', 'scripts/agent/inspect-github.mjs', mission.id], repo);
    if (github.code === 0) console.log(`GITHUB:\n${github.stdout.trim()}`);
    else console.log(`GITHUB INSPECTION UNAVAILABLE: ${github.stderr.trim() || 'gh returned a non-zero status'}`);
  }

  if (dirty || (mission.branch && branchName !== mission.branch)) {
    state.status = 'blocked';
    state.blockedTask = task?.id || null;
    state.lastRun = evidence.at;
    const reason = dirty ? 'worktree-dirty' : 'wrong-branch';
    state.evidence = [...(state.evidence || []), { ...evidence, reason }];
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
    await appendFile(logPath, `${JSON.stringify({ event: 'blocked', mission: mission.id, ...evidence, reason })}\n`);
    const note = dirty ? 'create or reuse a clean worktree' : `switch to expected branch ${mission.branch}`;
    await writeLiveStatus({ mission, state, branchLine, task, status: 'blocked', note });
    console.log(`BLOCKED: ${dirty ? `worktree is dirty (${branchLine})` : `expected branch ${mission.branch}, found ${branchName || 'detached HEAD'}`}. No task was executed.`);
    return;
  }
  if (!task) {
    state.status = 'complete';
    state.lastRun = evidence.at;
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
    await writeLiveStatus({ mission, state, branchLine, task: null, status: 'complete' });
    console.log(`COMPLETE: ${mission.id}`);
    return;
  }
  if (task.requiresApproval?.length) {
    state.status = 'waiting_for_approval';
    state.blockedTask = task.id;
    state.lastRun = evidence.at;
    state.evidence = [...(state.evidence || []), { ...evidence, reason: 'approval-required', gates: task.requiresApproval }];
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
    await appendFile(logPath, `${JSON.stringify({ event: 'waiting_for_approval', mission: mission.id, ...evidence, gates: task.requiresApproval })}\n`);
    await writeLiveStatus({ mission, state, branchLine, task, status: 'waiting_for_approval', note: `human approval required: ${task.requiresApproval.join(', ')}` });
    console.log(`WAITING: ${task.title}\nApproval gates: ${task.requiresApproval.join(', ')}`);
    return;
  }

  console.log(`NEXT: ${task.title}`);
  console.log(`Branch: ${branchLine}`);
  console.log(`Checks: ${(task.checks || []).map(commandText).join(' ; ') || 'none'}`);
  if (options.delegate) {
    if (options.delegate !== 'codex') throw new Error(`Unsupported delegate: ${options.delegate}`);
    console.log('DELEGATION: Codex should receive this task only after human authorization.');
  }
  if (!options.execute) {
    console.log('INSPECT-ONLY: pass --execute to run declared checks.');
    return;
  }
  for (const command of task.checks || []) {
    const result = await runCommand(command, repo);
    state.evidence = [...(state.evidence || []), { ...evidence, command, code: result.code }];
    console.log(`${result.code === 0 ? 'PASS' : 'FAIL'} ${commandText(command)}`);
    if (result.code !== 0) {
      state.status = 'blocked';
      state.blockedTask = task.id;
      state.lastRun = evidence.at;
      await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
      await appendFile(logPath, `${JSON.stringify({ event: 'check-failed', mission: mission.id, task: task.id, command, code: result.code })}\n`);
      await writeLiveStatus({ mission, state, branchLine, task, status: 'blocked', note: `fix failed check: ${commandText(command)}` });
      return;
    }
  }
  state.completedTasks = [...new Set([...(state.completedTasks || []), task.id])];
  state.status = 'ready';
  state.blockedTask = null;
  state.lastRun = evidence.at;
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await appendFile(logPath, `${JSON.stringify({ event: 'task-complete', mission: mission.id, task: task.id, ...evidence })}\n`);
  await writeLiveStatus({ mission, state, branchLine, task, status: 'ready', note: options.execute ? 'continuing to the next unblocked task' : 'run with --execute to continue' });
  console.log(`RECORDED: ${task.id}`);
  if (options.execute) await main();
}

await main().catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
