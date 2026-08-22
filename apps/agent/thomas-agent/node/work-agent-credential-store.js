'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function masterKey(value = process.env.WORK_AGENT_CREDENTIAL_KEY) {
  if (!value) throw new Error('WORK_AGENT_CREDENTIAL_KEY is required');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('WORK_AGENT_CREDENTIAL_KEY must be 32 bytes base64');
  return key;
}

function opaqueSubject(subject) {
  return crypto.createHash('sha256').update(String(subject)).digest('hex');
}

function recordId({ tenantId, provider, subject }) {
  if (!tenantId || !provider || !subject) throw new Error('tenantId, provider, and subject are required');
  return crypto.createHash('sha256').update(`${tenantId}\0${provider}\0${subject}`).digest('hex');
}

function encrypt(refreshToken, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(refreshToken), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decrypt(secret, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

class WorkAgentCredentialStore {
  constructor({ file, key } = {}) {
    this.file = file || process.env.WORK_AGENT_CREDENTIAL_FILE || path.join(process.env.HOME || '.', '.3dvr', 'work-agent-credentials.json');
    this.key = masterKey(key);
  }

  _read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, records: {} }; throw error; }
  }

  _write(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    fs.chmodSync(this.file, 0o600);
  }

  put({ tenantId, provider, subject, refreshToken, email, displayLabel, scopeKey, scopes = [] }) {
    if (!refreshToken) throw new Error('refreshToken is required');
    const data = this._read();
    const id = recordId({ tenantId, provider, subject });
    const now = new Date().toISOString();
    const previous = data.records[id];
    data.records[id] = {
      tenantId, provider, subjectOpaque: opaqueSubject(subject), email, displayLabel, scopeKey, scopes,
      connectedAt: previous?.connectedAt || now, updatedAt: now, revokedAt: null, status: 'connected',
      secret: encrypt(refreshToken, this.key)
    };
    this._write(data);
    return this.status({ tenantId, provider, subject });
  }

  getRefreshToken({ tenantId, provider, subject }) {
    const record = this._read().records[recordId({ tenantId, provider, subject })];
    if (!record || record.status !== 'connected' || !record.secret) return null;
    return decrypt(record.secret, this.key);
  }

  status({ tenantId, provider, subject }) {
    const record = this._read().records[recordId({ tenantId, provider, subject })];
    if (!record) return null;
    const { secret, tenantId: _tenant, ...safe } = record;
    return safe;
  }

  revoke({ tenantId, provider, subject }) {
    const data = this._read();
    const id = recordId({ tenantId, provider, subject });
    const record = data.records[id];
    if (!record) return null;
    delete record.secret;
    record.status = 'revoked';
    record.revokedAt = record.updatedAt = new Date().toISOString();
    this._write(data);
    return this.status({ tenantId, provider, subject });
  }
}

module.exports = { WorkAgentCredentialStore, recordId, opaqueSubject };
