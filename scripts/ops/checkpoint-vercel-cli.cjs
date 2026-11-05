#!/usr/bin/env node
// Checkpoint Vercel CLI OAuth state in both automation stores; never log values.
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');
const { OpenBaoBackend } = require('/opt/3dvr/secrets-broker/openbao');
const { BitwardenSecretsManagerBackend } = require('/opt/3dvr/secrets-broker/secrets-broker');
const key = 'VERCEL_CLI_AUTH_HETZNER';
async function main() {
  if (process.getuid() !== 0) throw new Error('Root-only credential checkpoint');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const value = Buffer.concat(chunks).toString('utf8');
  const auth = JSON.parse(value);
  if (!auth.token || !auth.refreshToken || !Number.isFinite(auth.expiresAt)) throw new Error('Incomplete OAuth state');
  const request = await fetch('https://api.vercel.com/v4/domains/3dvr.tech/records?teamId=team_KXuVUd00RMnDsjoqwdREcZ7J',
    { headers: { Authorization: 'Bearer '+auth.token }, signal: AbortSignal.timeout(15000) });
  if (!request.ok) throw new Error('DNS credential verification failed');
  for (const line of fs.readFileSync('/etc/3dvr/secrets-broker/bitwarden.env', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  const bao = new OpenBaoBackend();
  const bw = new BitwardenSecretsManagerBackend();
  try {
    if (bao.get({key})===value && bw.get({projectName:'3dvr Agent',key})===value) {
      console.log(JSON.stringify({ok:true,key,unchanged:true,openbaoReadBack:true,bitwardenReadBack:true,dnsAuthentication:true,expiresAt:auth.expiresAt}));
      return;
    }
  } catch {}
  bao.create({ key, value });
  if (bao.get({ key }) !== value) throw new Error('OpenBao read-back mismatch');
  const run = (args) => {
    const r = spawnSync('/usr/local/bin/bws', args, { encoding: 'utf8', timeout: 20000, maxBuffer: 4*1024*1024 });
    if (r.status !== 0) throw new Error('Bitwarden metadata lookup failed');
    return JSON.parse(r.stdout);
  };
  const project = run(['project','list','--output','json','--color','no']).find(p => p.name==='3dvr Agent');
  if (!project) throw new Error('Bitwarden project unavailable');
  const entries = run(['secret','list',project.id,'--output','json','--color','no']).filter(p => p.key===key);
  if (entries.length>1) throw new Error('Duplicate credential keys');
  const item = { organizationId: project.organizationId, projectId: project.id,
    secretId: entries[0]?.id || '', key, value, note: 'Server OAuth state checkpoint; refresh via the Vercel CLI.' };
  const upsert = spawnSync(process.execPath, ['/opt/3dvr/secrets-broker/bitwarden-sdk-upsert.js'],
    { input: JSON.stringify(item), encoding: 'utf8', timeout: 30000 });
  if (upsert.status !== 0) throw new Error('Bitwarden credential checkpoint failed');
  const result = JSON.parse(upsert.stdout);
  if (result.failures?.length || result.results?.length!==1) throw new Error('Bitwarden write not confirmed');
  if (bw.get({projectName:'3dvr Agent',key})!==value) throw new Error('Bitwarden read-back mismatch');
  console.log(JSON.stringify({ok:true,key,openbaoReadBack:true,bitwardenReadBack:true,dnsAuthentication:true,expiresAt:auth.expiresAt}));
}
main().catch(() => { console.error('Credential checkpoint failed; no credential values logged.'); process.exitCode=1; });
