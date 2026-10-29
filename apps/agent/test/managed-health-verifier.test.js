const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workflow = fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/agent.yml'), 'utf8');
const start = workflow.indexOf('      - name: Verify deployed revision without queue mutation');
const end = workflow.indexOf('      - name: Publish worker deployment status', start);
assert(start >= 0 && end > start, 'read-only revision verification must be present');
const verifyStep = workflow.slice(start, end);
const remote = verifyStep.match(/<<'REMOTE'\n([\s\S]*?)^          REMOTE$/m);
assert(remote, 'revision verifier must use a bounded SSH heredoc');
const verifier = remote[1].replace(/^          /gm, '');

test('manual deployment verifier checks revision without creating a queue task', (t) => {
  assert.doesNotMatch(workflow, /agent-task-queue\.js enqueue|--backend health --risk read_only/);
  assert.match(verifier, /git -C "\$repo" merge-base --is-ancestor "\$GITHUB_SHA" HEAD/);
  assert.match(verifier, /worker execution unverified/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revision-verifier-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, '.3dvr', 'portal');
  fs.mkdirSync(repo, { recursive: true });

  const git = (args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(git(['init', '-q']).status, 0);
  assert.equal(git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    'commit', '--allow-empty', '-qm', 'baseline']).status, 0);
  const sha = git(['rev-parse', 'HEAD']).stdout.trim();
  assert.match(sha, /^[a-f0-9]{40}$/);

  const run = (expected) => spawnSync('bash', ['-s'], {
    input: verifier,
    encoding: 'utf8',
    env: { ...process.env, HOME: dir, GITHUB_SHA: expected },
  });
  const good = run(sha);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /worker execution unverified/);
  const bad = run('0000000000000000000000000000000000000000');
  assert.notEqual(bad.status, 0, 'a revision mismatch must fail closed');
  assert.equal(git(['status', '--porcelain']).stdout.trim(), '', 'verification must not change the checkout');
});
