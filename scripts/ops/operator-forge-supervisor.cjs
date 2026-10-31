const path = require('node:path');
const { statfs } = require('node:fs/promises');

async function main(env = process.env) {
  for (const name of ['THREEDVR_FORGE_AGENT_ROOT', 'THREEDVR_OPERATOR_FORGE_STATE_DIR', 'THREEDVR_OPERATOR_FORGE_WORKTREE_ROOT']) {
    if (!path.isAbsolute(env[name] || '')) throw new Error('Managed Forge paths must be explicit.');
  }
  if (!Number.isFinite(Date.parse(env.THREEDVR_OPERATOR_FORGE_SIGNED_AFTER || ''))) {
    throw new Error('Managed Forge requires a signed admission cutoff.');
  }
  const { runForgeWorkerOnce } = require(path.join(env.THREEDVR_FORGE_AGENT_ROOT, 'thomas-agent/node/operator-forge-worker.js'));
  for (;;) {
    const disk = await statfs(env.THREEDVR_FORGE_AGENT_ROOT);
    if (disk.bavail * disk.bsize < 1024 * 1024 * 1024) throw new Error('Forge paused: less than 1 GiB disk space remains.');
    const results = await runForgeWorkerOnce({ limit: 1, timeoutMs: 6000, env });
    if (results.length) {
      console.log(JSON.stringify({ processed: results.length, completed: results.filter(row => row.result?.ok).length,
        stopped: results.filter(row => !row.result?.ok).length }));
    }
    if (env.THREEDVR_OPERATOR_FORGE_ONLY_TASK_ID && results.length) return;
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

module.exports = { main };
if (require.main === module) main().then(() => process.exit(0)).catch(error => {
  console.error(error.message);
  process.exit(1);
});
