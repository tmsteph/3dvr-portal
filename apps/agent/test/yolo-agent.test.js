const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  applySearchReplacePatch,
  buildEditPrompt,
  cleanModelOutput,
  extractJsonCandidate,
  parseArgs,
  resolveTarget,
  runYolo,
} = require('../thomas-agent/node/yolo-agent');

const UPDATED_PATCH = '```json\n{"search":"Old Title","replace":"New Title"}\n```';
const UPDATED_README = '# New Title\n\nOld body text that is long enough to validate.\n';

test('parseArgs supports old file task shape and safe apply flags', () => {
  const options = parseArgs(['--apply', '--commit', 'README.md', 'Improve install docs']);

  assert.equal(options.file, 'README.md');
  assert.equal(options.task, 'Improve install docs');
  assert.equal(options.apply, true);
  assert.equal(options.commit, true);
  assert.equal(options.push, false);
});

test('resolveTarget rejects paths outside the repo', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), '3dvr-yolo-'));
  try {
    assert.throws(() => resolveTarget(repo, '../outside.md'), /inside repo/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test('cleanModelOutput strips fences and keeps complete html', () => {
  const output = cleanModelOutput('noise\n```html\n<!DOCTYPE html><html><body>Hi</body></html>\n``` after', 'index.html');

  assert.equal(output, '<!DOCTYPE html><html><body>Hi</body></html>\n');
});

test('buildEditPrompt includes target path, task, and original contents', () => {
  const prompt = buildEditPrompt({
    task: 'Make it clearer',
    relative: 'README.md',
    original: '# Title\n',
  });

  assert.match(prompt, /Task: Make it clearer/);
  assert.match(prompt, /Target file path: README\.md/);
  assert.match(prompt, /# Title/);
  assert.match(prompt, /Return ONLY a JSON object with keys "search" and "replace"/);
});

test('extractJsonCandidate strips fences and extracts the JSON object', () => {
  assert.equal(extractJsonCandidate('noise\n```json\n{"search":"Old","replace":"New"}\n``` after'), '{"search":"Old","replace":"New"}');
});

test('applySearchReplacePatch applies a search/replace patch to the original file', () => {
  const output = applySearchReplacePatch('# Old Title\n\nBody\n', UPDATED_PATCH);

  assert.equal(output, '# New Title\n\nBody\n');
});

test('runYolo writes a preview file by default and does not replace target', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), '3dvr-yolo-'));
  const target = path.join(repo, 'README.md');
  await writeFile(target, '# Old Title\n\nOld body text that is long enough to validate.\n');

  try {
    const result = await runYolo(['--repo', repo, '--file', 'README.md', 'Update title'], {
      skipServer: true,
      printDiff: false,
      completion: UPDATED_PATCH,
    });

    assert.equal(result.applied, false);
    assert.equal(await readFile(target, 'utf8'), '# Old Title\n\nOld body text that is long enough to validate.\n');
    assert.equal(await readFile(`${target}.yolo-new`, 'utf8'), UPDATED_README);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test('runYolo applies output only when --apply is passed', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), '3dvr-yolo-'));
  const target = path.join(repo, 'README.md');
  await writeFile(target, '# Old Title\n\nOld body text that is long enough to validate.\n');

  try {
    const result = await runYolo(['--repo', repo, '--apply', '--file', 'README.md', 'Update title'], {
      skipServer: true,
      completion: UPDATED_PATCH,
    });

    assert.equal(result.applied, true);
    assert.equal(await readFile(target, 'utf8'), UPDATED_README);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
