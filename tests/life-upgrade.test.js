import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SCHEMA_VERSION,
  STORAGE_KEY,
  STAGES,
  completeAction,
  createPlan,
  deleteStoredPlan,
  hasProgress,
  hasUsefulResult,
  loadStoredPlan,
  nextStage,
  saveStoredPlan,
  updateAction,
  updatePlan
} from '../life-upgrade/state.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('initial state is a v1 plan with three independent actions', () => {
  const plan = createPlan();
  assert.equal(plan.schemaVersion, SCHEMA_VERSION);
  assert.equal(plan.currentStage, 'check-in');
  assert.deepEqual(plan.actions, [
    { text: '', completed: false },
    { text: '', completed: false },
    { text: '', completed: false }
  ]);
});

test('malformed or missing stored JSON safely returns a usable initial state', () => {
  assert.deepEqual(loadStoredPlan(null), createPlan());
  assert.deepEqual(loadStoredPlan('{not-json'), createPlan());
  assert.equal(loadStoredPlan(JSON.stringify({ schemaVersion: 99 })).schemaVersion, SCHEMA_VERSION);
});

test('restore preserves workflow position and active upgrade', () => {
  const restored = loadStoredPlan(JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    currentStage: 'complete',
    upgrade: 'Kitchen',
    result: 'A usable prep surface'
  }));
  assert.equal(restored.currentStage, 'complete');
  assert.equal(restored.upgrade, 'Kitchen');
  assert.equal(nextStage(restored).currentStage, 'evidence');
});

test('actions can be edited and completed independently', () => {
  let plan = updateAction(createPlan(), 0, 'Clear one counter');
  plan = updateAction(plan, 1, 'Put away dishes');
  plan = completeAction(plan, 0);
  assert.deepEqual(plan.actions, [
    { text: 'Clear one counter', completed: true },
    { text: 'Put away dishes', completed: false },
    { text: '', completed: false }
  ]);
});

test('private evidence is part of the local plan and useful results remain detectable', () => {
  let plan = updatePlan(createPlan(), {
    upgrade: 'Kitchen',
    result: 'A usable prep surface',
    evidence: 'A finished, clear counter'
  });
  plan = updateAction(plan, 0, 'Clear one counter');
  assert.equal(plan.evidence, 'A finished, clear counter');
  assert.equal(hasUsefulResult(plan), true);
});

test('delete-all removes only the Life Upgrade browser record', () => {
  const removed = [];
  assert.equal(deleteStoredPlan({ removeItem: (key) => removed.push(key) }), true);
  assert.deepEqual(removed, [STORAGE_KEY]);
});

test('storage failures do not throw and progress detection supports confirmed replacement', () => {
  const plan = updatePlan(createPlan(), { checkIn: 'A real week' });
  assert.equal(hasProgress(plan), true);
  assert.equal(hasProgress(createPlan()), false);
  assert.equal(saveStoredPlan({ setItem: () => { throw new Error('storage full'); } }, plan), false);
  assert.equal(deleteStoredPlan({ removeItem: () => { throw new Error('storage blocked'); } }), false);
});

test('page is offline-capable, safely rendered, and has the confirmed delete action', async () => {
  const html = await read('life-upgrade/index.html');
  const app = await read('life-upgrade/app.js');
  assert.equal(STAGES.length, 8);
  assert.match(html, /Private on this device/);
  assert.match(html, /One small win/);
  assert.match(html, /Your Life Upgrade journey/);
  assert.match(html, /class="journey"/);
  assert.match(html, /data-stage-field="check-in"/);
  assert.match(html, /data-suggestion-list/);
  assert.match(html, /data-game-canvas/);
  assert.match(html, /data-game-level/);
  assert.match(html, /Not sure\? Pick one/);
  assert.match(html, /7 days/);
  assert.match(html, /Stabilize → Understand → Choose → Practice → Help → Earn → Build → Teach/);
  assert.match(html, /id="deleteAll"/);
  assert.match(html, /type="module" src="\.\/app\.js"/);
  assert.doesNotMatch(`${html}\n${app}`, /Gun\(|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|<script[^>]+src="https?:\/\//i);
  assert.match(app, /textContent/);
  assert.doesNotMatch(app, /innerHTML/);
  assert.match(app, /confirm\(/);
  assert.match(app, /deleteStoredPlan/);
  assert.match(app, /Could not save in this browser/);
  assert.match(app, /Could not delete saved data/);
  assert.match(app, /data-momentum/);
  assert.match(app, /renderSuggestions/);
  assert.match(app, /createGame/);
  assert.match(app, /dispatchEvent\(new Event\('input'/);
  assert.match(app, /replace this Life Upgrade plan/);
});

test('portal home and Start page expose the Life Upgrade entry point', async () => {
  const home = await read('index.html');
  const start = await read('start/index.html');
  assert.match(home, /href="life-upgrade\/"/);
  assert.match(start, /href="\.\.\/life-upgrade\/"/);
});
