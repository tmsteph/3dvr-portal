import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markCampaignLeadStatus,
  queueCampaignLeads,
  readCampaignReviewQueue
} from '../src/money-printer/campaignBridge.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}

test('Campaigns queues selected public leads into the Money Printer review queue', () => {
  const storage = memoryStorage();
  const result = queueCampaignLeads({
    storage,
    offer: 'Fast websites for cleaning companies',
    subject: 'Quick idea for {{name}}',
    body: 'Hi {{name}}, open to a quick website idea?',
    senderName: '3DVR',
    leads: [{
      name: 'Acme Cleaning',
      email: 'hello@acme.test',
      whyFit: 'Local cleaning company with a dated site.',
      sourceUrl: 'https://acme.test/contact'
    }]
  });

  assert.equal(result.queued, 1);
  const [item] = readCampaignReviewQueue(storage);
  assert.equal(item.leadContact, 'hello@acme.test');
  assert.equal(item.status, 'queued');
  assert.match(item.whyGenerated, /acme\.test\/contact/);
  assert.match(item.offerConnection, /Fast websites/);
  assert.equal(item.requiresReview, true);
});

test('Campaigns updates Money Printer send state without duplicating the lead', () => {
  const storage = memoryStorage();
  const input = {
    storage,
    offer: 'Automation setup',
    subject: 'Quick question',
    body: 'Would this be useful?',
    leads: [{ name: 'Example', email: 'team@example.test' }]
  };

  queueCampaignLeads(input);
  queueCampaignLeads(input);
  assert.equal(readCampaignReviewQueue(storage).length, 1);

  assert.equal(markCampaignLeadStatus('team@example.test', 'sent', storage), true);
  const [item] = readCampaignReviewQueue(storage);
  assert.equal(item.status, 'sent');
});
