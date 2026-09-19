import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markLeadVaultStatus,
  readLeadVault,
  saveDiscoveredLeads
} from '../src/money-printer/leadVault.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}

test('Lead Vault saves verified discovery details and deduplicates by email', () => {
  const storage = memoryStorage();
  const lead = {
    name: 'Acme Cleaning',
    email: 'HELLO@ACME.TEST',
    website: 'https://acme.test',
    location: 'San Diego',
    whyFit: 'Needs a clearer booking path.',
    evidence: 'Public site has no booking CTA.',
    sourceUrl: 'https://acme.test/contact'
  };

  const first = saveDiscoveredLeads({
    storage,
    leads: [lead],
    offer: 'Website conversion help',
    campaignDraft: { subject: 'Quick idea', body: 'Hello' },
    now: new Date('2026-09-19T01:00:00Z')
  });
  const second = saveDiscoveredLeads({
    storage,
    leads: [{ ...lead, whyFit: 'Updated fit.' }],
    now: new Date('2026-09-19T02:00:00Z')
  });

  assert.equal(first.added, 1);
  assert.equal(second.added, 0);
  const [saved] = readLeadVault(storage);
  assert.equal(saved.email, 'hello@acme.test');
  assert.equal(saved.status, 'discovered');
  assert.equal(saved.whyFit, 'Updated fit.');
  assert.equal(saved.offer, 'Website conversion help');
  assert.equal(saved.draftSubject, 'Quick idea');
});

test('Lead Vault advances status without downgrading a contacted lead', () => {
  const storage = memoryStorage();
  saveDiscoveredLeads({
    storage,
    leads: [{ name: 'Example', email: 'team@example.test', sourceUrl: 'https://example.test' }]
  });

  assert.equal(markLeadVaultStatus('team@example.test', 'selected', storage), true);
  assert.equal(readLeadVault(storage)[0].status, 'selected');

  assert.equal(markLeadVaultStatus('team@example.test', 'sent', storage), true);
  assert.equal(readLeadVault(storage)[0].status, 'sent');

  markLeadVaultStatus('team@example.test', 'selected', storage);
  assert.equal(readLeadVault(storage)[0].status, 'sent');
});
