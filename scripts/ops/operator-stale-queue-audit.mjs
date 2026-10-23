#!/usr/bin/env node
// Read-only, metadata-only triage for the existing managed SQLite queue.
// Never prints task text, owner aliases, DB paths, credentials or raw task IDs.
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const csv = value => [...new Set(String(value || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean))];
const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = record => hash(String(record.backend || '').toLowerCase() + '\0' + String(record.task || '').toLowerCase().trim().replace(/\s+/g, ' '));
const bump = (object, key) => { object[key] = (object[key] || 0) + 1; };

export function summarizeQueue(records, env = {}, now = Date.now()) {
  const caps = new Set(csv(env.THREEDVR_AGENT_WORKER_CAPABILITIES || 'node,auto,codex,openai,claude,openclaw,shell'));
  const allowedRisks = new Set(csv(env.THREEDVR_AGENT_WORKER_RISK_CLASSES || 'read_only,draft,workspace_write'));
  const completed = new Set(records.filter(r => r.status === 'completed').map(fingerprint));
  const summary = {
    mode: 'read_only_metadata_review_not_execution_authorization',
    total: records.length, statusCounts: {}, queuedAgeBuckets: {},
    queuedCapabilities: {}, queuedRisks: {}, queuedApprovals: {},
    reviewFlags: {}, queuedReviews: []
  };
  for (const record of records) {
    bump(summary.statusCounts, record.status || 'unknown');
    if (record.status !== 'queued') continue;
    const created = Date.parse(record.createdAt || record.updatedAt || '');
    const days = Number.isFinite(created) && created <= now ? (now - created) / 86400000 : null;
    bump(summary.queuedAgeBuckets, days === null ? 'unknown' : days > 30 ? '>30d' : days > 7 ? '7-30d' : '<=7d');
    const backend = String(record.backend || 'auto').toLowerCase();
    const required = new Set(csv(record.requiredCapabilities || record.requires || (backend === 'health' ? '' : backend)));
    if (backend !== 'auto' && backend !== 'health') required.add(backend);
    const missing = [...required].filter(capability => !caps.has(capability));
    for (const capability of required) bump(summary.queuedCapabilities, capability);
    const risk = String(record.riskClass || 'draft').toLowerCase();
    const approval = String(record.approvalStatus || 'unknown').toLowerCase();
    bump(summary.queuedRisks, risk);
    bump(summary.queuedApprovals, approval);
    const flags = [];
    if (days === null || days > 7) flags.push('stale_or_unknown_age');
    if (missing.length) flags.push('missing_capability');
    if (!allowedRisks.has(risk)) flags.push('risk_not_allowed');
    if (['required', 'pending', 'rejected', 'denied'].includes(approval)) flags.push('approval_block');
    if (record.unsafe) flags.push('unsafe_flag');
    if (completed.has(fingerprint(record))) flags.push('possible_prior_completion');
    if (['auto', 'shell'].includes(backend)) flags.push('requires_intent_review');
    if (!flags.length) flags.push('metadata_eligible_not_authorized');
    for (const flag of flags) bump(summary.reviewFlags, flag);
    summary.queuedReviews.push({
      idHash: hash(String(record.id || '')).slice(0, 10),
      ageDays: days === null ? null : Math.round(days * 10) / 10,
      backend, risk, approval, flags
    });
  }
  return summary;
}

export function auditManagedSqlite(env = process.env) {
  if (String(env.THREEDVR_AGENT_QUEUE_STORE || '').toLowerCase() !== 'sqlite' ||
      !String(env.THREEDVR_AGENT_OWNER_ALIAS || '').trim()) {
    throw new Error('Explicit managed SQLite store and owner are required.');
  }
  const path = env.THREEDVR_AGENT_QUEUE_DB || join(homedir(), '.3dvr', 'task-queue.sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = db.prepare('SELECT status, record_json FROM tasks WHERE owner_alias = ?')
      .all(env.THREEDVR_AGENT_OWNER_ALIAS);
    return summarizeQueue(rows.map(row => ({ ...JSON.parse(row.record_json), status: row.status })), env);
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(JSON.stringify(auditManagedSqlite(), null, 2) + '\n');
  } catch {
    console.error('Read-only queue audit failed. Verify effective SQLite/owner configuration.');
    process.exitCode = 1;
  }
}
