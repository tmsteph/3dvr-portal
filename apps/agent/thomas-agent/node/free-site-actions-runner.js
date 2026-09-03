const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runOnce } = require('./free-site-worker');

const ROOT = path.join(__dirname, '..');
const STATE_DIR = process.env.THREEDVR_AUTOPILOT_STATE_DIR || path.join(ROOT, 'state');
const STATE_FILE = process.env.THREEDVR_FREE_SITE_STATE_FILE || path.join(STATE_DIR, 'free-site-worker-state.json');

function configureGitHubAuth() {
  if (!process.env.GH_TOKEN) throw new Error('GH_TOKEN is not configured for free-site publishing.');
  const result = spawnSync('gh', ['auth', 'setup-git'], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'gh auth setup-git failed').trim());
  }
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return { messages: {} };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, STATE_FILE);
}

function finalizeExistingState() {
  if (!fs.existsSync(STATE_FILE)) return 0;
  const state = readState();
  let finalized = 0;
  for (const entry of Object.values(state.messages || {})) {
    if (entry?.status !== 'existing') continue;
    entry.status = 'processed';
    entry.completedAt = new Date().toISOString();
    entry.existingSite = true;
    finalized += 1;
  }
  if (!finalized) return 0;
  writeState(state);
  return finalized;
}

function quarantineTerminalFailures() {
  if (!fs.existsSync(STATE_FILE)) return 0;
  const state = readState();
  let quarantined = 0;
  for (const entry of Object.values(state.messages || {})) {
    if (entry?.status !== 'failed') continue;
    const error = String(entry.error || entry.lastError || '');
    if (!/nothing to commit, working tree clean/i.test(error)) continue;
    entry.status = 'processed';
    entry.completedAt = new Date().toISOString();
    entry.noop = true;
    entry.noopReason = 'generated site already matches repository content';
    quarantined += 1;
  }
  if (!quarantined) return 0;
  writeState(state);
  return quarantined;
}

function failedRequestCount() {
  const state = readState();
  return Object.values(state.messages || {}).filter((entry) => entry?.status === 'failed').length;
}

async function main() {
  configureGitHubAuth();

  // Do not let deterministic clean-tree no-ops poison every scheduled run.
  // They are terminal/idempotent outcomes, not retryable fulfillment failures.
  const quarantinedBefore = quarantineTerminalFailures();

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const first = await runOnce();
    const second = await runOnce();
    const finalized = finalizeExistingState();
    const quarantined = quarantineTerminalFailures();
    const acted = Number(first?.acted || 0) + Number(second?.acted || 0);
    console.log(`[free-site-actions-runner] cycle=${cycle} acted=${acted} finalized_existing=${finalized} quarantined_noop=${quarantined}`);
    if (acted === 0 && finalized === 0 && quarantined === 0) break;
  }

  const failed = failedRequestCount();
  if (failed > 0) throw new Error(`Free-site worker left ${failed} request(s) in failed state.`);
  if (quarantinedBefore > 0) console.log(`[free-site-actions-runner] recovered_terminal_noops=${quarantinedBefore}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
