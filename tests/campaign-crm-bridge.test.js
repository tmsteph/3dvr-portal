import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCampaignCrmRecord,
  buildCampaignCrmTouch,
  campaignCrmRecordId,
  normalizeCampaignCrmEmail,
} from '../src/money-printer/campaignCrmBridge.js';

test('Campaign CRM bridge creates stable email-derived IDs', () => {
  assert.equal(normalizeCampaignCrmEmail(' Sales@Example.COM '), 'sales@example.com');
  assert.equal(campaignCrmRecordId('sales@example.com'), campaignCrmRecordId(' SALES@example.com '));
  assert.match(campaignCrmRecordId('sales@example.com'), /^campaign-sales-example-com-/);
});

test('Campaign CRM bridge preserves existing CRM fields while logging outreach', () => {
  const sentAt = new Date('2026-09-23T04:39:10.000Z');
  const record = buildCampaignCrmRecord({
    recipient: { name: 'El Indio', email: 'elindio@example.com' },
    existing: {
      id: 'crm-existing',
      email: 'elindio@example.com',
      status: 'Warm - Discovery',
      warmth: 'warm',
      activityCount: 4,
      tags: 'customer/local',
      notes: 'Keep this note',
    },
    subject: 'Small catering inquiry idea',
    offer: '$200 pilot',
    sentAt,
  });

  assert.equal(record.id, 'crm-existing');
  assert.equal(record.status, 'Warm - Discovery');
  assert.equal(record.warmth, 'warm');
  assert.equal(record.activityCount, 5);
  assert.equal(record.notes, 'Keep this note');
  assert.match(record.tags, /source\/campaigns/);
  assert.equal(record.lastContacted, sentAt.toISOString());
  assert.match(record.lastSignal, /Small catering inquiry idea/);
});

test('Campaign CRM touch uses the shared outreach-sent shape', () => {
  const touch = buildCampaignCrmTouch({
    record: {
      id: 'crm-existing',
      name: 'French Twist',
      email: 'hello@example.com',
      status: 'Prospect',
    },
    subject: 'Quick idea',
    senderEmail: 'sender@example.com',
    gmailMessageId: 'gmail-123',
    sentAt: new Date('2026-09-23T04:38:49.000Z'),
    participantId: '~portal',
    loggedBy: 'tmsteph',
  });

  assert.equal(touch.touchType, 'outreach-sent');
  assert.equal(touch.touchTypeLabel, 'Outreach sent');
  assert.equal(touch.source, '3DVR Campaigns');
  assert.equal(touch.crmRecordId, 'crm-existing');
  assert.equal(touch.gmailMessageId, 'gmail-123');
  assert.equal(touch.senderEmail, 'sender@example.com');
  assert.match(touch.note, /Quick idea/);
});
