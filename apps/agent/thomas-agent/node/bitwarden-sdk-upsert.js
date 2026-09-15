'use strict';

const { BitwardenClient, DeviceType } = require('@bitwarden/sdk-napi');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function cleanText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeError(error) {
  return cleanText(error?.message || error || 'unknown SDK failure')
    .replace(/BWS_ACCESS_TOKEN=[^\s]+/gi, 'BWS_ACCESS_TOKEN=[redacted]')
    .replace(/[A-Za-z0-9+/_=-]{48,}/g, '[redacted]');
}

function normalizeItem(raw = {}) {
  return {
    organizationId: String(raw.organizationId || '').trim(),
    projectId: String(raw.projectId || '').trim(),
    secretId: String(raw.secretId || '').trim(),
    key: String(raw.key || '').trim(),
    value: typeof raw.value === 'string' ? raw.value : '',
    note: String(raw.note || '').trim(),
  };
}

async function main() {
  const token = String(process.env.BWS_ACCESS_TOKEN || '');
  if (!token) throw new Error('Bitwarden access token is unavailable');

  const payload = JSON.parse(await readStdin());
  const items = Array.isArray(payload.items) ? payload.items : [payload];
  if (!items.length) throw new Error('Bitwarden upsert payload is empty');

  const client = new BitwardenClient({
    apiUrl: process.env.BWS_API_URL || 'https://api.bitwarden.com',
    identityUrl: process.env.BWS_IDENTITY_URL || 'https://identity.bitwarden.com',
    userAgent: '3DVR Vault Mirror',
    deviceType: DeviceType.SDK,
  });

  // Authenticate exactly once for the entire import batch. Creating one SDK
  // session per secret can trip Bitwarden access-token rate limits.
  await client.auth().loginAccessToken(token);

  const results = [];
  const failures = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = normalizeItem(items[index]);
    if (!item.organizationId || !item.projectId || !item.key || !item.value) {
      failures.push({ index, error: 'incomplete-upsert-payload' });
      continue;
    }
    try {
      const result = item.secretId
        ? await client.secrets().update(item.organizationId, item.secretId, item.key, item.value, item.note, [item.projectId])
        : await client.secrets().create(item.organizationId, item.key, item.value, item.note, [item.projectId]);
      results.push({ id: result.id, key: result.key || item.key, projectId: item.projectId, updated: Boolean(item.secretId) });
    } catch (error) {
      failures.push({ index, error: safeError(error) });
    }
  }

  process.stdout.write(JSON.stringify({ results, failures }));
}

main().catch(error => {
  process.stderr.write(`Bitwarden SDK batch upsert failed: ${safeError(error)}\n`);
  process.exitCode = 1;
});
