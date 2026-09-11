import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crmSummary, readCrmContact, searchCrmContacts } from '../services/newsletter-store/crm-read.mjs';

function poolWith(handler) {
  return { query: async (sql, values = []) => handler(String(sql), values) };
}

const contact = {
  contact_id: 'contact-1', record_type: 'lead', name: 'Ada', company: 'Example Co',
  email: 'ada@example.com', phone: '555-0100', website: 'https://example.com',
  status: 'qualified', source: 'import', consent_status: 'unknown', suppressed: false,
  suppression_reason: null, raw_data: { secret: 'must-not-leak' },
  created_at: new Date('2026-09-01T00:00:00Z'), updated_at: new Date('2026-09-10T00:00:00Z'),
};

describe('newsletter-store CRM read model', () => {
  it('returns summary data without raw import payloads', async () => {
    const pool = poolWith(sql => {
      if (sql.includes('COUNT(*)::int AS total')) return { rows: [{ total: 12, suppressed: 1, with_email: 9 }] };
      if (sql.includes('GROUP BY 1')) return { rows: [{ status: 'qualified', count: 4 }] };
      return { rows: [contact] };
    });
    const result = await crmSummary(pool);
    assert.equal(result.total, 12);
    assert.equal(result.recentlyUpdated[0].contactId, 'contact-1');
    assert.equal('raw_data' in result.recentlyUpdated[0], false);
  });

  it('excludes suppressed contacts by default and parameterizes the search', async () => {
    let observedSql = '';
    let observedValues = [];
    const pool = poolWith((sql, values) => {
      observedSql = sql; observedValues = values; return { rows: [contact] };
    });
    const result = await searchCrmContacts(pool, { query: 'Ada', limit: 5 });
    assert.match(observedSql, /suppressed = FALSE/);
    assert.match(observedSql, /ILIKE \$1/);
    assert.deepEqual(observedValues, ['%Ada%', 5]);
    assert.equal(result.contacts[0].email, 'ada@example.com');
  });

  it('returns activity metadata without activity bodies', async () => {
    const pool = poolWith(sql => {
      if (sql.includes('FROM crm_contacts WHERE')) return { rows: [contact] };
      return { rows: [{
        activity_id: 'activity-1', activity_type: 'email', channel: 'email', status: 'sent',
        occurred_at: new Date('2026-09-10T01:00:00Z'), subject: 'Hello', source: 'agent',
        body: 'must-not-leak', created_at: new Date('2026-09-10T01:00:00Z'),
      }] };
    });
    const result = await readCrmContact(pool, { contactId: 'contact-1', activityLimit: 3 });
    assert.equal(result.contact.contactId, 'contact-1');
    assert.equal(result.activities[0].subject, 'Hello');
    assert.equal('body' in result.activities[0], false);
  });
});
