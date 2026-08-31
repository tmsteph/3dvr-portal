import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const html = await readFile(new URL('../free-page/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../free-page/app.js', import.meta.url), 'utf8');
const previewHtml = await readFile(new URL('../free-page/preview/index.html', import.meta.url), 'utf8');
const previewScript = await readFile(new URL('../free-page/preview/app.js', import.meta.url), 'utf8');
const launchHtml = await readFile(new URL('../new-business-launch/index.html', import.meta.url), 'utf8');
const templateHtml = await readFile(new URL('../free-sites/_template.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../free-page/styles.css', import.meta.url), 'utf8');
const previewStyles = await readFile(new URL('../free-page/preview/styles.css', import.meta.url), 'utf8');

test('free page offer promises a real free live website', () => {
  assert.match(html, /Get a simple website live for free/);
  assert.match(html, /publish it on a 3DVR-hosted address/);
  assert.match(html, /email you the live link/);
  assert.match(html, /Request my free live site/);
  assert.match(html, /Keep the simple 3DVR-hosted site at no charge/);
  assert.doesNotMatch(html, /Finish and publish the page for \$300/);
  assert.match(html, /3dvr\.tech@gmail\.com/);
  assert.match(html, /name="email" type="email"[^>]*required/);
  assert.match(html, /A tiny site can still do the important job/);
  assert.match(html, /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/);
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-96XRKQ5L65/);
  assert.match(html, /gtag\('config', 'G-96XRKQ5L65'\)/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /\.\.\/gun-init\.js/);
});

test('personalized preview is noindex and agrees the simple hosted site is free', () => {
  assert.match(previewHtml, /noindex,nofollow/);
  assert.match(previewHtml, /publish the simple one-page version for free/i);
  assert.match(previewHtml, /simple 3DVR-hosted site is free to keep/i);
  assert.doesNotMatch(previewHtml, /publish this direction for \$300/i);
  assert.match(previewHtml, /Reply about my site/);
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
  assert.match(previewHtml, /Free website offer from/);
});

test('new business launch keeps basic hosting free and sells support separately', () => {
  assert.match(launchHtml, /publish it on a 3DVR-hosted address.*live link for free/s);
  assert.match(launchHtml, /simple one-page 3DVR-hosted site stays free/i);
  assert.match(launchHtml, /Pay for help, not basic hosting/);
  assert.match(launchHtml, /Light support/);
  assert.doesNotMatch(launchHtml, /\$5\/mo<\/strong> keeps your page live/);
  assert.match(launchHtml, /"Free one-page website", "price": "0"/);
});

test('free site automation has a deterministic reusable template', () => {
  for (const placeholder of [
    '{{BUSINESS_NAME}}',
    '{{META_DESCRIPTION}}',
    '{{TAGLINE}}',
    '{{PRIMARY_URL}}',
    '{{PRIMARY_LABEL}}',
    '{{CONTACT_EMAIL}}',
    '{{SECTION_HEADING}}',
    '{{SECTION_BODY}}'
  ]) {
    assert.match(templateHtml, new RegExp(placeholder.replace(/[{}]/g, '\\$&')));
  }
  assert.match(templateHtml, /Free site hosted by/);
});

test('free page layouts contain folded-phone overflow guards', () => {
  for (const css of [styles, previewStyles]) {
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /@media \(max-width: 360px\)/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /min-width:\s*0/);
  }
});

test('free page brief submits directly into the live-site build queue with email fallback', () => {
  assert.match(script, /\/api\/calendar\/reminder-email/);
  assert.match(script, /mode: 'free-site-request'/);
  assert.match(script, /submitDirectRequest/);
  assert.match(script, /mailto:/);
  assert.match(script, /Free 3DVR website request/);
  assert.match(script, /3dvr\.tech@gmail\.com/);
  assert.match(script, /build the smallest useful version and email me the live URL/i);
  assert.match(script, /gtag\('event', 'generate_lead'/);
  assert.match(script, /method: 'free_live_site_direct'/);
  assert.match(script, /trackFirstPartyEvent\('page_view'\)/);
  assert.match(script, /trackFirstPartyEvent\('generate_lead'\)/);
  assert.match(script, /saveBriefToCrm/);
  assert.match(script, /3dvr-crm/);
  assert.match(script, /crm-touch-log/);
  assert.match(script, /Lead captured for automated build and email delivery/);
  assert.match(html, /Submit once\. We’ll return with the live site/);
  assert.match(html, /name="website"[^>]*hidden/);
});
