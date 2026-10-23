import { openCellAccount } from '../operator/forge.js';

export function cellIdentity(storage = globalThis.localStorage) {
  try {
    return JSON.stringify(['signedIn', 'userPubKey', 'alias', 'authMethod'].map(key => storage.getItem(key) || ''));
  } catch { return ''; }
}

export async function openPrivateCellStore({
  onCell = () => {}, getAccount = openCellAccount,
  storage = globalThis.localStorage, timeoutMs = 5000, namespace = 'cell-v1'
} = {}) {
  const identity = cellIdentity(storage);
  const { user, pair, sea } = await getAccount();
  const pub = pair?.pub;
  if (!pub || user.is?.pub !== pub || cellIdentity(storage) !== identity) {
    throw new Error('Account changed. Reopen your private Cells.');
  }
  let closed = false;
  let retrying = null;
  const newest = new Map();
  const pending = new Map();
  const prefix = namespace === 'cell-v1'
    ? `3dvr.cell.private.${pub}.` : `3dvr.cell.${namespace}.${pub}.`;
  // Immutable encrypted revisions let offline retries coexist with newer device edits.
  const root = user.get(namespace).get('cells');
  const current = () => !closed && user.is?.pub === pub && cellIdentity(storage) === identity;
  const requireCurrent = () => {
    if (!current()) throw new Error('Account changed. Reopen your private Cells.');
  };
  async function receive(value, key, cache = false) {
    if (!current() || !value?.ciphertext) return false;
    try {
      const decoded = await sea.decrypt(value.ciphertext, pair);
      const record = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
      if (!current() || !record || typeof record.id !== 'string' || record.revision !== key
        || !key.startsWith(`${record.id}:`) || record.ownerPub !== pub
        || typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) return false;
      if (cache) {
        try { storage.setItem(prefix + key, JSON.stringify({ciphertext: value.ciphertext, pendingSync: pending.has(key)})); } catch {}
      }
      const version = `${record.updatedAt}:${key}`;
      if ((newest.get(record.id) || '') > version) return true;
      newest.set(record.id, version);
      onCell(record, record.id);
      return true;
    } catch { return false; } // Never fall back to plaintext.
  }
  function publish(key, envelope) {
    if (!current()) return Promise.resolve({ pendingSync: true });
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve({ pendingSync: true }), timeoutMs);
      try {
        root.get(key).put({ciphertext: envelope.ciphertext}, ack => {
          // Local adapter events are not proof of peer sync. Retain retry intent on errors.
          if (ack?.err || !ack?.ok || !current()) {
            clearTimeout(timer);
            resolve({ pendingSync: true });
            return;
          }
          clearTimeout(timer);
          pending.delete(key);
          try { storage.setItem(prefix + key, JSON.stringify({ciphertext: envelope.ciphertext, pendingSync: false})); } catch {}
          resolve({ pendingSync: false });
        });
      } catch { clearTimeout(timer); resolve({ pendingSync: true }); }
    });
  }
  function retryPending() {
    if (!current()) return Promise.resolve();
    if (!retrying) {
      retrying = Promise.all([...pending].map(([key, envelope]) => publish(key, envelope)))
        .finally(() => { retrying = null; });
    }
    return retrying;
  }
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const envelope = JSON.parse(storage.getItem(key));
      const revision = key.slice(prefix.length);
      if (await receive(envelope, revision) && envelope.pendingSync) pending.set(revision, envelope);
    } catch {}
  }
  requireCurrent();
  const stream = root.map();
  stream.on((value, key) => { void receive(value, key, true); });
  // Stream echoes may be local; only a peer acknowledgement clears retry intent.
  void retryPending();
  return {
    pub, retryPending,
    async save(record) {
      requireCurrent();
      const revision = `${record.id}:${globalThis.crypto.randomUUID()}`;
      const owned = { ...record, revision, ownerPub: pub, visibility: 'private' };
      const ciphertext = await sea.encrypt(JSON.stringify(owned), pair);
      requireCurrent();
      if (!ciphertext) throw new Error('Encryption failed. Cell was not saved.');
      const envelope = { ciphertext, pendingSync: true };
      storage.setItem(prefix + revision, JSON.stringify(envelope));
      pending.set(revision, envelope);
      const result = await publish(revision, envelope);
      requireCurrent();
      await receive(envelope, revision);
      return result;
    },
    close() { closed = true; stream.off(); }
  };
}
