import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Growth Desk ships as a CRM-backed operator surface', async () => {
  const html = await readFile(new URL('../growth-desk/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../growth-desk/app.js', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');

  assert.match(html, /<title>Growth Desk \| 3DVR Portal<\/title>/);
  assert.match(html, /noindex, nofollow/);
  assert.match(html, /Follow-Up Leak Sprint/);
  assert.match(html, /Open sprint in CRM/);
  assert.match(html, /Command Center repo/);
  assert.match(script, /const SPRINT_TAG = 'follow-up-leak-sprint';/);
  assert.match(script, /gun\.get\('3dvr-crm'\)/);
  assert.match(script, /crm-outreach-drafts/);
  assert.match(portal, /href="growth-desk\/"/);
  assert.match(portal, /<span class="app-card__title">Growth Desk<\/span>/);
  assert.match(vercel, /growth\.3dvr\.tech/);
  assert.match(vercel, /\/growth-desk\/index\.html/);
});
