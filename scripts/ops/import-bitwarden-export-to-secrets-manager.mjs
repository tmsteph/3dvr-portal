#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TYPE_NAMES = { 1: 'login', 2: 'note', 3: 'card', 4: 'identity', 5: 'ssh-key' };

export function slug(value, max = 56) {
  const out = String(value || 'ITEM').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  return (out || 'ITEM').slice(0, max);
}

export function isRootOfTrustItem(item = {}) {
  const name = String(item.name || '');
  const uris = Array.isArray(item?.login?.uris) ? item.login.uris.map(entry => String(entry?.uri || '')) : [];
  if (uris.some(uri => /(^|\.)bitwarden\.(com|eu)(\/|$)/i.test(uri.replace(/^https?:\/\//i, '')))) return true;
  return /bitwarden.*(master|recovery|vault)|master\s+password|recovery\s+(key|code)|seed\s+phrase|mnemonic|wallet\s+seed|passkey\s+(private|backup)/i.test(name);
}

export function mirrorRecord(item = {}, options = {}) {
  const type = Number(item.type || 0);
  const typeName = TYPE_NAMES[type] || 'unknown';
  if (isRootOfTrustItem(item) && !options.includeRoot) return { skipped: 'root-of-trust' };
  if (type === 3 && !options.includeCards) return { skipped: 'card' };
  if (type === 4 && !options.includeIdentities) return { skipped: 'identity' };
  if (type === 5 && !options.includeSsh) return { skipped: 'ssh-key' };
  if (![1, 2, 3, 4, 5].includes(type)) return { skipped: 'unsupported' };

  const id = String(item.id || '').trim();
  const idShort = slug(id.replace(/-/g, ''), 12);
  const key = `VAULT_ITEM__${slug(typeName, 16)}__${slug(item.name)}__${idShort || 'NOID'}`.slice(0, 240);
  const fields = Array.isArray(item.fields)
    ? item.fields.map(field => ({ name: field?.name ?? null, value: field?.value ?? null, type: field?.type ?? null }))
    : [];
  const record = {
    version: 1,
    source: 'bitwarden-password-manager',
    sourceItemId: id || null,
    type: typeName,
    name: item.name || '',
    favorite: Boolean(item.favorite),
    reprompt: item.reprompt ?? 0,
    folderId: item.folderId ?? null,
    organizationId: item.organizationId ?? null,
    collectionIds: item.collectionIds ?? null,
    notes: item.notes ?? null,
    fields,
  };
  if (type === 1) {
    record.login = {
      username: item?.login?.username ?? null,
      password: item?.login?.password ?? null,
      totp: item?.login?.totp ?? null,
      uris: Array.isArray(item?.login?.uris)
        ? item.login.uris.map(uri => ({ uri: uri?.uri ?? null, match: uri?.match ?? null }))
        : [],
    };
  } else if (type === 2) {
    record.secureNote = item.secureNote || {};
  } else if (type === 3) {
    record.card = item.card || {};
  } else if (type === 4) {
    record.identity = item.identity || {};
  } else if (type === 5) {
    record.sshKey = item.sshKey || {};
  }
  return { key, value: JSON.stringify(record), record };
}

export function buildMirrorPlan(vault = {}, options = {}) {
  const items = Array.isArray(vault.items) ? vault.items : [];
  const records = [];
  const skipped = {};
  for (const item of items) {
    const result = mirrorRecord(item, options);
    if (result.skipped) {
      skipped[result.skipped] = (skipped[result.skipped] || 0) + 1;
      continue;
    }
    records.push(result);
  }
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'bitwarden-password-manager',
    count: records.length,
    items: records.map(({ key, record }) => ({
      key,
      sourceItemId: record.sourceItemId,
      name: record.name,
      type: record.type,
      uris: record.login?.uris?.map(entry => entry.uri).filter(Boolean) || [],
    })),
  };
  return { records, index, skipped, total: items.length };
}

function parseArgs(argv) {
  const out = { projectName: '3dvr Agent' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') out.input = argv[++i];
    else if (arg === '--project-name') out.projectName = argv[++i];
    else if (arg === '--include-cards') out.includeCards = true;
    else if (arg === '--include-identities') out.includeIdentities = true;
    else if (arg === '--include-ssh') out.includeSsh = true;
    else if (arg === '--include-root') out.includeRoot = true;
    else if (arg === '--delete-source') out.deleteSource = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.input) throw new Error('--input is required');
  return out;
}

function runJson(binary, args, env = process.env) {
  const result = spawnSync(binary, args, { env, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(`Bitwarden metadata command failed: ${args.slice(0, 2).join(' ')}`);
  return JSON.parse(result.stdout || 'null');
}

function upsert(helper, env, payload) {
  const result = spawnSync(process.execPath, [helper], {
    env,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) throw new Error('Bitwarden secret upsert failed');
  return JSON.parse(result.stdout || '{}');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = path.resolve(options.input);
  fs.chmodSync(source, 0o600);
  const vault = JSON.parse(fs.readFileSync(source, 'utf8'));
  if (vault.encrypted === true) throw new Error('Use a plaintext JSON export for this one-time local migration');
  const plan = buildMirrorPlan(vault, options);
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, total: plan.total, mirror: plan.records.length, skipped: plan.skipped })}\n`);
    return;
  }

  const env = process.env;
  if (!String(env.BWS_ACCESS_TOKEN || '').trim()) throw new Error('BWS_ACCESS_TOKEN is required');
  const bws = env.BWS_BIN || '/usr/local/bin/bws';
  const helper = env.BWS_UPSERT_HELPER || '/opt/3dvr/secrets-broker/bitwarden-sdk-upsert.js';
  if (!fs.existsSync(helper)) throw new Error('Bitwarden SDK upsert helper is unavailable');
  const projects = runJson(bws, ['project', 'list', '--output', 'json', '--color', 'no'], env);
  const project = Array.isArray(projects) ? projects.find(entry => String(entry?.name || '').toLowerCase() === String(options.projectName).toLowerCase()) : null;
  if (!project?.id || !project?.organizationId) throw new Error('Target Secrets Manager project was not found');
  const existing = runJson(bws, ['secret', 'list', project.id, '--output', 'json', '--color', 'no'], env);
  const byKey = new Map((Array.isArray(existing) ? existing : []).map(entry => [String(entry.key || ''), entry]));

  let created = 0;
  let updated = 0;
  for (const record of plan.records) {
    const current = byKey.get(record.key);
    const result = upsert(helper, env, {
      organizationId: project.organizationId,
      projectId: project.id,
      secretId: current?.id || '',
      key: record.key,
      value: record.value,
      note: 'Mirrored from Bitwarden Password Manager for scoped 3DVR automation. Do not expose this value in chat or logs.',
    });
    if (result.updated) updated += 1; else created += 1;
  }

  const indexKey = 'VAULT_INDEX';
  const indexCurrent = byKey.get(indexKey);
  const indexResult = upsert(helper, env, {
    organizationId: project.organizationId,
    projectId: project.id,
    secretId: indexCurrent?.id || '',
    key: indexKey,
    value: JSON.stringify(plan.index),
    note: 'Non-secret lookup index for mirrored Password Manager items. Item values live in VAULT_ITEM__* secrets.',
  });
  if (indexResult.updated) updated += 1; else created += 1;

  if (options.deleteSource) {
    try {
      const shred = spawnSync('shred', ['-u', '-z', source], { stdio: 'ignore' });
      if (shred.status !== 0) fs.rmSync(source, { force: true });
    } catch { fs.rmSync(source, { force: true }); }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, total: plan.total, mirrored: plan.records.length, created, updated, skipped: plan.skipped, sourceDeleted: Boolean(options.deleteSource) })}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(error => { process.stderr.write(`vault-mirror: ${error.message}\n`); process.exitCode = 1; });
