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
const APPROVAL_REQUIRED_RISKS = new Set(['external_write', 'money', 'credential']);
// Queue fields can originate from imported/user-supplied tasks. This report is
// metadata-only: never echo arbitrary labels (including secret task fragments).
const STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'blocked', 'cancelled', 'canceled', 'pending', 'waiting', 'expired']);
const BACKENDS = new Set(['auto', 'node', 'codex', 'openai', 'claude', 'openclaw', 'shell', 'health']);
const RISKS = new Set(['read_only', 'draft', 'workspace_write', 'external_write', 'money', 'credential']);
const APPROVALS = new Set(['approved', 'not_required', 'required', 'expired', 'pending', 'denied', 'rejected', 'unknown']);
const CAPABILITIES = new Set([...BACKENDS, 'static-hosting', 'crm-read', 'crm-write', 'browser', 'research']);
const safeLabel = (value, allowed) => {
  const label = String(value || '').trim().toLowerCase();
  return allowed.has(label) ? label : 'other';
};

export function summarizeQueue(records, env = {}, now = Date.now()) {
  // Missing service configuration is unknown, never evidence of worker eligibility.
  const workerCapabilitiesConfigured = Boolean(String(env.THREEDVR_AGENT_WORKER_CAPABILITIES || '').trim());
  const caps = new Set(csv(env.THREEDVR_AGENT_WORKER_CAPABILITIES));
  const allowedRisks = new Set(csv(env.THREEDVR_AGENT_WORKER_RISK_CLASSES || 'read_only,draft,workspace_write'));
  const completed = new Set(records.filter(r => r.status === 'completed').map(fingerprint));
  const summary = {
    mode: 'read_only_metadata_review_not_execution_authorization',
    workerCapabilitiesConfigured,
    total: records.length, statusCounts: {}, runningClaims: { active: 0, expired: 0, unknown: 0 }, queuedAgeBuckets: {},
    queuedCapabilities: {}, queuedSources: {}, queuedRisks: {}, queuedEffectiveRisks: {}, queuedApprovals: {},
    reviewFlags: {}, queuedReviews: []
  };
  for (const record of records) {
    bump(summary.statusCounts, safeLabel(record.status, STATUSES));
    if (record.status === 'running') {
      // Running claims must never be treated as replayable queued work. Only
      // aggregate lease state is reported; no claim tokens or task IDs.
      const expiry = record.claimExpiresAt == null ? NaN : Number(record.claimExpiresAt);
      const leaseState = !Number.isFinite(expiry) || expiry <= 0 ? 'unknown'
        : expiry <= now ? 'expired' : 'active';
      bump(summary.runningClaims, leaseState);
      continue;
    }
    if (record.status !== 'queued') continue;
    // Source is trusted only as a coarse classification. Never expose arbitrary
    // producer-supplied strings, which could contain private task metadata.
    const source = ['operator-http', 'gun', 'sqlite'].includes(record.source) ? record.source : 'other';
    bump(summary.queuedSources, source);
    const created = Date.parse(record.createdAt || record.updatedAt || '');
    const days = Number.isFinite(created) && created <= now ? (now - created) / 86400000 : null;
    bump(summary.queuedAgeBuckets, days === null ? 'unknown' : days > 30 ? '>30d' : days > 7 ? '7-30d' : '<=7d');
    const rawBackend = String(record.backend || 'auto').trim().toLowerCase();
    const backend = safeLabel(rawBackend, BACKENDS);
    const required = new Set(csv(record.requiredCapabilities || record.requires || (rawBackend === 'health' ? '' : rawBackend)));
    // Match worker admission: even an explicit weaker requires list cannot
    // omit the executable auto backend capability.
    if (rawBackend !== 'health') required.add(rawBackend);
    const missing = [...required].filter(capability => !caps.has(capability));
    const unrecognizedCapability = [...required].some(capability => !CAPABILITIES.has(capability));
    for (const capability of required) bump(summary.queuedCapabilities, safeLabel(capability, CAPABILITIES));
    const risk = safeLabel(record.riskClass || 'draft', RISKS);
    // The live worker treats unknown risks as external_write, not low risk.
    // Never print the unknown label or classify it as safe.
    const effectiveRisk = risk === 'other' || (record.unsafe && !APPROVAL_REQUIRED_RISKS.has(risk))
      ? 'external_write' : risk;
    const approval = safeLabel(record.approvalStatus || 'unknown', APPROVALS);
    bump(summary.queuedRisks, risk);
    bump(summary.queuedEffectiveRisks, effectiveRisk);
    bump(summary.queuedApprovals, approval);
    const flags = [];
    if (backend === 'other') flags.push('unrecognized_backend');
    if (risk === 'other') flags.push('unrecognized_risk');
    if (unrecognizedCapability) flags.push('unrecognized_capability');
    if (days === null || days > 7) flags.push('stale_or_unknown_age');
    if (!workerCapabilitiesConfigured) flags.push('worker_capabilities_unverified');
    else if (missing.length) flags.push('missing_capability');
    if (!allowedRisks.has(effectiveRisk)) flags.push('risk_not_allowed');
    // Match the live worker approval gate. Imported/expired approvals must
    // not appear metadata-eligible, and high-risk tasks need explicit approval.
    const approvalValue = String(record.approvalStatus || '').trim().toLowerCase();
    const approvalRequired = APPROVAL_REQUIRED_RISKS.has(effectiveRisk);
    if ((approvalValue && !['approved', 'not_required'].includes(approvalValue))
      || (approvalRequired && approvalValue !== 'approved')) flags.push('approval_block');
    // The live worker rejects every high-risk task until a task-bound,
    // authenticated approval verifier exists, even when status says approved.
    if (approvalRequired) flags.push('approval_verification_unavailable');
    if (record.unsafe) flags.push('unsafe_flag');
    if (completed.has(fingerprint(record))) flags.push('possible_prior_completion');
    if (['auto', 'shell'].includes(backend)) flags.push('requires_intent_review');
    if (!flags.length) flags.push('metadata_eligible_not_authorized');
    for (const flag of flags) bump(summary.reviewFlags, flag);
    summary.queuedReviews.push({
      idHash: hash(String(record.id || '')).slice(0, 10),
      ageDays: days === null ? null : Math.round(days * 10) / 10,
      backend, risk, effectiveRisk, approval, flags
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
    // Older queue fixtures/stores may lack the source column. Keep the audit
    // read-only and classify those records as 'other' instead of failing.
    const hasSource = db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'source');
    const sourceColumn = hasSource ? 'source' : 'NULL AS source';
    const rows = db.prepare(`SELECT status, record_json, claim_expires_at, ${sourceColumn} FROM tasks WHERE owner_alias = ?`)
      .all(env.THREEDVR_AGENT_OWNER_ALIAS);
    return summarizeQueue(rows.map(row => ({
      ...JSON.parse(row.record_json), status: row.status, source: row.source, claimExpiresAt: row.claim_expires_at
    })), env);
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
