import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('roadmap market framing', () => {
  it('keeps the roadmap overview tied to real buyers, pain, and pilots', async () => {
    const html = await readFile(new URL('../roadmap/index.html', import.meta.url), 'utf8');
    assert.match(html, /Current market definition/);
    assert.match(html, /Start with real people already in reach\./);
    assert.match(html, /Use Contacts to track who they are and CRM to score repeated pain, pilot readiness,/);
    assert.match(html, /Owner-led teams who need cleaner execution\./);
    assert.match(html, /Sell relief, not software\./);
    assert.match(html, /Track objections, delays, language, and pilot readiness inside Contacts and CRM\./);
    assert.match(html, /Put 20 real people into Contacts and CRM\./);
  });

  it('keeps the March-April sprint focused on qualified warm contacts', async () => {
    const html = await readFile(new URL('../roadmap/march-april/index.html', import.meta.url), 'utf8');
    assert.match(html, /Current market focus/);
    assert.match(html, /Use this sprint to qualify a real buyer lane\./);
    assert.match(html, /Keep the March-April work tied to real people in Contacts and CRM\./);
    assert.match(html, /Send outreach to 20 warm contacts already logged in Contacts and CRM\./);
    assert.match(html, /updated CRM fields, and a clear objection list\./);
    assert.match(html, /log the reason in CRM\./);
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
