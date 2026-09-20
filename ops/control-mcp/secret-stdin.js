#!/usr/bin/env node
'use strict';

const fs = require('fs');

function text(value, max = 1000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

let raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
  const payload = JSON.parse(raw || '{}');
  const key = text(payload.key, 500);
  let value = typeof payload.value === 'string' ? payload.value : '';
  const sourceId = text(payload.sourceId || 'secure-stdin', 500);

  if (!/^[A-Za-z][A-Za-z0-9_.:/-]{1,127}$/.test(key)) {
    throw new Error('invalid secret key');
  }
  if (!value || Buffer.byteLength(value, 'utf8') > 64 * 1024) {
    throw new Error('invalid secret value');
  }

  const { OpenBaoBackend } = require('/opt/3dvr/secrets-broker/openbao.js');
  const backend = new OpenBaoBackend();
  if (!backend.ready()) throw new Error('OpenBao backend is not configured');

  const stored = backend.create({ key, value, sourceId });
  value = '';
  raw = '';
  process.stdout.write(JSON.stringify({
    ok: true,
    stored: true,
    key: stored.key,
    id: stored.id,
    backend: stored.backend,
  }) + '\n');
} catch (error) {
  raw = '';
  process.stderr.write(JSON.stringify({
    ok: false,
    error: text(error?.message || error, 500),
  }) + '\n');
  process.exitCode = 1;
}
