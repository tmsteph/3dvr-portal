import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import { normalizeReplayEvents } from '../scripts/playwright/deterministic-runtime.mjs';

const execFileAsync = promisify(execFile);
const compareScript = resolve('scripts/playwright/compare-captures.mjs');
const aiReviewScript = resolve('scripts/playwright/ai-review-capture.mjs');

async function makeCapture(root, changed = false) {
  await mkdir(join(root, 'frames'), { recursive: true });
  const image = new PNG({ width: 2, height: 2 });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = 20;
    image.data[offset + 1] = 30;
    image.data[offset + 2] = 40;
    image.data[offset + 3] = 255;
  }
  if (changed) image.data.fill(255, 0, 4);
  await writeFile(join(root, 'frames/frame.png'), PNG.sync.write(image));
  const manifest = {
    name: 'test-capture',
    requestedUrl: '/test/',
    frames: [{ scheduledMs: 0, path: 'frames/frame.png' }],
    performance: { rafFpsDuringCapture: 60 },
    console: [{ type: 'error', text: 'shared 404' }],
    pageErrors: [],
  };
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
}

test('visual comparison scores changed pixels and separates new errors', async () => {
  const root = await mkdtemp(join(tmpdir(), '3dvr-visual-regression-'));
  try {
    const baseline = join(root, 'baseline');
    const candidate = join(root, 'candidate');
    const report = join(root, 'report');
    await makeCapture(baseline, false);
    await makeCapture(candidate, true);
    await execFileAsync(process.execPath, [compareScript, '--baseline', baseline, '--candidate', candidate, '--output', report]);
    const result = JSON.parse(await readFile(join(report, 'comparison.json'), 'utf8'));
    assert.equal(result.summary.totalFrames, 1);
    assert.equal(result.summary.meanRatio, 0.25);
    assert.equal(result.summary.newCandidateErrors, 0);
    assert.equal(result.frames[0].diffPixels, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('AI visual review leaves a useful artifact when no key is configured', async () => {
  const root = await mkdtemp(join(tmpdir(), '3dvr-ai-review-'));
  try {
    const baseline = join(root, 'baseline');
    const candidate = join(root, 'candidate');
    const report = join(root, 'report');
    await makeCapture(baseline, false);
    await makeCapture(candidate, true);
    await execFileAsync(process.execPath, [compareScript, '--baseline', baseline, '--candidate', candidate, '--output', report]);
    await execFileAsync(process.execPath, [aiReviewScript, '--comparison', join(report, 'comparison.json')], {
      env: { ...process.env, OPENAI_API_KEY: '' },
    });
    const review = await readFile(join(report, 'ai-review.md'), 'utf8');
    assert.match(review, /OPENAI_API_KEY/);
    assert.match(review, /comparison artifact/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('replay events normalize human times and preserve deterministic ordering', () => {
  const events = normalizeReplayEvents([
    { at: '1s', type: 'keyup', code: 'KeyE' },
    { at: '200ms', type: 'keydown', code: 'KeyE' },
    { at: 200, type: 'keydown', code: 'KeyF' },
  ]);
  assert.deepEqual(events.map(event => [event.atMs, event.code]), [
    [200, 'KeyE'],
    [200, 'KeyF'],
    [1000, 'KeyE'],
  ]);
});

test('automatic visual scenarios include deterministic gameplay replay', async () => {
  const config = JSON.parse(await readFile(resolve('visual-regression.config.json'), 'utf8'));
  const jetpack = config.scenarios.find(scenario => scenario.name === 'space-jetpack-mobile-replay');
  assert(jetpack);
  assert.equal(jetpack.deterministic, true);
  assert.equal(jetpack.tick, '20ms');
  assert(jetpack.replay.some(event => event.type === 'keydown' && event.code === 'KeyE'));
  assert(jetpack.replay.some(event => event.type === 'keydown' && event.code === 'KeyF'));
});
