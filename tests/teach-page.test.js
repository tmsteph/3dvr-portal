import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const html = read('teach/index.html');
const app = read('teach/app.js');
const handoff = read('operator/teach-handoff.js');
const operatorHtml = read('operator/index.html');
const appSearch = read('operator/app-search.js');

test('Teach page exposes the capture, structure, and handoff flow', () => {
  assert.match(html, /Show me how/);
  assert.match(html, /What mattered\?/);
  assert.match(html, /Build skill draft/);
  assert.match(html, /Teach Operator/);
  assert.match(html, /Device only/);
});

test('Teach capture uses browser-native recording and keeps the recording local', () => {
  assert.doesNotThrow(() => new Function(app));
  assert.match(app, /getDisplayMedia/);
  assert.match(app, /getUserMedia/);
  assert.match(app, /MediaRecorder/);
  assert.match(app, /recordingUploaded:\s*false/);
  assert.match(app, /URL\.createObjectURL/);
  assert.doesNotMatch(app, /fetch\s*\(/);
});

test('Teach produces an approval-gated 3dvr skill draft', () => {
  assert.match(app, /schema:\s*'3dvr\.skill\.v1'/);
  assert.match(app, /humanReviewRequired:\s*true/);
  assert.match(app, /defaultMode:\s*'preview'/);
  assert.match(app, /external communication/);
  assert.match(app, /payments or purchases/);
});

test('Teach hands a reviewed draft to Operator without putting it in the URL', () => {
  assert.doesNotThrow(() => new Function(handoff));
  assert.match(app, /sessionStorage\.setItem\('3dvr\.teach\.operatorPrompt'/);
  assert.match(app, /\/operator\/\?teach=1/);
  assert.match(handoff, /sessionStorage\.getItem\('3dvr\.teach\.operatorPrompt'/);
  assert.match(handoff, /sessionStorage\.removeItem\('3dvr\.teach\.operatorPrompt'/);
  assert.match(operatorHtml, /href="\/teach\/"/);
});

test('Operator app search can discover 3DVR Teach', () => {
  assert.match(appSearch, /title: '3DVR Teach'/);
  assert.match(appSearch, /href: '\/teach\/'/);
});
