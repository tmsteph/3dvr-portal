const { mkdir, readFile, writeFile, rename } = require('node:fs/promises');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const execFileAsync = promisify(execFile);
const { runAgentTask, riskScanText } = require('./task-orchestrator');
const { authorizePortalOperatorTask } = require('./operator-forge-auth');

const DEFAULT_LIMIT = 5;
const DEFAULT_READ_TIMEOUT_MS = 1800;
const DEFAULT_RELAY_FLUSH_MS = 1200;
const EXECUTOR_BLOCKED_PATTERN = /\b(?:blocked by the execution environment|no side effects occurred|no file was edited|read-only file system|workspace is read-only|could not write)\b/i;
const EXECUTOR_APPROVAL_PATTERN = /\b(?:please confirm|confirm that i may|need (?:your )?confirmation|awaiting confirmation|if you approve|would you like me to)\b/i;
const GITHUB_WRITE_PATTERN = /\b(push|merge|pull request|open a pr|create a pr|commit(?: to github)?|github branch|push to github)\b/i;
const BLOCKED_EXTERNAL_WRITE_PATTERN = /\b(deploy|release|send|email|post|force[- ]?push|delete (?:the )?(?:repo|repository|branch|tag)|transfer (?:the )?(?:repo|repository)|repository settings|repo settings|secrets?|billing|reset\s+--hard)\b/i;
let defaultGun = null;

function normalizeText(value = '') {
  return String(value || '').trim();
}

function getDefaultGun() {
  if (!defaultGun) defaultGun = require('./gun-db').gun;
  return defaultGun;
}

function forgeRequestsNode(options = {}) {
  return options.rootNode || getDefaultGun().get('3dvr-portal').get('forge').get('editRequests');
}

function putGun(node, payload, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('operator forge write timeout'));
    }, timeoutMs);
    node.put(payload, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack?.err) reject(new Error(ack.err));
      else resolve(ack || {});
    });
  });
}

function listForgeRequests(options = {}) {
  const node = forgeRequestsNode(options);
  const timeoutMs = options.timeoutMs || DEFAULT_READ_TIMEOUT_MS;
  return new Promise(resolve => {
    const rows = new Map();
    const timer = setTimeout(() => {
      resolve([...rows.values()].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
    }, timeoutMs);
    node.map().once((data, key) => {
      if (data && data.id) rows.set(key, data);
    });
    if (options.rootNode) {
      clearTimeout(timer);
      resolve([...rows.values()].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
    }
  });
}

async function updateForgeRequest(id, patch, options = {}) {
  const node = forgeRequestsNode(options).get(id);
  await putGun(node, {
    ...patch,
    id,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  }, options.writeTimeoutMs);
}

function executorNeedsApproval(result = {}) {
  if (!result?.ok) return false;
  const text = normalizeText(result?.reason || result?.result?.stdout || result?.result?.stderr);
  return EXECUTOR_APPROVAL_PATTERN.test(text);
}

function executorExecutionBlocked(result = {}) {
  if (!result?.ok) return false;
  const text = normalizeText(result?.reason || result?.result?.stdout || result?.result?.stderr);
  return EXECUTOR_BLOCKED_PATTERN.test(text);
}

function editOnlyTask(record = {}, auth = {}) {
  const task = normalizeText(record.task);
  if (!task) return { ok: false, reason: 'missing code edit request' };
  // Classify the signed user request separately from the fixed browser wrapper.
  // Execution still receives the original task and all of its restrictions.
  const marker = ' Make the smallest useful change in the working repository and run focused tests.';
  const end = task.lastIndexOf(marker);
  const requested = task.startsWith('Operator code request: ') && end >= 0 ? task.slice(0, end) : task;
  const intent = riskScanText(requested.replaceAll('Claim a working live link only after checking that URL; do not deploy without authorization.', '').replaceAll('Avoid production behavior, secrets, and configuration.', ''));
  if (BLOCKED_EXTERNAL_WRITE_PATTERN.test(intent)) {
    return { ok: false, reason: 'that external or destructive action still requires a separate protected path' };
  }
  const requestedGithubWrite = GITHUB_WRITE_PATTERN.test(intent);
  if (requestedGithubWrite && !record.githubWriteRequested) {
    return { ok: false, reason: 'the signed request did not authorize GitHub writes' };
  }
  const githubWrite = Boolean(record.githubWriteRequested && requestedGithubWrite);
  if (githubWrite && (auth.role !== 'owner' || auth.githubWriteApproved !== true)) {
    return { ok: false, reason: 'owner authorization is required for GitHub writes' };
  }
  return { ok: true, task, githubWrite };
}


async function reserveExecution(record, options) {
  const env = options.env || process.env;
  const directory = options.stateDir || env.THREEDVR_OPERATOR_FORGE_STATE_DIR;
  if (!directory) return {};
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const key = createHash('sha256').update(record.authPub + ':' + record.id).digest('hex');
  const fingerprint = createHash('sha256').update(JSON.stringify({
    task: record.task, repo: record.repo, pub: record.authPub,
    githubWriteRequested: Boolean(record.githubWriteRequested)
  })).digest('hex');
  const file = path.join(directory, key + '.json');
  try {
    await writeFile(file, JSON.stringify({ fingerprint, pending: true }), { flag: 'wx', mode: 0o600 });
    return { file, fingerprint };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(await readFile(file, 'utf8'));
    if (previous.fingerprint !== fingerprint) throw new Error('Forge task identity conflicts with its execution receipt.');
    return { file, fingerprint, previous };
  }
}

async function isolatedRepo(record, auth, options) {
  const directory = options.worktreeRoot || (options.env || process.env).THREEDVR_OPERATOR_FORGE_WORKTREE_ROOT;
  if (!directory) return auth.repoPath;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const key = createHash('sha256').update(record.authPub + ':' + record.id).digest('hex').slice(0,24);
  const repo = path.join(directory, key);
  const { stdout } = await execFileAsync('git', ['-C', auth.repoPath, 'rev-parse', '--show-toplevel'], { timeout: 10000 });
  const relative = path.relative(stdout.trim(), auth.repoPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Selected package is outside its Git repository.');
  // Never mutate the shared service/source checkout or reuse an uncertain workspace.
  await execFileAsync('git', ['-C', auth.repoPath, 'fetch', 'origin', 'main'], { timeout: 30000 });
  await execFileAsync('git', ['-C', auth.repoPath, 'worktree', 'add', '-b', 'forge/' + key, repo, 'origin/main'], { timeout: 30000 });
  return path.join(repo, relative);
}

async function runForgeRequest(record, options = {}) {
  const auth = await authorizePortalOperatorTask(record, {
    env: options.env || process.env,
    verifyImpl: options.verifyImpl,
    now: options.now,
    maxAgeMs: options.maxAgeMs,
  });
  if (!auth.ok) {
    await updateForgeRequest(record.id, {
      status: 'rejected',
      error: auth.reason,
      resultSummary: auth.reason,
    }, options);
    return { ok: false, rejected: true, reason: auth.reason };
  }

  const after = options.signedAfter ?? (options.env || process.env).THREEDVR_OPERATOR_FORGE_SIGNED_AFTER;
  if (after !== undefined) {
    const cutoff = typeof after === 'number' ? after : Date.parse(after);
    if (!Number.isFinite(cutoff)) throw new Error('Invalid Forge admission cutoff.');
    if (!Number.isFinite(auth.issuedAt) || auth.issuedAt < cutoff) {
      return { ok: false, skipped: true, reason: 'Historical Forge request held for review.' };
    }
  }
  const edit = editOnlyTask(record, auth);
  if (!edit.ok) {
    await updateForgeRequest(record.id, {
      status: 'approval_required',
      error: edit.reason,
      resultSummary: edit.reason,
    }, options);
    return { ok: false, skipped: true, reason: edit.reason };
  }

  const reservation = await reserveExecution(record, options);
  if (reservation.previous) {
    if (reservation.previous.patch) {
      await updateForgeRequest(record.id, reservation.previous.patch, options);
      return { ok: reservation.previous.patch.status === 'completed', recovered: true };
    }
    await updateForgeRequest(record.id, {
      status: 'approval_required', error: 'Prior execution is uncertain; inspect its workspace before authorizing another attempt.',
      resultSummary: 'Prior execution is uncertain. This task was not replayed.'
    }, options);
    return { ok: false, skipped: true, reason: 'Prior execution is uncertain.' };
  }
  const finish = async patch => {
    if (reservation.file) {
      const temporary = reservation.file + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify({ fingerprint: reservation.fingerprint, patch }), { mode: 0o600 });
      await rename(temporary, reservation.file);
      reservation.finished = true;
    }
    await updateForgeRequest(record.id, patch, options);
  };
  await updateForgeRequest(record.id, {
    status: 'running',
    workerStartedAt: new Date().toISOString(),
    error: '',
  }, options);

  try {
    const repoPath = await isolatedRepo(record, auth, options);
    const runImpl = options.runAgentTaskImpl || runAgentTask;
    const args = [
      '--backend', (options.stateDir || (options.env || process.env).THREEDVR_OPERATOR_FORGE_STATE_DIR) ? 'codex' : record.backend || 'auto',
      '--execute',
      '--no-print-prompt',
      '--repo', repoPath,
    ];
    args.push('--unsafe');
    if (!edit.githubWrite) args.push('--workspace-write');
    args.push(edit.githubWrite
      ? `${edit.task} This exact GitHub write intent was cryptographically signed by the 3DVR owner. You may create a branch, commit, push, open a pull request, or merge only as explicitly requested. Do not deploy, release, force-push, delete repositories/branches/tags, change secrets/settings/billing, or perform unrelated external actions.`
      : edit.task);
    const result = await runImpl(args, options.hooks || {});
    const summary = normalizeText(result?.reason || result?.result?.stdout || result?.result?.stderr || `ok=${Boolean(result?.ok)}`).slice(0, 2000);
    const needsApproval = executorNeedsApproval(result);
    const executionBlocked = executorExecutionBlocked(result);
    await finish({
      status: needsApproval ? 'approval_required' : executionBlocked ? 'failed' : result?.ok ? 'completed' : result?.skipped ? 'approval_required' : 'failed',
      completedAt: new Date().toISOString(),
      resultSummary: summary,
      error: result?.ok && !needsApproval && !executionBlocked ? '' : summary,
    });
    if (needsApproval) return { ...result, ok: false, skipped: true, reason: summary };
    if (executionBlocked) return { ...result, ok: false, reason: summary };
    return result;
  } catch (error) {
    if (reservation.finished) return { ok: false, deliveryPending: true, reason: 'Execution receipt saved; relay delivery is pending.' };
    const message = error.message || String(error);
    await finish({
      status: 'failed',
      completedAt: new Date().toISOString(),
      resultSummary: message,
      error: message,
    });
    return { ok: false, error: message };
  }
}

async function runForgeWorkerOnce(options = {}) {
  const requests = await listForgeRequests(options);
  const env = options.env || process.env;
  const onlyId = options.onlyTaskId || env.THREEDVR_OPERATOR_FORGE_ONLY_TASK_ID;
  const after = options.signedAfter ?? env.THREEDVR_OPERATOR_FORGE_SIGNED_AFTER;
  const cutoff = after === undefined ? null : typeof after === 'number' ? after : Date.parse(after);
  if (cutoff !== null && !Number.isFinite(cutoff)) throw new Error('Invalid Forge admission cutoff.');
  const queued = requests.filter(record => record.status === 'queued'
    && (!onlyId || record.id === onlyId)
    && (cutoff === null || Date.parse(record.createdAt) >= cutoff))
    .slice(0, options.limit || DEFAULT_LIMIT);
  const results = [];
  for (const record of queued) {
    results.push({ id: record.id, result: await runForgeRequest(record, options) });
  }
  return results;
}

async function cli(argv = process.argv.slice(2)) {
  const command = argv[0] || 'run-once';
  const json = argv.includes('--json');
  if (command !== 'run-once') {
    console.log('Usage: node operator-forge-worker.js run-once [--json]');
    return;
  }
  const results = await runForgeWorkerOnce();
  console.log(json ? JSON.stringify(results, null, 2) : `Processed ${results.length} operator forge request(s).`);
  if (results.length) {
    const configured = Number.parseInt(String(process.env.THREEDVR_OPERATOR_FORGE_FLUSH_MS || ''), 10);
    const flushMs = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_RELAY_FLUSH_MS;
    if (flushMs) await new Promise(resolve => setTimeout(resolve, flushMs));
  }
}

module.exports = {
  editOnlyTask,
  executorNeedsApproval,
  executorExecutionBlocked,
  listForgeRequests,
  runForgeRequest,
  runForgeWorkerOnce,
  updateForgeRequest,
};

if (require.main === module) {
  cli().then(() => process.exit(0)).catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}
