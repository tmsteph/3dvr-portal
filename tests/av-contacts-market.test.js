import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('AV contacts first market', () => {
  it('gives Contacts an AV network view and URL-prefilled contact handoff', async () => {
    const html = await readFile(new URL('../contacts/index.html', import.meta.url), 'utf8');
    assert.match(html, /AV Network/);
    assert.match(html, /avNetworkView/);
    assert.match(html, /industry\/av/);
    assert.match(html, /shouldOpenPrefill/);
    assert.match(html, /prefillContactFromUrl/);
  });

  it('models Work Agent leads as AV contacts and hands them to canonical Contacts', async () => {
    const html = await readFile(new URL('../work-agent/index.html', import.meta.url), 'utf8');
    const app = await readFile(new URL('../work-agent/app.js', import.meta.url), 'utf8');
    assert.match(html, /AV contacts/);
    assert.match(html, /Labor coordinator \/ scheduler/);
    assert.match(html, /Open AV Contacts/);
    assert.match(app, /AV_CONTACT_KIND_LABELS/);
    assert.match(app, /avContactHref/);
    assert.match(app, /industry\/av, av\/network/);
    assert.match(app, /Save to AV Contacts/);
  });

  it('documents AV contacts as the deliberate first vertical', async () => {
    const readme = await readFile(new URL('../work-agent/README.md', import.meta.url), 'utf8');
    assert.match(readme, /First market: AV contacts/);
    assert.match(readme, /Contacts is the canonical network/);
    assert.match(readme, /labor coordinators/);
  });
});
