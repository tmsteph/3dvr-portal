const FORGE_ROOT = '3dvr-portal';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_PEERS = [
  'wss://gun-relay-3dvr.fly.dev/gun',
  'https://gun-relay-3dvr.fly.dev/gun'
];
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'rejected', 'approval_required']);

function normalizeText(value = '') {
  return String(value || '').trim();
}

export function forgeEditId(value = '') {
  const text = normalizeText(value);
  if (!text) return '';
  if (/^[a-z0-9._:-]+$/i.test(text) && !text.includes('/')) return text;
  try {
    return new URL(text, globalThis.location?.origin || 'https://portal.3dvr.tech').searchParams.get('id') || '';
  } catch {
    return '';
  }
}

export async function waitForForgeEdit(value, options = {}) {
  const id = forgeEditId(value);
  if (!id) throw new Error('The Operator edit did not return a Forge task id.');
  if (typeof globalThis.Gun !== 'function') throw new Error('3DVR Forge status is unavailable in this browser.');

  const gun = globalThis.Gun({ peers: globalThis.__GUN_PEERS__ || DEFAULT_PEERS });
  const node = gun.get(FORGE_ROOT).get('forge').get('editRequests').get(id);
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let latest = null;
    let settled = false;
    const finish = (record) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { node.off(); } catch {}
      resolve(record);
    };
    const timer = setTimeout(() => finish({
      ...(latest || {}),
      id,
      status: normalizeText(latest?.status) || 'running',
      timedOut: true
    }), timeoutMs);

    node.on((data) => {
      if (!data || typeof data !== 'object') return;
      latest = data;
      const status = normalizeText(data.status).toLowerCase();
      if (TERMINAL_STATUSES.has(status)) finish(data);
    });
  });
}
