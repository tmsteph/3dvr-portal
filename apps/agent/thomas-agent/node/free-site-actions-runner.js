const fs = require('node:fs');
const path = require('node:path');
const { runOnce } = require('./free-site-worker');

const ROOT = path.join(__dirname, '..');
const STATE_DIR = process.env.THREEDVR_AUTOPILOT_STATE_DIR || path.join(ROOT, 'state');
const STATE_FILE = process.env.THREEDVR_FREE_SITE_STATE_FILE || path.join(STATE_DIR, 'free-site-worker-state.json');

function finalizeExistingState() {
  if (!fs.existsSync(STATE_FILE)) return 0;
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  let finalized = 0;
  for (const entry of Object.values(state.messages || {})) {
    if (entry?.status !== 'existing') continue;
    entry.status = 'processed';
    entry.completedAt = new Date().toISOString();
    entry.existingSite = true;
    finalized += 1;
  }
  if (!finalized) return 0;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, STATE_FILE);
  return finalized;
}

async function main() {
  // GitHub Actions runners are ephemeral, so use two passes per cycle:
  // pass 1 discovers/publishes; pass 2 marks already-existing sites seen.
  // Then normalize those entries to processed so they cannot starve newer mail.
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const first = await runOnce();
    const second = await runOnce();
    const finalized = finalizeExistingState();
    const acted = Number(first?.acted || 0) + Number(second?.acted || 0);
    console.log(`[free-site-actions-runner] cycle=${cycle} acted=${acted} finalized_existing=${finalized}`);
    if (acted === 0 && finalized === 0) break;
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
