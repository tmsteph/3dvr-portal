import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildMigration } from '../services/newsletter-store/crm-migration.mjs';

describe('Postgres CRM migration', () => {
  it('preserves source rows, deduplicates contacts, links activities, and carries suppression forward', () => {
    const leads = [
      'name,link,contact,status,date,variant',
      'Example Co,https://example.com,mailto:hello@example.com,lead,2026-07-01,a',
      'Example Co,https://example.com/,hello@example.com,warm,2026-07-02,b',
      'No Email,https://no-email.test,,lead,2026-07-03,a'
    ].join('\n');
    const events = [
      { timestamp: '2026-07-04T00:00:00Z', kind: 'email', status: 'sent', name: 'Example Co', site: 'https://example.com', contact: 'mailto:hello@example.com', subject: 'Hello' },
      { timestamp: '2026-07-05T00:00:00Z', kind: 'email', status: 'unsubscribed', name: 'Example Co', contact: 'hello@example.com', note: 'Please unsubscribe' },
      { timestamp: '2026-07-06T00:00:00Z', kind: 'email', status: 'sent', name: 'Activity Only', contact: 'new@example.test' }
    ].map(row => JSON.stringify(row)).join('\n');

    const migration = buildMigration(leads, events);
    assert.equal(migration.report.leadsSeen, 3);
    assert.equal(migration.report.contactsPrepared, 3);
    assert.equal(migration.report.duplicateLeads, 1);
    assert.equal(migration.report.activitiesPrepared, 3);
    assert.equal(migration.report.unmatchedActivities, 0);
    assert.equal(migration.report.contactsFromActivities, 1);
    assert.equal(migration.rawRecords.length, 6);
    assert.equal(migration.contacts.find(contact => contact.email === 'hello@example.com')?.suppressed, true);
    assert.equal(migration.report.suppressedContacts, 1);
  });

  it('defines append-safe canonical CRM tables and does not enable outreach', async () => {
    const schema = await readFile(new URL('../services/newsletter-store/schema.sql', import.meta.url), 'utf8');
    const script = await readFile(new URL('../services/newsletter-store/crm-migration.mjs', import.meta.url), 'utf8');
    for (const table of ['crm_import_runs', 'crm_contacts', 'crm_activities', 'crm_raw_records']) {
      assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    }
    assert.match(script, /const apply = argv\.includes\('--apply'\)/);
    assert.doesNotMatch(script, /sendMail|send-outreach|AUTO_SEND/);
  });
});
