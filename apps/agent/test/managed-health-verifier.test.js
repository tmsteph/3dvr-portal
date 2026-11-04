const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workflow = fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/agent.yml'), 'utf8');
const start = workflow.indexOf('      - name: Verify staged revision without runtime mutation');
const end = workflow.indexOf('      - name: Publish worker deployment status', start);
assert(start >= 0 && end > start, 'read-only staged revision verification must be present');
const verifyStep = workflow.slice(start, end);
const marker = "<<'REMOTE'\n";
const open = verifyStep.indexOf(marker);
const close = verifyStep.indexOf('\n          REMOTE', open + marker.length);
assert(open >= 0 && close > open, 'staged revision verifier must use a bounded SSH heredoc');
const verifier = verifyStep.slice(open + marker.length, close).replace(/^          /gm, '');

test('manual release verifier checks isolated staged revision without queue mutation', (t) => {
  assert.equal(workflow.includes('agent-task-queue.js enqueue'), false);
  assert.equal(workflow.includes('--backend health --risk read_only'), false);
  assert.ok(verifier.includes('portal-release-stage'));
  assert.ok(verifier.includes('test "$(git -C "$stage" rev-parse HEAD)" = "$GITHUB_SHA"'));
  assert.ok(verifier.includes('execution unverified'));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-revision-verifier-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, '.3dvr', 'portal-release-stage');
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
  assert.match(good.stdout, /execution unverified/);
  // A later main commit must not pass verification for an earlier approved SHA.
  assert.equal(git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    'commit', '--allow-empty', '-qm', 'later unreviewed revision']).status, 0);
  const ancestor = run(sha);
  assert.notEqual(ancestor.status, 0, 'ancestry is not exact release authorization');
  const bad = run('0000000000000000000000000000000000000000');
  assert.notEqual(bad.status, 0, 'a staged revision mismatch must fail closed');
  assert.equal(git(['status', '--porcelain']).stdout.trim(), '', 'verification must not change the stage checkout');
  assert.equal(fs.existsSync(path.join(dir, '.3dvr', 'portal', '.git')), false,
    'verification must not create or access a live portal checkout');
});
