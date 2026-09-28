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
  const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : () => {};

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
      status: normalizeText(latest?.status) || 'queued',
      timedOut: true
    }), timeoutMs);

    node.on((data) => {
      if (!data || typeof data !== 'object') return;
      latest = data;
      onUpdate(data);
      const status = normalizeText(data.status).toLowerCase();
      if (TERMINAL_STATUSES.has(status)) finish(data);
    });
  });
}

export function forgeEditProgress(record = {}) {
  const status = normalizeText(record.status).toLowerCase() || 'queued';
  const started = Date.parse(record.startedAt || record.createdAt || '');
  const elapsedMs = Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0;
  const elapsed = elapsedMs >= 60_000
    ? `${Math.floor(elapsedMs / 60_000)}m ${Math.floor((elapsedMs % 60_000) / 1000)}s`
    : `${Math.floor(elapsedMs / 1000)}s`;
  if (status === 'completed') return `Code task complete · ${elapsed}`;
  if (status === 'running') return `Forge is editing/testing · ${elapsed} elapsed`;
  if (['failed', 'rejected', 'approval_required'].includes(status)) return `Forge stopped: ${status.replace('_', ' ')}`;
  return `Code task queued · ${elapsed} elapsed`;
}

// A worker's terminal status is not evidence of a merge or live deployment.
export function forgeEditReceipt(record = {}) {
  const status = normalizeText(record.status).toLowerCase();
  if (status === 'completed') {
    const summary = normalizeText(record.resultSummary);
    return summary
      ? `Forge reports the task completed. Result: ${summary}`
      : 'Forge reports the task completed, but returned no verification summary. Open the task to review before treating the fix as verified.';
  }
  if (status === 'running') return 'Forge is working on the code change. Verification is pending.';
  return 'The code change is queued. Execution and verification are pending.';
}
