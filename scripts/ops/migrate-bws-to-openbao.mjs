#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const addr = String(process.env.BAO_ADDR || 'http://127.0.0.1:8200').replace(/\/+$/, '');
const token = String(process.env.BAO_TOKEN || '').trim();
const mount = String(process.env.THREEDVR_OPENBAO_MOUNT || 'kv').replace(/^\/+|\/+$/g, '');
const projectName = String(process.env.THREEDVR_BWS_PROJECT || '3dvr Agent').trim();
const bws = process.env.BWS_BIN || '/usr/local/bin/bws';

if (!token) throw new Error('BAO_TOKEN is required');
if (!process.env.BWS_ACCESS_TOKEN) throw new Error('BWS_ACCESS_TOKEN is required');
if (!/^[A-Za-z0-9_-]+$/.test(mount)) throw new Error('invalid OpenBao mount name');

function hash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function bwsJson(args) {
  const result = spawnSync(bws, [...args, '--output', 'json', '--color', 'no'], {
    env: process.env,
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`bws failed: ${args.slice(0, 2).join(' ')}`);
  try { return JSON.parse(result.stdout); }
  catch { throw new Error('bws returned invalid JSON'); }
}

async function baoWrite(path, data) {
  const response = await fetch(`${addr}/v1/${encodeURIComponent(mount)}/data/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vault-Token': token,
    },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = Array.isArray(body?.errors) ? body.errors.join('; ') : '';
    } catch {}
    throw new Error(detail || `OpenBao write failed (${response.status})`);
  }
}

const projects = bwsJson(['project', 'list']);
const project = Array.isArray(projects)
  ? projects.find(row => String(row?.name || '').trim().toLowerCase() === projectName.toLowerCase())
  : null;
if (!project?.id) throw new Error(`Bitwarden project not found: ${projectName}`);

const rows = bwsJson(['secret', 'list', project.id]);
if (!Array.isArray(rows)) throw new Error('Bitwarden secret list was not an array');

let migrated = 0;
for (const row of rows) {
  const id = String(row?.id || '').trim();
  if (!id) continue;
  const secret = bwsJson(['secret', 'get', id]);
  const key = String(secret?.key || row?.key || '').trim();
  const value = secret?.value;
  if (!key || typeof value !== 'string') throw new Error(`Bitwarden secret ${id} is missing key/value`);
  const data = { key, value, source_id: id, migrated_from: 'bitwarden-secrets-manager' };
  await baoWrite(`runtime/by-key/${hash(key)}`, data);
  await baoWrite(`runtime/by-id/${hash(id)}`, data);
  migrated += 1;
}

process.stdout.write(JSON.stringify({ ok: true, migrated, project: projectName }) + '\n');
