import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImportMatchKeys,
  buildImportedCrmRecord,
  normalizePickedContacts,
  parseContactFileText,
  supportsDeviceContactPicker,
} from '../src/contacts/import.js';

test('parses iPhone-style vCards into normalized import records', () => {
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Stephens;Thomas;;;',
    'item1.EMAIL;TYPE=INTERNET:thomas@example.com',
    'item1.TEL;TYPE=CELL:(555) 123-4567',
    'ORG:3DVR Tech',
    'TITLE:Founder',
    'NOTE:Warm intro from local network.',
    'CATEGORIES:friend,builder',
    'END:VCARD',
  ].join('\n');

  const records = parseContactFileText(vcf, 'iphone.vcf', {
    now: '2026-04-04T03:30:00.000Z',
    idFactory: () => 'contact-1',
    source: 'Phone import file',
  });

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    id: 'contact-1',
    name: 'Thomas Stephens',
    email: 'thomas@example.com',
    phone: '(555) 123-4567',
    company: '3DVR Tech',
    role: 'Founder',
    tags: 'friend, builder',
    status: '',
    nextFollowUp: '',
    notes: 'Warm intro from local network.',
    created: '2026-04-04T03:30:00.000Z',
    updated: '2026-04-04T03:30:00.000Z',
    lastContacted: '',
    activityCount: 0,
    source: 'Phone import file',
  });
});

test('maps picked device contacts and reports picker support', () => {
  const navigatorLike = {
    contacts: {
      select() {},
    },
  };

  assert.equal(supportsDeviceContactPicker(navigatorLike), true);
  assert.equal(supportsDeviceContactPicker({}), false);

  const picked = normalizePickedContacts([{
    name: ['Morgan Device'],
    email: ['morgan@example.com'],
    tel: ['+1 (555) 000-0001'],
  }], {
    now: '2026-04-04T03:30:00.000Z',
    idFactory: () => 'picked-1',
    source: 'Phone import',
  });

  assert.equal(picked.length, 1);
  assert.equal(picked[0].name, 'Morgan Device');
  assert.equal(picked[0].email, 'morgan@example.com');
  assert.equal(picked[0].phone, '+1 (555) 000-0001');
  assert.equal(picked[0].source, 'Phone import');
});

test('builds CRM import records and matching keys for dedupe', () => {
  const record = buildImportedCrmRecord({
    name: 'Taylor Prospect',
    email: 'taylor@example.com',
    phone: '(555) 100-2000',
    company: 'Prospect Studio',
    notes: 'Knows Thomas from a referral.',
  }, {
    now: '2026-04-04T03:30:00.000Z',
    recordId: 'crm-1',
    source: 'Phone import',
  });

  assert.equal(record.recordType, 'person');
  assert.equal(record.id, 'crm-1');
  assert.equal(record.status, 'Warm - Awareness');
  assert.equal(record.warmth, 'warm');
  assert.match(record.tags, /source\/phone-import/);
  assert.equal(record.nextBestAction, 'Review fit and draft the first outreach.');

  const keys = buildImportMatchKeys(record);
  assert.ok(keys.includes('email:taylor@example.com'));
  assert.ok(keys.includes('phone:5551002000'));
  assert.ok(keys.includes('name:taylor prospect'));
  assert.ok(keys.includes('name-company:taylor prospect::prospect studio'));
});
