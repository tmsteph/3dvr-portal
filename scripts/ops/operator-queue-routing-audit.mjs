#!/usr/bin/env node
// Read-only comparison of Operator producer and worker queue ownership.
// Run with the effective worker service environment. Never prints raw aliases,
// task contents, credentials, or the SQLite database path.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BROWSER_OWNER_ALIAS = '3dvr-managed';
const fingerprint = value => createHash('sha256').update(value).digest('hex').slice(0, 12);

export function inspectRouting(env = process.env, exists = existsSync) {
  const explicit = String(env.THREEDVR_AGENT_OWNER_ALIAS || '').trim();
  const portal = String(env.THREEDVR_PORTAL_ACCOUNT || '').trim();
  // Mirrors agent-ops.js and task-queue-sqlite-store.js defaults.
  const gunOwner = explicit || portal || 'anonymous@3dvr';
  const sqliteOwner = explicit || 'anonymous@3dvr';
  const store = String(env.THREEDVR_AGENT_QUEUE_STORE || 'gun').toLowerCase() === 'sqlite' ? 'sqlite' : 'gun';
  const workerOwner = store === 'sqlite' ? sqliteOwner : gunOwner;
  const workerCapabilities = String(env.THREEDVR_AGENT_WORKER_CAPABILITIES || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  // Optional input from a separately verified read-only queue audit. Never
  // infer that the worker should gain a capability merely because work is queued.
  const requiredCapabilities = String(env.THREEDVR_OPERATOR_AUDIT_REQUIRED_CAPABILITIES || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const missingRequiredCapabilities = [...new Set(requiredCapabilities)]
    .filter(value => !workerCapabilities.includes(value));
  const dbPath = String(env.THREEDVR_AGENT_QUEUE_DB || '').trim()
    || join(homedir(), '.3dvr', 'task-queue.sqlite');
  return {
    mode: 'read_only_config_only',
    queueStore: store,
    workerCapabilitiesConfigured: Boolean(env.THREEDVR_AGENT_WORKER_CAPABILITIES),
    requiredCapabilitiesAudited: requiredCapabilities.length,
    missingRequiredCapabilities,
    explicitOwnerConfigured: Boolean(explicit),
    portalAccountConfigured: Boolean(portal),
    gunSqliteOwnerMatch: gunOwner === sqliteOwner,
    browserWorkerOwnerMatch: BROWSER_OWNER_ALIAS === workerOwner,
    // Signed Operator dispatch always writes the managed SQLite queue.
    // Matching aliases alone cannot make a GUN worker consume those tasks.
    browserWorkerStoreMatch: store === 'sqlite',
    ownerFingerprints: {
      browser: fingerprint(BROWSER_OWNER_ALIAS),
      gun: fingerprint(gunOwner),
      sqlite: fingerprint(sqliteOwner),
    },
    queueDbPathConfigured: Boolean(env.THREEDVR_AGENT_QUEUE_DB),
    queueDbFileExists: Boolean(exists(dbPath)),
    gunSyncExplicitlyDisabled: /^(0|false|no|off)$/i.test(String(env.THREEDVR_AGENT_QUEUE_GUN_SYNC || '')),
    warnings: [
      ...(gunOwner !== sqliteOwner ? ['GUN/SQLite owner defaults differ.'] : []),
      ...(BROWSER_OWNER_ALIAS !== workerOwner ? ['Browser producer and worker owner aliases differ.'] : []),
      ...(store !== 'sqlite' ? ['Signed Operator producer uses SQLite, but this worker uses GUN; matching owner aliases do not establish queue connectivity.'] : []),
      ...(!explicit ? ['No explicit worker owner alias; inspect effective service environment.'] : []),
      ...(missingRequiredCapabilities.length ? [env.THREEDVR_AGENT_WORKER_CAPABILITIES
        ? 'Worker cannot claim tasks requiring: ' + missingRequiredCapabilities.join(', ') + '. Do not enable stale tasks without review.'
        : 'Worker capabilities not explicitly configured; eligibility for ' + missingRequiredCapabilities.join(', ') + ' is unverified. Do not enable stale tasks without review.'] : []),
    ],
    caveat: 'Configuration only; does not establish queue contents, dispatch, or worker completion.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(inspectRouting(), null, 2) + '\n');
}
