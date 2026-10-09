#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildMirrorPlan } from './import-bitwarden-export-to-secrets-manager.mjs';

export function reconcile(vault, previous = { items: [] }) {
  if (!Array.isArray(vault?.items)) throw new Error('Invalid vault snapshot');
  if (vault.items.some(item => !item.id)) throw new Error('Missing source item ID');
  const ids = vault.items.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate source item ID');
  const plan = buildMirrorPlan(vault);
  const prior = new Map(previous.items.map(item => [item.sourceItemId, item.key]));
  for (const record of plan.records) record.key = prior.get(record.record.sourceItemId) || record.key;
  plan.index.items.forEach((item, i) => { item.key = plan.records[i].key; });
  const active = new Set(plan.records.map(record => record.key));
  const retired = previous.items.filter(item => !active.has(item.key)).map(item => ({
    key: item.key, value: JSON.stringify({ deleted: true, source: 'bitwarden-password-manager' }),
  }));
  return { ...plan, retired };
}

export async function publish(plan, stores) {
  // Publish the index only after every current and retired value is confirmed in both stores.
  for (const record of [...plan.records, ...plan.retired]) {
    await stores.write(record.key, record.value);
    await stores.verify(record.key, record.value);
  }
  const value = JSON.stringify(plan.index);
  await stores.write('VAULT_INDEX', value);
  await stores.verify('VAULT_INDEX', value);
}

function run(binary, args, env = process.env, input) {
  const result = spawnSync(binary, args, {
    env, input, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) throw new Error('Credential operation failed');
  return result.stdout;
}

let phase = 'initialization';
async function main() {
  if (process.getuid() !== 0) throw new Error('Root required');
  for (const line of fs.readFileSync('/etc/3dvr/secrets-broker/bitwarden.env', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  if (!process.argv.includes('--checkpoint-existing') && !fs.existsSync('/etc/3dvr/secrets-broker/vault-session')) {
    console.log(JSON.stringify({ ok: false, state: 'owner-unlock-required' }));
    return;
  }
  const require = createRequire(import.meta.url);
  const { OpenBaoBackend } = require('/opt/3dvr/secrets-broker/openbao');
  const { BitwardenSecretsManagerBackend } = require('/opt/3dvr/secrets-broker/secrets-broker');
  const bao = new OpenBaoBackend();
  const bw = new BitwardenSecretsManagerBackend({ timeoutMs: 60000 });
  const locator = key => ({ projectName: '3dvr Agent', key });
  function readBw(key) {
    try { return bw.get(locator(key)); } catch {
      // The native CLI is the existing broker fallback when the SDK read fails.
      const projects = JSON.parse(run('/usr/local/bin/bws', ['project','list','--output','json','--color','no']));
      const project = projects.find(item => item.name === '3dvr Agent');
      if (!project) throw new Error('Project read failed');
      const entries = JSON.parse(run('/usr/local/bin/bws', ['secret','list',project.id,'--output','json','--color','no']));
      const matches = entries.filter(item => item.key === key);
      if (matches.length !== 1) throw new Error('Unique credential unavailable');
      const secret = JSON.parse(run('/usr/local/bin/bws', ['secret','get',matches[0].id,'--output','json','--color','no']));
      if (typeof secret.value !== 'string') throw new Error('Credential read failed');
      return secret.value;
    }
  }
  phase = 'read-existing-index';
  const previous = JSON.parse(readBw('VAULT_INDEX'));
  let plan;
  if (process.argv.includes('--checkpoint-existing')) {
    phase = 'read-existing-items';
    plan = { records: previous.items.map(item => ({ key: item.key, value: readBw(item.key) })),
      retired: [], index: previous };
  } else {
    const sessionFile = '/etc/3dvr/secrets-broker/vault-session';
    const stat = fs.statSync(sessionFile);
    if (stat.uid !== 0 || (stat.mode & 0o077)) throw new Error('Unsafe session permissions');
    const env = { ...process.env, BW_SESSION: fs.readFileSync(sessionFile, 'utf8').trim(), BW_NOINTERACTION: 'true',
      BITWARDENCLI_APPDATA_DIR: '/var/lib/3dvr/bitwarden-vault-cli' };
    const binary = '/home/debian/.local/bin/bw';
    const status = JSON.parse(run(binary, ['status'], env));
    if (status.status !== 'unlocked') throw new Error('Vault session unavailable');
    run(binary, ['sync'], env);
    const items = JSON.parse(run(binary, ['list', 'items'], env));
    plan = reconcile({ items: items.filter(item => !item.deletedDate) }, previous);
  }
  phase = 'project-metadata';
  const metadata = args => JSON.parse(run('/usr/local/bin/bws', [...args, '--output', 'json', '--color', 'no']));
  const project = metadata(['project', 'list']).find(item => item.name === '3dvr Agent');
  if (!project) throw new Error('Automation project unavailable');
  const entries = metadata(['secret', 'list', project.id]);
  const byKey = new Map();
  for (const item of entries) {
    if (byKey.has(item.key)) throw new Error('Duplicate automation key');
    byKey.set(item.key, item);
  }
  phase = 'verify-dual-stores';
  await publish(plan, {
    async write(key, value) {
      let currentBw;
      try { currentBw = readBw(key); } catch { if (byKey.has(key)) throw new Error('Existing credential read failed'); }
      if (currentBw !== value) {
        const result = JSON.parse(run(process.execPath, ['/opt/3dvr/secrets-broker/bitwarden-sdk-upsert.js'],
          process.env, JSON.stringify({ organizationId: project.organizationId, projectId: project.id,
            secretId: byKey.get(key)?.id || '', key, value,
            note: 'One-way Password Manager automation mirror; root credentials excluded.' })));
        if (result.failures?.length || result.results?.length !== 1) throw new Error('Write failed');
      }
      let current;
      try { current = bao.get({ key }); } catch {}
      if (current !== value) bao.create({ key, value });
    },
    async verify(key, value) {
      if (readBw(key) !== value || bao.get({ key }) !== value) throw new Error('Read-back failed');
    },
  });
  console.log(JSON.stringify({ ok: true, mode: process.argv.includes('--checkpoint-existing') ? 'existing-mirror-checkpoint' : 'live-vault-sync',
    mirrored: plan.records.length, retired: plan.retired.length, bothStoresVerified: true }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Vault sync failed at '+phase+'; previous index retained unless all writes verified. No secret values logged.'); process.exitCode = 1; });
}
