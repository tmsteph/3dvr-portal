import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { auditUpworkDedupe, summarizeUpworkDedupe, upworkJobId } from '../scripts/ops/operator-crm-upwork-dedupe-audit.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const first = '022100000000000000099';
const second = '022100000000000000098';
const original = 'https://www.upwork.com/freelance-jobs/apply/Old_~' + first + '/';
const variant = 'https://upwork.com/jobs/~' + first + '?utm_source=feed';
const other = 'https://www.upwork.com/jobs/~' + second;
const row = (url, dedupe = hash(url), extra = {}) => ({
  dedupe,
  payload: JSON.stringify({ origin: 'public-research', sourceUrl: url, email: 'private@example.com', business: 'Private buyer', ...extra })
});

test('Upwork parser matches CRM identity and rejects spoofed or unrelated hosts', () => {
  assert.equal(upworkJobId(original), first);
  assert.equal(upworkJobId(variant), first);
  assert.equal(upworkJobId(other), second);
  assert.equal(upworkJobId('https://upwork.com.evil.example/jobs/~' + first), null);
  assert.equal(upworkJobId('not-a-url'), null);
});

test('read-only summary distinguishes legacy, stable and duplicate Upwork jobs without PII', () => {
  const rows = [
    row(original),
    row(variant, hash('upwork-job:' + first)),
    row(other, hash('upwork-job:' + second)),
    row('https://example.com/jobs/~' + first),
    row(original, hash('unexpected')),
    { dedupe: 'bad', payload: '{' },
    row(original, hash('inbound'), { origin: 'inbound' })
  ];
  const result = summarizeUpworkDedupe(rows);
  assert.equal(result.scannedRows, 7);
  assert.equal(result.invalidPayloadRows, 1);
  assert.equal(result.upworkRows, 4);
  assert.equal(result.legacyUrlKeyRows, 1);
  assert.equal(result.stableKeyRows, 2);
  assert.equal(result.otherKeyRows, 1);
  assert.equal(result.distinctJobs, 2);
  assert.equal(result.duplicateJobGroups, 1);
  assert.equal(result.extraDuplicateRows, 2);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.duplicateJobFingerprints.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /private@example|Private buyer|upwork\.com|022100000000000000099/);
});

test('file audit opens existing SQLite read-only and never creates a missing DB', () => {
  const dir = mkdtempSync(join(tmpdir(), '3dvr-crm-audit-'));
  const path = join(dir, 'leads.sqlite');
  const missing = join(dir, 'missing.sqlite');
  const db = new DatabaseSync(path);
  try {
    db.exec('CREATE TABLE leads (dedupe TEXT, payload TEXT)');
    db.prepare('INSERT INTO leads VALUES (?, ?)').run(hash(original), row(original).payload);
    db.close();
    const result = auditUpworkDedupe(path);
    assert.equal(result.upworkRows, 1);
    assert.equal(result.reviewRequired, false);
    assert.throws(() => auditUpworkDedupe(missing));
    assert.equal(existsSync(missing), false);
  } finally {
    if (db.isOpen) db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
