export const MESSAGE_TTL_MS = 10 * 60 * 1000;
const ID = /^[a-zA-Z0-9_-]{12,100}$/;
const RANK = { queued: 1, deferred: 2, sending: 2, uncertain: 3, stale: 4, cancelled: 4, completed: 5 };

export function validMessage(record) {
  return record && ID.test(record.id || '') && ID.test(record.sessionId || '')
    && ['openclaw', 'codex', 'codex-backup'].includes(record.engine ?? 'openclaw')
    && typeof record.text === 'string' && record.text.trim() && record.text.length <= 6000
    && Number.isSafeInteger(record.createdAt) && Number.isSafeInteger(record.expiresAt)
    && record.expiresAt > record.createdAt && record.expiresAt - record.createdAt <= MESSAGE_TTL_MS
    && Number.isSafeInteger(record.updatedAt) && record.updatedAt >= record.createdAt
    && Object.hasOwn(RANK, record.status);
}

export function createOutbox({ save, send, isReady, onChange = () => {}, canSend = () => true, now = Date.now }) {
  const records = new Map();
  let draining = false;
  const snapshot = () => [...records.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const changed = () => onChange(snapshot());
  const commit = async record => {
    await save(record);
    records.set(record.id, record);
    changed();
    return record;
  };
  return {
    snapshot,
    merge(record) {
      if (!validMessage(record)) return;
      const current = records.get(record.id);
      // Terminal history never becomes a queued command again after a late Gun snapshot.
      if (current && (RANK[current.status] > RANK[record.status]
        || (RANK[current.status] === RANK[record.status] && current.updatedAt >= record.updatedAt))) return;
      records.set(record.id, record);
      changed();
    },
    async enqueue({ id, sessionId, text, engine = 'openclaw' }) {
      const createdAt = now();
      const record = { id, sessionId, text, engine, createdAt, expiresAt: createdAt + MESSAGE_TTL_MS,
        updatedAt: createdAt, status: 'queued' };
      if (!validMessage(record)) throw new Error('Invalid message.');
      return commit(record);
    },
    async expire() {
      for (const record of snapshot()) {
        if (['queued', 'deferred'].includes(record.status) && now() >= record.expiresAt) {
          await commit({ ...record, status: 'stale', updatedAt: now(), note: 'Expired · kept in history, not sent' });
        }
      }
    },
    async cancel(id) {
      const record = records.get(id);
      if (record && ['queued', 'deferred'].includes(record.status)) await commit({ ...record, status: 'cancelled', updatedAt: now(), note: 'Cancelled before sending' });
    },
    async drain() {
      if (draining) return;
      draining = true;
      try {
        await this.expire();
        while (isReady()) {
          const queued = snapshot().find(record => ['queued', 'deferred'].includes(record.status) && canSend(record));
          if (!queued) break;
          if (now() >= queued.expiresAt) { await this.expire(); continue; }
          const active = await commit({ ...queued, status: 'sending', updatedAt: Math.max(now(), queued.updatedAt + 1) });
          // Save the fixed request id before dispatch. A restored sending record is never replayed.
          try {
            const result = await send(active);
            await commit({ ...active, status: 'completed', updatedAt: now(), reply: result.reply });
          } catch (error) {
            await commit({ ...active, status: error.stale ? 'stale' : error.retryable ? 'deferred' : 'uncertain', updatedAt: Math.max(now(), active.updatedAt + 1),
              note: error.stale ? 'Expired · kept in history, not sent' : error.retryable ? 'Agent busy · waiting to retry' : `${error.message} Check before resending.` });
            break;
          }
          await this.expire();
        }
      } finally { draining = false; }
    }
  };
}
