import { createSignedPortalProof } from './forge.js';

export const COMPUTER_ENDPOINT = '/api/operator-computers';

export async function computerRequest(body, { keepalive = false } = {}) {
  const response = await fetch(COMPUTER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    keepalive
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Computer service is unavailable.');
  return payload;
}

export async function ownerComputerRequest(action, deviceId) {
  const proof = await createSignedPortalProof('operator-computers', deviceId ? `${action}:${deviceId}` : action);
  if (!proof) throw new Error('Sign in to Portal to manage computers.');
  return computerRequest({ ...proof, action, deviceId });
}

export function computerNameFromPrompt(prompt) {
  const match = /^is my computer ([a-z0-9][a-z0-9 ._-]{0,39}?) online\??$/i.exec(prompt);
  return match?.[1].trim() || '';
}

export async function getComputerStatus(name) {
  const { devices } = await ownerComputerRequest('list');
  const device = devices.find(candidate => candidate.name.toLowerCase() === name.toLowerCase());
  if (!device) throw new Error(`${name} is disconnected or unavailable. Open Computers to pair it.`);
  return ownerComputerRequest('status', device.id);
}
