import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const Gun = require('gun');
require('gun/sea');
const { runForgeRequest } = require('../apps/agent/thomas-agent/node/operator-forge-worker.js');

function memoryForgeRoot() {
  const records = new Map();
  return {
    records,
    get(id) {
      return {
        put(value, ack) {
          records.set(id, { ...(records.get(id) || {}), ...value });
          ack?.({ ok: 1 });
        }
      };
    }
  };
}

async function git(cwd, ...args) {
  return exec('git', args, { cwd });
}

test('signed owner Forge edit reaches completed after a real commit and push', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'operator-self-edit-'));
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  const verify = path.join(root, 'verify');
  const marker = `self-edit-passed-${Date.now()}`;

  try {
    await exec('git', ['init', '--bare', remote]);
    await exec('git', ['init', '-b', 'main', work]);
    await git(work, 'config', 'user.email', 'operator-self-edit-test@3dvr.tech');
    await git(work, 'config', 'user.name', '3DVR Operator self-edit test');
    await writeFile(path.join(work, 'README.md'), '# Operator self-edit fixture\n');
    await git(work, 'add', 'README.md');
    await git(work, 'commit', '-m', 'Initialize self-edit fixture');
    await git(work, 'remote', 'add', 'origin', remote);
    await git(work, 'push', '-u', 'origin', 'main');

    const pair = await Gun.SEA.pair();
    const alias = 'operator-self-edit-test@3dvr';
    const id = `operator-task-${Date.now()}`;
    const requestedChange = `Write ${marker} to self-edit-canary.txt. Commit and push the completed change to GitHub.`;
    const task = [
      `Operator code request: ${requestedChange}`,
      'Make the smallest useful change in the working repository and run focused tests.',
      'Use an isolated branch or worktree when practical.',
      'The signed request includes GitHub write intent. Preserve exactly the requested repository workflow.'
    ].join(' ');
    const signedPayload = {
      scope: 'operator-forge-task',
      action: 'queue-code-change',
      alias,
      pub: pair.pub,
      origin: 'https://portal.3dvr.tech',
      iat: Date.now(),
      taskId: id,
      repo: 'portal',
      task,
      githubWriteRequested: true
    };
    const authProof = await Gun.SEA.sign(signedPayload, pair);
    const record = {
      id,
      title: 'Operator self-edit integration canary',
      task,
      repo: 'portal',
      backend: 'auto',
      githubWriteRequested: true,
      riskClass: 'external_write',
      status: 'queued',
      createdAt: new Date().toISOString(),
      requestedBy: 'portal-operator',
      authProof: `b64:${Buffer.from(authProof, 'utf8').toString('base64')}`,
      authPub: pair.pub
    };
    const env = {
      ...process.env,
      THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ [alias]: pair.pub }),
      THREEDVR_OPERATOR_PORTAL_REPO: work
    };
    const forgeRoot = memoryForgeRoot();

    const result = await runForgeRequest(record, {
      env,
      rootNode: forgeRoot,
      runAgentTaskImpl: async args => {
        assert.ok(args.includes('--unsafe'), 'owner GitHub write must reach the executor as --unsafe');
        const repoIndex = args.indexOf('--repo');
        assert.equal(path.resolve(args[repoIndex + 1]), path.resolve(work));
        const prompt = String(args.at(-1));
        assert.match(prompt, /cryptographically signed by the 3DVR owner/i);
        assert.match(prompt, new RegExp(marker));

        await writeFile(path.join(work, 'self-edit-canary.txt'), `${marker}\n`);
        await git(work, 'add', 'self-edit-canary.txt');
        await git(work, 'commit', '-m', 'Operator self-edit canary');
        await git(work, 'push', 'origin', 'HEAD:main');
        return { ok: true, reason: 'self-edit canary committed and pushed' };
      }
    });

    assert.equal(result.ok, true);
    assert.equal(forgeRoot.records.get(id)?.status, 'completed');
    assert.match(forgeRoot.records.get(id)?.resultSummary || '', /committed and pushed/i);

    await exec('git', ['clone', '--branch', 'main', remote, verify]);
    assert.equal((await readFile(path.join(verify, 'self-edit-canary.txt'), 'utf8')).trim(), marker);
    const { stdout } = await git(verify, 'log', '-1', '--pretty=%s');
    assert.equal(stdout.trim(), 'Operator self-edit canary');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
