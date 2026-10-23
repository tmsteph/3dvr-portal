import { openCellAccount } from '../operator/forge.js';

export function cellIdentity(storage = globalThis.localStorage) {
  try {
    return JSON.stringify(['signedIn', 'userPubKey', 'alias'].map(key => storage.getItem(key) || ''));
  } catch { return ''; }
}

export async function openPrivateCellStore({
  onCell = () => {}, getAccount = openCellAccount,
  storage = globalThis.localStorage, timeoutMs = 5000
} = {}) {
  const identity = cellIdentity(storage);
  const { user, pair, sea } = await getAccount();
  const pub = pair?.pub;
  if (!pub || user.is?.pub !== pub || cellIdentity(storage) !== identity) {
    throw new Error('Account changed. Reopen your private Cells.');
  }
  let closed = false;
  const newest = new Map();
  const prefix = `3dvr.cell.private.${pub}.`;
  // Only ciphertext is written, under the authenticated owner's signed Gun graph.
  const root = user.get('cell-v1').get('cells');
  const current = () => !closed && user.is?.pub === pub && cellIdentity(storage) === identity;
  const requireCurrent = () => {
    if (!current()) throw new Error('Account changed. Reopen your private Cells.');
  };
  async function receive(value, id, cache = false) {
    if (!current() || !value?.ciphertext) return;
    try {
      const decoded = await sea.decrypt(value.ciphertext, pair);
      const record = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
      if (!current() || !record || record.id !== id || record.ownerPub !== pub
        || typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) return;
      if ((newest.get(id) || '') > record.updatedAt) return;
      newest.set(id, record.updatedAt);
      if (cache) {
        try { storage.setItem(prefix + id, JSON.stringify(value)); } catch {}
      }
      onCell(record, id);
    } catch { /* Ignore unreadable records; never fall back to plaintext. */ }
  }
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try { await receive(JSON.parse(storage.getItem(key)), key.slice(prefix.length)); } catch {}
  }
  requireCurrent();
  const stream = root.map();
  stream.on((value, id) => { void receive(value, id, true); });
  return {
    pub,
    async save(record) {
      requireCurrent();
      const owned = { ...record, ownerPub: pub, visibility: 'private' };
      const ciphertext = await sea.encrypt(JSON.stringify(owned), pair);
      requireCurrent();
      if (!ciphertext) throw new Error('Encryption failed. Cell was not saved.');
      const envelope = { ciphertext };
      // A per-record encrypted cache survives relay outages without whole-list overwrites.
      storage.setItem(prefix + record.id, JSON.stringify(envelope));
      const result = await new Promise(resolve => {
        const timer = setTimeout(() => resolve({ pendingSync: true }), timeoutMs);
        try {
          root.get(record.id).put(envelope, ack => {
            clearTimeout(timer);
            if (ack?.err) resolve({ pendingSync: true });
            else resolve({ pendingSync: !ack?.ok });
          });
        } catch { clearTimeout(timer); resolve({ pendingSync: true }); }
      });
      requireCurrent();
      await receive(envelope, record.id);
      return result;
    },
    close() { closed = true; stream.off(); }
  };
}
