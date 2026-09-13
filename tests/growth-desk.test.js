import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Growth Desk ships as a CRM-backed operator business surface', async () => {
  const html = await readFile(new URL('../growth-desk/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../growth-desk/app.js', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');

  assert.match(html, /<title>Growth Desk \| 3DVR Portal<\/title>/);
  assert.match(html, /noindex, nofollow/);
  assert.match(html, /Follow-Up Leak Sprint/);
  assert.match(html, /Open sprint in CRM/);
  assert.match(html, /Inspect outreach queue/);
  assert.match(html, /Bounded autopilot/);
  assert.match(html, /Routine work moves\. Identity-sensitive work pauses\./);
  assert.match(html, /Business system docs/);
  assert.match(html, /Business Manager/);
  assert.match(html, />Research</);
  assert.match(html, />Sales</);
  assert.match(html, />Marketing</);
  assert.match(html, />Operations</);
  assert.match(html, />Engineering</);
  assert.match(html, /Lead → sale → learning/);
  assert.match(html, />Payment</);
  assert.match(html, /id="navToggle"/);
  assert.match(html, /id="growthNav"/);
  assert.match(script, /setNav/);
  assert.match(script, /const SPRINT_TAG = 'follow-up-leak-sprint';/);
  assert.match(script, /gun\.get\('3dvr-crm'\)/);
  assert.match(script, /crm-outreach-drafts/);
  assert.match(script, /Inspect outreach/);
  assert.match(portal, /href="\/growth-desk\/"/);
  assert.match(portal, /<strong>Growth Desk<\/strong>/);
  assert.match(vercel, /growth\.3dvr\.tech/);
  assert.match(vercel, /\/growth-desk\/index\.html/);
});
