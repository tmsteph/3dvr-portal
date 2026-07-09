import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const html = await readFile(new URL('../free-page/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../free-page/app.js', import.meta.url), 'utf8');

test('free page offer presents the tiny website starter offer', () => {
  assert.match(html, /I.ll make you a clean one-page website for free/);
  assert.match(html, /free draft, optional \$5\/month upkeep/i);
  assert.match(html, /Keep it live for \$5\/month/);
  assert.match(html, /3dvr\.tech@gmail\.com/);
  assert.match(html, /https:\/\/3dvr\.tech\/dave\//);
  assert.match(html, /https:\/\/donovan\.3dvr\.tech\//);
  assert.match(html, /\.\.\/billing\/\?plan=starter/);
  assert.match(html, /\.\.\/launch-site\//);
});

test('free page brief builds an email handoff without backend dependencies', () => {
  assert.match(script, /mailto:/);
  assert.match(script, /Free 3DVR one-page website/);
  assert.match(script, /3dvr\.tech@gmail\.com/);
  assert.match(script, /\$5\/month/);
});
