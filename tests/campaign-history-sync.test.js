import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeCampaignHistory,
  normalizeCampaignHistory,
  readCampaignHistory,
  writeCampaignHistory
} from '../src/money-printer/campaignHistorySync.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test('campaign history normalizes stable IDs and newest-first ordering', () => {
  const rows = normalizeCampaignHistory([
    { at: 2, subject: 'B', sent: 1, failed: 0, from: 'me@example.com' },
    { at: 1, subject: 'A', sent: 1, failed: 0, from: 'me@example.com' },
  ]);
  assert.equal(rows.length, 2);
  assert.match(rows[0].id, /^campaign-/);
  assert.equal(mergeCampaignHistory(rows, [rows[0]])[0].subject, 'B');
});

test('campaign history storage round-trips merged sends', () => {
  const storage = memoryStorage();
  writeCampaignHistory([{ at: 10, subject: 'First', sent: 1 }], storage);
  const current = readCampaignHistory(storage);
  const merged = mergeCampaignHistory(current, [{ at: 20, subject: 'Second', sent: 2 }]);
  writeCampaignHistory(merged, storage);
  assert.deepEqual(readCampaignHistory(storage).map(item => item.subject), ['Second', 'First']);
});
