import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRecentCrmImports } from '../scripts/crm/recent-import-summary.mjs';

const NOW = Date.parse('2026-11-19T15:00:00Z');
const options = { expected: 2, recentWindowMs: 2 * 60 * 60 * 1000, now: NOW };
const lead = (updated, status = 'Lead') => ({ source: 'Lead import', updated, status });

test('unrelated CRM records cannot satisfy recent lead-import threshold', () => {
  const results = summarizeRecentCrmImports(Array.from({ length: 144 }, () => ({ source: 'Research', updated: new Date(NOW).toISOString() })), options);
  assert.equal(results.ok, false);
  assert.equal(results.totalCrmRecordsObserved, 144);
  assert.equal(results.leadImportRecordsObserved, 0);
  assert.equal(results.reason, 'no_matching_import_source_observed');
});

test('historical matching imports do not count as fresh activity', () => {
  const results = summarizeRecentCrmImports([lead('2026-11-18T11:00:00Z')], options);
  assert.equal(results.recentLeadImports, 0);
  assert.equal(results.leadImportRecordsObserved, 1);
  assert.equal(results.newestLeadImportUpdated, '2026-11-18T11:00:00.000Z');
  assert.equal(results.reason, 'no_imports_in_window_observed');
});

test('missing timestamps are reported distinctly from absent imports', () => {
  const results = summarizeRecentCrmImports([lead(''), lead('not-a-date')], options);
  assert.equal(results.leadImportsWithInvalidUpdated, 2);
  assert.equal(results.reason, 'no_valid_import_timestamps_observed');
});

test('future-dated records are not evidence of current imports', () => {
  const results = summarizeRecentCrmImports([lead('2026-11-19T16:00:00Z')], options);
  assert.equal(results.recentLeadImports, 0);
  assert.equal(results.leadImportsWithFutureUpdated, 1);
});

test('current matching imports satisfy threshold and report aggregate statuses', () => {
  const records = new Map([['one', lead('2026-11-19T14:00:00Z')], ['two', lead('2026-11-19T14:30:00Z', 'Qualified')], ['unrelated', { source: 'Other' }]]);
  const results = summarizeRecentCrmImports(records, options);
  assert.equal(results.ok, true);
  assert.equal(results.recentLeadImports, 2);
  assert.deepEqual(results.statusCounts, { Lead: 1, Qualified: 1 });
  assert.equal(results.reason, 'target_met');
});

test('below threshold is not mislabeled as zero activity', () => {
  const results = summarizeRecentCrmImports([lead('2026-11-19T14:00:00Z')], options);
  assert.equal(results.ok, false);
  assert.equal(results.reason, 'below_expected_import_count');
});
