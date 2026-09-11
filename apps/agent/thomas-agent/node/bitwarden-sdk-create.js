'use strict';

const { BitwardenClient, DeviceType } = require('@bitwarden/sdk-napi');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const token = String(process.env.BWS_ACCESS_TOKEN || '');
  if (!token) throw new Error('Bitwarden access token is unavailable');
  const payload = JSON.parse(await readStdin());
  const organizationId = String(payload.organizationId || '').trim();
  const projectId = String(payload.projectId || '').trim();
  const key = String(payload.key || '').trim();
  const value = typeof payload.value === 'string' ? payload.value : '';
  const note = String(payload.note || '').trim();
  if (!organizationId || !projectId || !key || !value) throw new Error('Bitwarden create payload is incomplete');

  const client = new BitwardenClient({
    apiUrl: process.env.BWS_API_URL || 'https://api.bitwarden.com',
    identityUrl: process.env.BWS_IDENTITY_URL || 'https://identity.bitwarden.com',
    userAgent: '3DVR Secrets Broker',
    deviceType: DeviceType.SDK,
  });
  await client.auth().loginAccessToken(token);
  const created = await client.secrets().create(organizationId, key, value, note, [projectId]);
  process.stdout.write(JSON.stringify({ id: created.id, key: created.key || key, projectId }));
}

main().catch(error => {
  process.stderr.write(`Bitwarden SDK create failed: ${error.message}\n`);
  process.exitCode = 1;
});
