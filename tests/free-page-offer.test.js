import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const html = await readFile(new URL('../free-page/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../free-page/app.js', import.meta.url), 'utf8');
const previewHtml = await readFile(new URL('../free-page/preview/index.html', import.meta.url), 'utf8');
const previewScript = await readFile(new URL('../free-page/preview/app.js', import.meta.url), 'utf8');

test('free page offer presents the tiny website starter offer', () => {
  assert.match(html, /I.ll make you a clean one-page website for free/);
  assert.match(html, /free draft, optional \$5\/month upkeep/i);
  assert.match(html, /Keep it live for \$5\/month/);
  assert.match(html, /3dvr\.tech@gmail\.com/);
  assert.match(html, /https:\/\/3dvr\.tech\/dave\//);
  assert.match(html, /https:\/\/donovan\.3dvr\.tech\//);
  assert.match(html, /\.\.\/billing\/\?plan=starter/);
  assert.match(html, /\.\.\/launch-site\//);
  assert.match(html, /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/);
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-96XRKQ5L65/);
  assert.match(html, /gtag\('config', 'G-96XRKQ5L65'\)/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /\.\.\/gun-init\.js/);
});

test('personalized preview is noindex, safely client-rendered, and tracks explicit funnel events', () => {
  assert.match(previewHtml, /noindex,nofollow/);
  assert.match(previewHtml, /Claim my free draft/);
  assert.match(previewHtml, /data-business/);
  assert.match(previewScript, /textContent = business/);
  assert.match(previewScript, /track\('preview_view'\)/);
  assert.match(previewScript, /track\('claim_intent'\)/);
  assert.doesNotMatch(previewScript, /innerHTML/);
});

test('free page brief builds an email handoff without backend dependencies', () => {
  assert.match(script, /mailto:/);
  assert.match(script, /Free 3DVR one-page website/);
  assert.match(script, /3dvr\.tech@gmail\.com/);
  assert.match(script, /\$5\/month/);
  assert.match(script, /gtag\('event', 'generate_lead'/);
  assert.match(script, /method: 'mailto_brief'/);
  assert.match(script, /trackFirstPartyEvent\('page_view'\)/);
  assert.match(script, /trackFirstPartyEvent\('generate_lead'\)/);
});
