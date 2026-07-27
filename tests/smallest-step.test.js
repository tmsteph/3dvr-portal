import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildStepRecord, sortRecentSteps, validateStepInput } from '../smallest-step/smallest-step.js';

test('Smallest Step records are bounded and actionable', () => {
  const record = buildStepRecord({ id:'one', vision:'More family time', step:'Write one sentence' }, { id:'guest-1', isGuest:true }, new Date('2026-07-27T17:00:00Z'));
  assert.equal(record.app, 'smallest-step');
  assert.equal(record.status, 'planned');
  assert.equal(record.author.id, 'guest-1');
  assert.match(validateStepInput({ step:'Open the file' }), /life/i);
  assert.equal(validateStepInput({ vision:'Freedom', step:'Open the file' }), '');
});

test('Recent steps are newest first and app-scoped', () => {
  const rows = sortRecentSteps([{id:'old',app:'smallest-step',createdAt:'2026-07-01'},{id:'other',app:'other',createdAt:'2026-07-03'},{id:'new',app:'smallest-step',createdAt:'2026-07-02'}]);
  assert.deepEqual(rows.map(row => row.id), ['new','old']);
});

test('Smallest Step ships as a private GUN-backed portal app', async () => {
  const [html, css, js, manifest, portal] = await Promise.all([
    readFile(new URL('../smallest-step/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../smallest-step/smallest-step.css', import.meta.url), 'utf8'),
    readFile(new URL('../smallest-step/smallest-step.js', import.meta.url), 'utf8'),
    readFile(new URL('../app-manifests/smallest-step.webmanifest', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8')
  ]);
  assert.match(html, /What is the smallest step you can take right now/);
  assert.match(html, /Visualize your ideal life\./);
  assert.match(html, /You do not need the whole path\. You need the smallest honest move you can make right now\./);
  assert.match(html, /data-view="steps"/);
  assert.match(html, /data-view="guide"/);
  assert.match(html, /Saved steps/);
  assert.match(html, /Open the deeper Intention Lab/);
  assert.doesNotMatch(html, /What does it look and feel like when life is going right/);
  assert.doesNotMatch(html, /Make it small enough to begin in five minutes/);
  assert.match(html, /analytics" content="disabled/);
  assert.match(html, /theme-color" content="#0d1513"/);
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /100dvh/);
  assert.match(js, /get\('3dvr-portal'\)\.get\('smallest-step'\)/);
  assert.match(js, /get\('steps'\)\.get\(record\.id\)\.put\(record/);
  assert.match(js, /switchView\('steps'\)/);
  assert.match(manifest, /smallest-step\/\?source=pwa/);
  assert.match(portal, /href="smallest-step\/"/);
});
