import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';

function run(command, cwd) {
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: 'inherit' });
    child.on('error', () => resolve(127));
    child.on('close', code => resolve(code ?? 1));
  });
}

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout.trim());
    });
  });
}

const command = process.argv.slice(2);
if (!command.length) {
  console.error('Usage: npm run agent:baseline -- <command> [args...]');
  process.exitCode = 1;
} else {
  console.log(`CURRENT checkout: ${command.join(' ')}`);
  const current = await run(command, process.cwd());
  console.log(`Current exit code: ${current}`);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), '3dvr-agent-baseline-'));
  try {
    await git(['worktree', 'add', '--detach', tempRoot, 'origin/main'], process.cwd());
    console.log(`BASELINE checkout: ${command.join(' ')}`);
    const baseline = await run(command, tempRoot);
    console.log(`Baseline exit code: ${baseline}`);
    if (current !== 0 && baseline === current) console.log('Classification: reproduced on origin/main; baseline failure.');
    else if (current !== 0 && baseline === 0) console.log('Classification: current-branch failure; not baseline.');
    else if (current === 0) console.log('Classification: current command passed.');
    process.exitCode = current;
  } finally {
    await git(['worktree', 'remove', '--force', tempRoot], process.cwd()).catch(() => {});
    await rm(tempRoot, { recursive: true, force: true });
  }
}
