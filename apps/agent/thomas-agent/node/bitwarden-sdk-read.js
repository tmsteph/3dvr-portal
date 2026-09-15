'use strict';

const { BitwardenClient, DeviceType } = require('@bitwarden/sdk-napi');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function safeError(error) {
  return clean(error?.message || error || 'unknown SDK failure')
    .replace(/BWS_ACCESS_TOKEN=[^\s]+/gi, 'BWS_ACCESS_TOKEN=[redacted]')
    .replace(/[A-Za-z0-9+/_=-]{48,}/g, '[redacted]');
}

async function main() {
  const token = String(process.env.BWS_ACCESS_TOKEN || '');
  if (!token) throw new Error('Bitwarden access token is unavailable');
  const payload = JSON.parse(await readStdin());
  const organizationId = clean(payload.organizationId, 200);
  const secretId = clean(payload.secretId || payload.id, 200);
  const key = clean(payload.key, 500);
  if (!organizationId || (!secretId && !key)) throw new Error('Bitwarden read payload is incomplete');
  const client = new BitwardenClient({
    apiUrl: process.env.BWS_API_URL || 'https://api.bitwarden.com',
    identityUrl: process.env.BWS_IDENTITY_URL || 'https://identity.bitwarden.com',
    userAgent: '3DVR Secrets Broker',
    deviceType: DeviceType.SDK,
  });
  await client.auth().loginAccessToken(token);

  let id = secretId;
  if (!id) {
    const listed = await client.secrets().list(organizationId);
    const entries = Array.isArray(listed) ? listed : (listed?.data || listed?.secrets || []);
    const match = entries.find(item => clean(item?.key, 500) === key);
    id = clean(match?.id, 200);
    if (!id) throw new Error('Bitwarden secret key was not found');
  }

  const secret = await client.secrets().get(id);
  if (typeof secret?.value !== 'string') throw new Error('Bitwarden secret value is missing');
  process.stdout.write(JSON.stringify({ id: secret.id || id, key: secret.key || key, value: secret.value }));
}

main().catch(error => {
  process.stderr.write(`Bitwarden SDK read failed: ${safeError(error)}\n`);
  process.exitCode = 1;
});
