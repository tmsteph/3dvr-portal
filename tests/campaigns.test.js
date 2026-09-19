import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildCommercialFooter,
  composeMessage,
  filterSuppressed,
  parseRecipients,
  remainingDailyAllowance,
  validateCampaign,
} from '../campaigns/core.js';

test('campaign recipient parser deduplicates and preserves display names', () => {
  assert.deepEqual(parseRecipients('Jane Doe <Jane@Example.com>\njane@example.com\nhello@shop.test'), [
    { name: 'Jane Doe', email: 'jane@example.com' },
    { name: '', email: 'hello@shop.test' },
  ]);
});

test('commercial campaign footer provides disclosure, address, and opt out', () => {
  const footer = buildCommercialFooter({ businessName: 'Pako Studio', postalAddress: '123 Main St, San Diego, CA' });
  assert.match(footer, /Business offer from Pako Studio/);
  assert.match(footer, /123 Main St/);
  assert.match(footer, /unsubscribe or stop/i);
});

test('message personalization and suppression are deterministic', () => {
  const recipients = parseRecipients('Pako Test <pako@example.com>\nblocked@example.com');
  assert.equal(filterSuppressed(recipients, ['blocked@example.com']).length, 1);
  const message = composeMessage({
    body: 'Hey {{first_name}} — {{email}}',
    recipient: recipients[0],
    businessName: 'Pako Studio',
    postalAddress: '123 Main St',
  });
  assert.match(message, /Hey Pako — pako@example.com/);
  assert.match(message, /reply unsubscribe or stop/i);
});

test('campaign validation requires sender identity, address, recipients, and source acknowledgement', () => {
  const invalid = validateCampaign({ subject: 'Hi', body: 'Body', recipients: [{ email: 'x@example.com' }] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.length >= 3);
  const valid = validateCampaign({
    subject: 'Hi', body: 'Body', businessName: 'Studio', postalAddress: '123 Main St',
    recipients: [{ email: 'x@example.com' }], sourceAcknowledged: true,
  });
  assert.equal(valid.ok, true);
});

test('daily beta allowance cannot exceed configured cap', () => {
  assert.equal(remainingDailyAllowance(0, 25), 25);
  assert.equal(remainingDailyAllowance(24, 25), 1);
  assert.equal(remainingDailyAllowance(30, 25), 0);
});

test('campaign page exposes Gmail OAuth, CSV import, suppression, and test send controls', async () => {
  const html = await readFile(new URL('../campaigns/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../campaigns/app.js', import.meta.url), 'utf8');
  assert.match(html, /3DVR Campaigns/);
  assert.match(html, /Import CSV/);
  assert.match(html, /Suppression list/);
  assert.match(html, /Send test to myself/);
  assert.match(html, /AI CUSTOMER FINDER/);
  assert.match(html, /Find customers/);
  assert.match(html, /What are you selling/);
  assert.match(html, /Location <span class="muted">\(optional\)<\/span>/);
  assert.doesNotMatch(html, /id="leadLocation" value="San Diego, CA"/);
  assert.match(js, /scopeKey=gmail-send/);
  assert.match(js, /action=sendmail/);
  assert.match(js, /provider=lead-finder/);
  assert.match(js, /campaignDraft/);
  assert.match(js, /addSelectedLeads/);
  assert.match(js, /DAILY_CAP = 25/);
});
