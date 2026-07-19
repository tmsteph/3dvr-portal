const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
async function git(args, cwd, options = {}) { const result = await run('git', args, { cwd, env: options.env || process.env, maxBuffer: 2_000_000 }); return { code: 0, stdout: result.stdout, stderr: result.stderr }; }
async function inspectRepository(cwd) { const [status, branch, head] = await Promise.all([git(['status','--porcelain=v1','-b'], cwd), git(['branch','--show-current'], cwd), git(['rev-parse','HEAD'], cwd)]); return { clean: status.stdout.split('\n').slice(1).filter(Boolean).length === 0, status: status.stdout, branch: branch.stdout.trim(), headSha: head.stdout.trim() }; }
function matchesAllowed(file, patterns) { return patterns.some(pattern => pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -3)) : file === pattern); }
function assertAllowedFiles(files, patterns) { const unexpected = files.filter(file => !matchesAllowed(file, patterns)); if (unexpected.length) throw new Error(`file scope exceeded: ${unexpected.join(', ')}`); return true; }
module.exports = { assertAllowedFiles, git, inspectRepository, matchesAllowed };
