import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('3DVR Girl page ships the dark character-world redesign', async () => {
  const [html, css, app] = await Promise.all([
    read('3dvr-girl/index.html'),
    read('3dvr-girl/styles.css'),
    read('3dvr-girl/app.js')
  ]);

  assert.match(html, /Not a mascot\.\s*A point of view\./);
  assert.match(html, /id="woods"/);
  assert.match(html, /id="archiveGrid"/);
  assert.match(html, /3dvr-girl-kala-forest\.webp/);
  assert.match(css, /--bg:\s*#0b0f0d/);
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(app, /collection:\s*'forest'/);
  assert.match(app, /collection:\s*'portal'/);
});

test('Workboard GitHub route reuses an existing Vercel function', async () => {
  const [vercelConfig, ignore] = await Promise.all([
    read('vercel.json').then(JSON.parse),
    read('.vercelignore')
  ]);

  const rewrite = vercelConfig.rewrites.find(item => item.source === '/api/workboard/github');
  assert.deepEqual(rewrite, {
    source: '/api/workboard/github',
    destination: '/api/session?route=workboard-github'
  });
  assert.match(ignore, /^api\/workboard\/github\.js$/m);
});
