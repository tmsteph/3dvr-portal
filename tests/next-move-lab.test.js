import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createClaritySnapshot,
  getNextMoveMode,
  normalizeSnapshotText,
  snapshotToText
} from '../next-move-lab/snapshot.js';

const input = {
  mode: 'startup',
  situation: 'I have several product ideas but no customers yet.',
  desired: 'I want to learn which problem one person will pay to solve.',
  constraint: 'I have three hours a week and no launch budget.'
};

test('Next Move modes route into existing portal tools', () => {
  assert.equal(getNextMoveMode('career').route, '../career-launch/');
  assert.equal(getNextMoveMode('startup').route, '../launch-room/?mode=test-service');
  assert.equal(getNextMoveMode('build').route, '../free-page/');
  assert.equal(getNextMoveMode('unknown'), null);
});

test('Clarity Snapshot preserves context and returns one bounded next action', () => {
  const snapshot = createClaritySnapshot(input);

  assert.equal(snapshot.mode, 'startup');
  assert.equal(snapshot.situation, input.situation);
  assert.equal(snapshot.desired, input.desired);
  assert.equal(snapshot.constraint, input.constraint);
  assert.match(snapshot.nextAction, /one possible customer/i);
  assert.match(snapshot.disclaimer, /not medical, legal, financial, or crisis advice/i);
  assert.doesNotMatch(JSON.stringify(snapshot), /guarantee/i);
});

test('Clarity Snapshot requires a mode and all three answers', () => {
  assert.throws(() => createClaritySnapshot({ ...input, mode: '' }), /Choose what/);
  assert.throws(() => createClaritySnapshot({ ...input, constraint: '' }), /all three questions/);
});

test('snapshot text is normalized, bounded, and exportable', () => {
  assert.equal(normalizeSnapshotText('  one\n  useful   move  '), 'one useful move');
  assert.equal(normalizeSnapshotText('x'.repeat(700)).length, 600);

  const output = snapshotToText(createClaritySnapshot(input));
  assert.match(output, /3dvr Next Move/);
  assert.match(output, /What I want:/);
  assert.match(output, /Next 24-hour move:/);
});

test('Next Move Lab is an isolated private browser experience', async () => {
  const html = await readFile(new URL('../next-move-lab/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../next-move-lab/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../next-move-lab/styles.css', import.meta.url), 'utf8');

  assert.match(html, /What are you trying to figure out\?/);
  assert.match(html, /answers stay in this tab and are not saved or sent/i);
  assert.match(html, /My life or career/);
  assert.match(html, /A business idea/);
  assert.match(html, /Something I want to build/);
  assert.doesNotMatch(app, /fetch\(|localStorage|sessionStorage|Gun\(/);
  assert.match(app, /textContent/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /overflow-x: hidden/);
});
