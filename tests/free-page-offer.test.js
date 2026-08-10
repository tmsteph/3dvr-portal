import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const html = await readFile(new URL('../free-page/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../free-page/app.js', import.meta.url), 'utf8');
const previewHtml = await readFile(new URL('../free-page/preview/index.html', import.meta.url), 'utf8');
const previewScript = await readFile(new URL('../free-page/preview/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../free-page/styles.css', import.meta.url), 'utf8');
const previewStyles = await readFile(new URL('../free-page/preview/styles.css', import.meta.url), 'utf8');

test('free page offer presents the personalized homepage concept', () => {
  assert.match(html, /Get a clearer homepage concept for free/);
  assert.match(html, /Finish and publish the page for \$300/);
  assert.match(html, /Request the free concept/);
  assert.match(html, /3dvr\.tech@gmail\.com/);
  assert.match(html, /name="email" type="email"[^>]*required/);
  assert.match(html, /A homepage should help the right customer act/);
  assert.match(html, /\.\.\/launch-site\//);
  assert.match(html, /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/);
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-96XRKQ5L65/);
  assert.match(html, /gtag\('config', 'G-96XRKQ5L65'\)/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /\.\.\/gun-init\.js/);
});

test('personalized preview is noindex, safely client-rendered, and tracks explicit funnel events', () => {
  assert.match(previewHtml, /noindex,nofollow/);
  assert.match(previewHtml, /finish and publish this direction for \$300/i);
  assert.match(previewHtml, /Reply about my page/);
  assert.match(previewHtml, /class="brand" href="\.\.\/"[^>]*><span>3dvr<\/span><\/a>/);
  assert.match(previewHtml, /id="contactButton"/);
  assert.match(previewHtml, /data-business/);
  assert.match(previewScript, /textContent = business/);
  assert.match(previewScript, /track\('preview_view'\)/);
  assert.match(previewScript, /track\('claim_intent'\)/);
  assert.match(previewScript, /window\.location\.hash/);
  assert.match(previewScript, /mailto:\$\{contactEmail\}/);
  assert.doesNotMatch(previewScript, /searchParams\.get\('email'\)/);
  assert.doesNotMatch(previewScript, /innerHTML/);
  assert.match(previewHtml, /Business offer from/);
  assert.doesNotMatch(previewHtml, /Advertisement from/);
});

test('free page layouts contain folded-phone overflow guards', () => {
  for (const css of [styles, previewStyles]) {
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /@media \(max-width: 360px\)/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /min-width:\s*0/);
  }
});

test('free page brief builds an email handoff without backend dependencies', () => {
  assert.match(script, /mailto:/);
  assert.match(script, /Free homepage concept/);
  assert.match(script, /3dvr\.tech@gmail\.com/);
  assert.match(script, /finishing and publishing the page/);
  assert.match(script, /gtag\('event', 'generate_lead'/);
  assert.match(script, /method: 'mailto_brief'/);
  assert.match(script, /trackFirstPartyEvent\('page_view'\)/);
  assert.match(script, /trackFirstPartyEvent\('generate_lead'\)/);
  assert.match(script, /saveBriefToCrm/);
  assert.match(script, /3dvr-crm/);
  assert.match(script, /crm-touch-log/);
  assert.match(script, /Lead captured; concept requested/);
});
