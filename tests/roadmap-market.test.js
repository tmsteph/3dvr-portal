import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('roadmap market framing', () => {
  it('keeps the roadmap overview short and action-first', async () => {
    const html = await readFile(new URL('../roadmap/index.html', import.meta.url), 'utf8');
    assert.match(html, /Move signal into paid starts\./);
    assert.match(html, /Four phases\./);
    assert.match(html, /Open Week 1 worksheet/);
    assert.match(html, /Add lead in CRM/);
    assert.match(html, /Add group in CRM/);
    assert.match(html, /Open shared contacts/);
    assert.match(html, /Track problems once\./);
  });

  it('keeps the March-April sprint led by the weekly roadmap', async () => {
    const html = await readFile(new URL('../roadmap/march-april/index.html', import.meta.url), 'utf8');
    assert.match(html, /Six weeks\. One goal: turn reviewer signal into clean records and paid starts\./);
    assert.match(html, /Weekly roadmap/);
    assert.match(html, /Push reviewer entries into CRM or contacts as they become useful\./);
    assert.match(html, /Track four numbers every Thursday\./);
    assert.match(html, /Run the same loop every week\./);
  });

  it('keeps the week 1 worksheet intro short and useful', async () => {
    const html = await readFile(new URL('../roadmap/march-april/week-1/index.html', import.meta.url), 'utf8');
    assert.match(html, /Fill this out before Thursday\./);
    assert.match(html, /Open CRM/);
    assert.match(html, /Open contacts/);
    assert.match(html, /Seven days\./);
    assert.match(html, /Use AI to compress the notes\./);
  });

  it('ships CRM fields for pain scoring and pilot readiness', async () => {
    const html = await readFile(new URL('../crm/index.html', import.meta.url), 'utf8');
    assert.match(html, /Market-fit lens/);
    assert.match(html, /Every record should answer three things/);
    assert.match(html, /id="marketSegment"/);
    assert.match(html, /id="primaryPain"/);
    assert.match(html, /id="painSeverity"/);
    assert.match(html, /id="currentWorkaround"/);
    assert.match(html, /id="pilotStatus"/);
    assert.match(html, /id="offerAmount"/);
    assert.match(html, /id="lastSignal"/);
    assert.match(html, /id="nextExperiment"/);
  });
});
