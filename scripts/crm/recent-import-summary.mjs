/**
 * Summarize an observed CRM relay snapshot without exposing customer fields.
 * This is a freshness diagnostic, not evidence of an authenticated Operator worker.
 */
export function summarizeRecentCrmImports(records, {
  expected = 15,
  recentWindowMs = 2 * 60 * 60 * 1000,
  now = Date.now(),
} = {}) {
  const values = records instanceof Map ? [...records.values()] : [...records];
  const cutoff = now - recentWindowMs;
  const leadImports = values.filter(record => record && typeof record === 'object' && record.source === 'Lead import');
  const datedImports = leadImports.map(record => ({
    record,
    updatedMs: Date.parse(String(record.updated ?? '')),
  }));
  const validDates = datedImports.filter(({ updatedMs }) => Number.isFinite(updatedMs));
  // A future timestamp cannot prove an import occurred in the observation window.
  const futureDates = validDates.filter(({ updatedMs }) => updatedMs > now);
  const recentImports = validDates.filter(({ updatedMs }) => updatedMs >= cutoff && updatedMs <= now);
  const latestMs = validDates.length ? Math.max(...validDates.map(({ updatedMs }) => updatedMs)) : null;
  const statusCounts = recentImports.reduce((acc, { record }) => {
    const status = String(record.status || 'Unknown');
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const ok = recentImports.length >= expected;
  const reason = ok ? 'target_met'
    : !leadImports.length ? 'no_matching_import_source_observed'
    : !validDates.length ? 'no_valid_import_timestamps_observed'
    : !recentImports.length ? 'no_imports_in_window_observed'
    : 'below_expected_import_count';
  return {
    ok,
    expected,
    recentLeadImports: recentImports.length,
    totalCrmRecordsObserved: values.length,
    leadImportRecordsObserved: leadImports.length,
    leadImportsWithValidUpdated: validDates.length,
    leadImportsWithInvalidUpdated: datedImports.length - validDates.length,
    leadImportsWithFutureUpdated: futureDates.length,
    newestLeadImportUpdated: latestMs === null ? null : new Date(latestMs).toISOString(),
    recentWindowMs,
    reason,
    statusCounts,
  };
}
