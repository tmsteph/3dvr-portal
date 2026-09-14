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
  assert.match(html, /This first version stays in this browser on this device\./);
});

test('Assembly keeps coordination data device-local in v0.1', async () => {
  const app = await read('assembly/app.js');

  assert.match(app, /const STORAGE_KEY = '3dvr\.assembly\.v1'/);
  assert.match(app, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(app, /Gun\(/);
  assert.doesNotMatch(app, /fetch\(/);
});

test('Assembly models people, commitments, decisions and needs', async () => {
  const app = await read('assembly/app.js');

  assert.match(app, /people: \[\]/);
  assert.match(app, /commitments: \[\]/);
  assert.match(app, /decisions: \[\]/);
  assert.match(app, /needs: \[\]/);
  assert.match(app, /complete-commitment/);
  assert.match(app, /resolve-decision/);
  assert.match(app, /resolve-need/);
});
