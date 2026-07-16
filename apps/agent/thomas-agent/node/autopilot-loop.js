const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RUNNER = path.join(ROOT, 'scripts', 'ask-autopilot');
const INTERVAL_MINUTES = Number.parseInt(process.env.THREEDVR_AUTOPILOT_INTERVAL_MINUTES || '360', 10);
const INTERVAL_MS = Math.max(1, Number.isFinite(INTERVAL_MINUTES) ? INTERVAL_MINUTES : 360) * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCycle() {
  return new Promise((resolve) => {
    const child = spawn(RUNNER, [], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => resolve(code || 0));
    child.on('error', () => resolve(1));
  });
}

async function main() {
  while (true) {
    const code = await runCycle();
    if (code !== 0) {
      console.error(`[autopilot-loop] cycle exited with code ${code}`);
    }
    await sleep(INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
