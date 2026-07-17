import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createClaritySnapshot,
  createFallbackGuidance,
  getNextMoveMode,
  getNextMoveQuestions,
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

test('each mode asks three focused questions with separate jobs', () => {
  const career = getNextMoveQuestions('career');
  const startup = getNextMoveQuestions('startup');
  const build = getNextMoveQuestions('build');

  assert.match(career.situation.label, /choice/i);
  assert.match(career.constraint.label, /must not get worse/i);
  assert.match(startup.situation.label, /who/i);
  assert.match(startup.desired.label, /offer/i);
  assert.match(startup.constraint.label, /spend/i);
  assert.match(build.situation.label, /who/i);
  assert.match(build.desired.label, /one job/i);
  assert.match(build.constraint.label, /wait until later/i);
  assert.equal(getNextMoveQuestions('unknown'), null);
});

test('Clarity Snapshot preserves context and returns one bounded next action', () => {
  const snapshot = createClaritySnapshot(input);

  assert.equal(snapshot.mode, 'startup');
  assert.equal(snapshot.situation, input.situation);
  assert.equal(snapshot.desired, input.desired);
  assert.equal(snapshot.constraint, input.constraint);
  assert.match(snapshot.nextAction, /one customer/i);
  assert.match(snapshot.disclaimer, /not expert advice/i);
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

test('fallback guidance remains useful when AI is unavailable', () => {
  const snapshot = createClaritySnapshot(input);
  const guidance = createFallbackGuidance(snapshot);
  const output = snapshotToText(snapshot, guidance);

  assert.equal(guidance.paths.length, 3);
  assert.ok(guidance.whatItHears.length < 80);
  assert.match(guidance.recommendation.title, /customer/i);
  assert.equal(guidance.fallback, true);
  assert.match(output, /Three|Paths worth testing:/);
  assert.match(output, /Biggest assumption:/);
  assert.match(output, /Follow-up question:/);
});

test('Next Move Lab sends answers only to its isolated AI endpoint', async () => {
  const html = await readFile(new URL('../next-move-lab/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../next-move-lab/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../next-move-lab/styles.css', import.meta.url), 'utf8');

  assert.match(html, /Pick one topic\. Answer three clear questions\./);
  assert.match(html, /data-mode-choice="career"/);
  assert.match(html, /data-mode-choice="startup"/);
  assert.match(html, /data-mode-choice="build"/);
  assert.match(html, /My life or job/);
  assert.match(html, /A business idea/);
  assert.match(html, /Something to build/);
  assert.match(html, /We do not save them/i);
  assert.match(html, /See more ideas/);
  assert.match(app, /fetch\('\/api\/openai-site\?provider=next-move'/);
  assert.match(app, /getNextMoveQuestions/);
  assert.match(app, /showStep\(1\)/);
  assert.match(app, /form\.elements\.mode\.value = mode/);
  assert.doesNotMatch(app, /localStorage|sessionStorage|Gun\(/);
  assert.match(app, /textContent/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /overflow-x: hidden/);
});
