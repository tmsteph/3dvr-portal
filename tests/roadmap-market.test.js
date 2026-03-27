import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('roadmap and CRM integration', () => {
  it('keeps the roadmap overview short and tied to CRM and contacts actions', async () => {
    const html = await readFile(new URL('../roadmap/index.html', import.meta.url), 'utf8');
    assert.match(html, /Move signal into the portal fast\./);
    assert.match(html, /Open Week 1 worksheet/);
    assert.match(html, /Add lead in CRM/);
    assert.match(html, /Add group in CRM/);
    assert.match(html, /Open shared contacts/);
    assert.match(html, /Track problems once\./);
  });

  it('keeps the March-April sprint tied to the worksheet, CRM, and contacts loop', async () => {
    const html = await readFile(new URL('../roadmap/march-april/index.html', import.meta.url), 'utf8');
    assert.match(html, /Keep this sprint short, visible, and tied to the same portal workflow/);
    assert.match(html, /Use the sprint to create cleaner records and better next steps\./);
    assert.match(html, /Open Week 1 worksheet/);
    assert.match(html, /Add lead in CRM/);
    assert.match(html, /Add group in CRM/);
    assert.match(html, /Open shared contacts/);
    assert.match(html, /Push reviewer entries into CRM or contacts as they become useful\./);
  });

  it('ships CRM capture for groups, people, problems, and quick leads', async () => {
    const html = await readFile(new URL('../crm/index.html', import.meta.url), 'utf8');
    assert.match(html, /Add the next real lead fast\./);
    assert.match(html, /Groups hold accounts, people sit under groups, and problems can link to both\./);
    assert.match(html, /id="quickLeadForm"/);
    assert.match(html, /id="recordType"/);
    assert.match(html, /id="groupId"/);
    assert.match(html, /id="linkedGroupIds"/);
    assert.match(html, /id="linkedPersonIds"/);
  });

  it('lets the week 1 worksheet push reviewer entries into CRM and contacts', async () => {
    const html = await readFile(new URL('../roadmap/march-april/week-1/index.html', import.meta.url), 'utf8');
    const script = await readFile(new URL('../roadmap/march-april/week-1/app.js', import.meta.url), 'utf8');
    assert.match(html, /Open CRM/);
    assert.match(html, /Open contacts/);
    assert.match(script, /Add lead/);
    assert.match(script, /Add group/);
    assert.match(script, /Contacts/);
    assert.match(script, /Roadmap Week 1 worksheet/);
  });

  it('keeps the week 1 worksheet shared across account switches', async () => {
    const script = await readFile(new URL('../roadmap/march-april/week-1/app.js', import.meta.url), 'utf8');
    assert.match(script, /const SHARED_WORKSHEET_KEY = 'shared';/);
    assert.match(script, /let legacyStorageKeys = \[\];/);
    assert.match(script, /legacyStorageKeys = activeIdentity\.key/);
    assert.match(script, /localStorage\.getItem\(legacyKey\)/);
    assert.match(script, /storageKey = `\$\{STORAGE_PREFIX\}\$\{SHARED_WORKSHEET_KEY\}`;/);
    assert.match(script, /\.get\(SHARED_WORKSHEET_KEY\);/);
  });
});
