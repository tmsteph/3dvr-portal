import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl = new URL('../offer-garden/index.html', import.meta.url);
const stylesUrl = new URL('../offer-garden/styles.css', import.meta.url);
const appUrl = new URL('../offer-garden/app.js', import.meta.url);
const portalUrl = new URL('../index.html', import.meta.url);

test('offer garden keeps the success-share offer simple and safe', async () => {
  const html = await readFile(pageUrl, 'utf8');
  const css = await readFile(stylesUrl, 'utf8');
  const app = await readFile(appUrl, 'utf8');

  assert.match(html, /Start free\. Launch free\. Pay only when you earn\./);
  assert.match(html, /Make one small offer\. Share it\./);
  assert.match(html, /3DVR earns a small fee only when you get paid\./);
  assert.match(html, /Payment setup is not live in this app yet\./);
  assert.match(html, /id="skill"/);
  assert.match(html, /id="share-message"/);
  assert.match(html, /Copy Message/);
  assert.doesNotMatch(html, /profit/i);
  assert.doesNotMatch(html, /Stripe/i);
  assert.doesNotMatch(app, /fetch\(/);
  assert.doesNotMatch(app, /stripe/i);
  assert.match(app, /localStorage\.setItem\(storageKey/);
  assert.match(app, /navigator\.clipboard\.writeText/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /width:\s*min\(100%, 1120px\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?grid-template-columns:\s*1fr/);
});

test('portal home links to the offer garden app', async () => {
  const html = await readFile(portalUrl, 'utf8');

  assert.match(html, /href="offer-garden\/"/);
  assert.match(html, /<span class="app-card__title">Start an Offer<\/span>/);
  assert.match(html, /Start free, make a small offer, and pay 3DVR only when money comes through your page\./);
});
