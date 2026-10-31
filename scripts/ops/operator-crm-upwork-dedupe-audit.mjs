#!/usr/bin/env node
// Read-only, metadata-only compatibility audit for historical Upwork CRM rows.
// Never migrates, merges, deletes, contacts, or prints lead contents.
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');

// Keep the host, path, and ID checks aligned with discoveryIdentity in
// src/automation-funnel/store.js. Unknown URL forms are never merged.
export function upworkJobId(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== 'upwork.com' && url.hostname !== 'www.upwork.com') return null;
    return url.pathname.match(/^\/(?:jobs\/~|freelance-jobs\/apply\/[^/?#]*_~)(\d{12,25})(?:\/|$)/)?.[1] || null;
  } catch { return null; }
}

export function summarizeUpworkDedupe(rows) {
  const groups = new Map();
  const summary = {
    mode: 'read_only_metadata_review_not_migration',
    scannedRows: 0, invalidPayloadRows: 0, upworkRows: 0,
    stableKeyRows: 0, legacyUrlKeyRows: 0, otherKeyRows: 0,
    distinctJobs: 0, duplicateJobGroups: 0, extraDuplicateRows: 0,
    reviewRequired: false, duplicateJobFingerprints: []
  };
  for (const row of rows) {
    summary.scannedRows++;
    let lead;
    try { lead = JSON.parse(row.payload); }
    catch { summary.invalidPayloadRows++; continue; }
    if (!lead || typeof lead !== 'object' || lead.origin === 'inbound') continue;
    const id = upworkJobId(lead.sourceUrl);
    if (!id) continue;
    summary.upworkRows++;
    if (row.dedupe === hash('upwork-job:' + id)) summary.stableKeyRows++;
    else if (row.dedupe === hash(lead.sourceUrl)) summary.legacyUrlKeyRows++;
    else summary.otherKeyRows++;
    groups.set(id, (groups.get(id) || 0) + 1);
  }
  summary.distinctJobs = groups.size;
  for (const [id, count] of groups) {
    if (count <= 1) continue;
    summary.duplicateJobGroups++;
    summary.extraDuplicateRows += count - 1;
    // Fingerprints compare runs without exposing lead text, URLs or raw IDs.
    summary.duplicateJobFingerprints.push(hash('upwork-job:' + id).slice(0, 16));
  }
  summary.duplicateJobFingerprints.sort();
  summary.duplicateJobFingerprints = summary.duplicateJobFingerprints.slice(0, 20);
  summary.reviewRequired = summary.duplicateJobGroups > 0 || summary.invalidPayloadRows > 0;
  return summary;
}

export function auditUpworkDedupe(path) {
  if (typeof path !== 'string' || !path.trim() || path === ':memory:') {
    throw new Error('Existing CRM SQLite file path is required');
  }
  // readOnly ensures an incorrect path fails rather than creating a new DB.
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return summarizeUpworkDedupe(db.prepare('SELECT dedupe, payload FROM leads').all());
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(JSON.stringify(auditUpworkDedupe(process.env.AUTOMATION_FUNNEL_DB), null, 2) + '\n');
  } catch {
    console.error('Read-only CRM audit failed. Verify the existing SQLite path and schema.');
    process.exitCode = 1;
  }
}
