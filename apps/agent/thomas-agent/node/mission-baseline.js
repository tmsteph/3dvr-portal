const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
async function compareBaseline({ command, featureCwd, baselineCwd, env = process.env }) {
  async function execute(cwd) { try { const result = await run(command[0], command.slice(1), { cwd, env, maxBuffer: 4_000_000 }); return { code: 0, output: result.stdout + result.stderr }; } catch (error) { return { code: error.code || 1, output: `${error.stdout || ''}${error.stderr || ''}` }; } }
  const [feature, baseline] = await Promise.all([execute(featureCwd), execute(baselineCwd)]);
  return { command, feature, baseline, classification: feature.code === 0 ? 'passed' : baseline.code === feature.code ? 'baseline_or_environment' : 'feature_failure' };
}
module.exports = { compareBaseline };
