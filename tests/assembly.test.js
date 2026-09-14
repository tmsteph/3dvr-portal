import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assembly exposes the four coordination views', async () => {
  const html = await read('assembly/index.html');

  assert.match(html, /id="people"/);
  assert.match(html, /id="now"/);
  assert.match(html, /id="decisions"/);
  assert.match(html, /id="needs"/);
  assert.match(html, /Private by default/);
  assert.match(html, /This workspace stays in this browser unless you explicitly export it\./);
});

test('Assembly keeps coordination data device-local in v0.1', async () => {
  const [app, data] = await Promise.all([read('assembly/app.js'), read('assembly/data.js')]);

  assert.match(data, /STORAGE_KEY = '3dvr\.assembly\.v1'/);
  assert.match(app, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(app, /Gun\(/);
  assert.doesNotMatch(app, /fetch\(/);
});

test('Assembly models people, commitments, decisions and needs', async () => {
  const [app, data] = await Promise.all([read('assembly/app.js'), read('assembly/data.js')]);

  assert.match(data, /people: \[\]/);
  assert.match(data, /commitments: \[\]/);
  assert.match(data, /decisions: \[\]/);
  assert.match(data, /needs: \[\]/);
  assert.match(app, /complete-commitment/);
  assert.match(app, /resolve-decision/);
  assert.match(app, /resolve-need/);
});


test('Assembly groups commitments into initiatives and preserves outcome receipts', async () => {
  const [html, app, data] = await Promise.all([read('assembly/index.html'), read('assembly/app.js'), read('assembly/data.js')]);

  assert.match(html, /id="initiativeForm"/);
  assert.match(html, /id="commitmentInitiative"/);
  assert.match(html, /id="outcomeList"/);
  assert.match(data, /initiatives: \[\]/);
  assert.match(app, /initiativeId/);
  assert.match(app, /doneAt: Date\.now\(\)/);
  assert.match(app, /function renderOutcomes\(\)/);
  assert.match(app, /Completed commitments will become outcomes here\./);
});


test('Assembly exposes explicit portable workspace controls', async () => {
  const html = await read('assembly/index.html');
  const app = await read('assembly/app.js');

  assert.match(html, /id="exportAssembly"/);
  assert.match(html, /id="importAssembly"/);
  assert.match(html, /type="module" src="\.\/app\.js"/);
  assert.match(app, /createAssemblySnapshot/);
  assert.match(app, /parseAssemblySnapshot/);
});
