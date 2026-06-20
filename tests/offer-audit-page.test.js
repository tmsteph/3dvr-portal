import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const rootDir = new URL('../', import.meta.url);
const offerPageUrl = new URL('ideas/offer-audit.html', rootDir);
const ideasIndexUrl = new URL('ideas/index.html', rootDir);
const portalIndexUrl = new URL('index.html', rootDir);
const moneyPrinterUrl = new URL('money-printer/index.html', rootDir);
const playbookUrl = new URL('docs/money-printer-offer-audit-playbook.md', rootDir);

async function fileExists(url) {
  try {
    await access(url, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('Money Printer offer audit experiment', () => {
  it('ships a paid offer page with Gun-backed intake', async () => {
    assert.equal(await fileExists(offerPageUrl), true, 'offer audit page should exist');
    const html = await readFile(offerPageUrl, 'utf8');

    assert.match(html, /48-Hour Offer Audit/);
    assert.match(html, /\$300 fixed audit/);
    assert.match(html, /data-audience-key="offer-audit"/);
    assert.match(html, /3dvr-audience-tests\/v1\/offer-audit\/signups/);
    assert.match(html, /Pay \$300 and start/);
    assert.match(html, /https:\/\/buy\.stripe\.com\/aFabJ1eua5pV24DdQEc7u0a/);
    assert.match(html, /Ask for fit check first/);
    assert.match(html, /data-checkout-success/);
    assert.match(html, /\/icons\/icon-512\.png/);
  });

  it('links the offer from Ideas Lab, portal search, and Money Printer cockpit', async () => {
    const [ideas, portal, moneyPrinter] = await Promise.all([
      readFile(ideasIndexUrl, 'utf8'),
      readFile(portalIndexUrl, 'utf8'),
      readFile(moneyPrinterUrl, 'utf8')
    ]);

    assert.match(ideas, /\/ideas\/offer-audit\.html/);
    assert.match(portal, /ideas\/offer-audit\.html/);
    assert.match(portal, /Offer Audit/);
    assert.match(moneyPrinter, /\.\.\/ideas\/offer-audit\.html/);
  });

  it('documents the validation playbook and kill-scale rule', async () => {
    assert.equal(await fileExists(playbookUrl), true, 'offer audit playbook should exist');
    const playbook = await readFile(playbookUrl, 'utf8');

    assert.match(playbook, /First 25 Touches/);
    assert.match(playbook, /Minimum viable signal: 3 specific replies/);
    assert.match(playbook, /Scale only after a paid audit or two booked calls/);
  });
});
