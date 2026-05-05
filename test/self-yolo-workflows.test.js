const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildPrompt,
  extractMarkdownSection,
  resolveTarget,
  runRollbackAgent,
  runSelfUpdateAgent,
  runSelfYoloAgent,
  runSelfYoloLoop,
} = require('../thomas-agent/node/self-yolo-workflows');

test('buildPrompt handles README sections and full-file edits', () => {
  const sectionPrompt = buildPrompt({
    target: 'README.md',
    task: 'Improve the Installation section',
    original: '## Installation\nOld text',
    sectionName: 'Installation',
  });
  const fullPrompt = buildPrompt({
    target: 'self_yolo/cli.py',
    task: 'Make it shorter',
    original: 'print("hi")',
  });

  assert.match(sectionPrompt, /editing exactly one section/i);
  assert.match(sectionPrompt, /Section name: Installation/);
  assert.match(fullPrompt, /Return the FULL final contents of the file only/);
  assert.match(fullPrompt, /Target file path: self_yolo\/cli.py/);
});

test('extractMarkdownSection finds the requested README section', () => {
  const README = [
    '# Title',
    '',
    '## Installation',
    'Install stuff',
    '',
    '## Commands',
    'Run things',
  ].join('\n');

  const section = extractMarkdownSection(README, 'Commands');

  assert.ok(section);
  assert.match(section.before, /# Title/);
  assert.match(section.section, /## Commands/);
  assert.match(section.after, /$/);
});

test('resolveTarget rejects files outside the allowlist', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), '3dvr-self-yolo-'));
  try {
    await writeFile(path.join(repo, 'README.md'), '# Title\n');
    assert.throws(() => resolveTarget(repo, '../outside.md'), /inside repo/);
    assert.throws(() => resolveTarget(repo, 'package.json'), /Target not allowed/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test('runSelfYoloAgent can preview and cancel without touching the target', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), '3dvr-self-yolo-'));
  const target = path.join(repo, 'README.md');
  await writeFile(target, '# Title\n\n## Installation\nOld text\n');

  try {
    const result = await runSelfYoloAgent(['--repo', repo, '--preview', 'README.md', 'Improve the Installation section'], {
      skipServer: true,
      completion: '## Installation\nNew text that is long enough to satisfy the validation guard. It adds enough detail to be accepted.',
      confirm: async () => false,
    });

    assert.equal(result.applied, false);
    assert.equal(result.cancelled, true);
    assert.match(await readFile(target, 'utf8'), /Old text/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test('runSelfYoloLoop repeats the agent the requested number of rounds', async () => {
  const calls = [];
  const result = await runSelfYoloLoop(['Improve the README', '2'], {
    runAgent: async (task, round) => {
      calls.push({ task, round });
      return { returncode: 0 };
    },
  });

  assert.equal(result, 0);
  assert.deepEqual(calls, [
    { task: 'Improve the README', round: 1 },
    { task: 'Improve the README', round: 2 },
  ]);
});

test('runSelfUpdateAgent and rollback route git commands through injected hooks', async () => {
  const calls = [];
  const result = await runSelfUpdateAgent(['--repo', '/tmp/agent-repo'], {
    runGit: (repo, args) => {
      calls.push({ kind: 'git', repo, args });
      return { status: 0, stdout: '', stderr: '' };
    },
    runCommand: (command, args) => {
      calls.push({ kind: 'cmd', command, args });
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(result, 0);

  const rollbackCalls = [];
  const rollbackResult = await runRollbackAgent(['--repo', '/tmp/agent-repo', 'HEAD~2'], {
    runGit: (repo, args) => {
      rollbackCalls.push({ repo, args });
      return { status: 0 };
    },
  });
  assert.equal(rollbackResult, 0);
  assert.deepEqual(calls.map((call) => call.kind), ['git', 'git', 'git', 'cmd']);
  assert.deepEqual(rollbackCalls, [{ repo: '/tmp/agent-repo', args: ['reset', '--hard', 'HEAD~2'] }]);
});
