#!/usr/bin/env node
const { createFreelancerWorkspaceRuntime } = require('./freelancer-workspace-runtime');

function usage() {
  console.log('Usage: freelancer-workspace <status|provision|start|stop|session> <workspace-id> [--timezone TZ] [--json]');
}

function parseArgs(argv) {
  const args = [...argv];
  const action = String(args.shift() || '').trim().toLowerCase();
  const workspaceId = String(args.shift() || '').trim();
  const options = { json: false, timezone: '' };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--json') options.json = true;
    else if (flag === '--timezone') options.timezone = String(args.shift() || '').trim();
    else throw new Error(`Unknown option: ${flag}`);
  }
  return { action, workspaceId, options };
}

async function main() {
  const { action, workspaceId, options } = parseArgs(process.argv.slice(2));
  if (!['status', 'provision', 'start', 'stop', 'session'].includes(action) || !workspaceId) {
    usage();
    process.exitCode = 2;
    return;
  }
  const runtime = createFreelancerWorkspaceRuntime();
  const result = action === 'provision'
    ? await runtime.provision(workspaceId, { timezone: options.timezone })
    : await runtime[action](workspaceId);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.workspaceId}: ${result.status}`);
    if (result.url) console.log(`Desktop: ${result.url}`);
    if (action === 'session' && result.username) {
      console.log(`User: ${result.username}`);
      console.log(`Password: ${result.password}`);
      console.log(result.warning);
    }
  }
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
