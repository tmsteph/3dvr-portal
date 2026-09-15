import {
  mergeVentureOutcomeMemory,
  normalizeVentureOutcomeMemory,
  ventureOutcomeMemoryKey,
  VENTURE_OUTCOME_MEMORY_GUN_NODE,
} from './ventureOutcomeMemory.js';

function once(node, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      node.once((value) => finish(value));
    } catch (_error) {
      finish(null);
    }
  });
}

function put(node, value, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(ack || {});
    };
    const timer = setTimeout(() => finish(new Error('Venture outcome memory sync timed out.')), timeoutMs);
    try {
      node.put(value, (ack) => {
        if (ack?.err) finish(new Error(String(ack.err)));
        else finish(null, ack);
      });
    } catch (error) {
      finish(error);
    }
  });
}

export function createVentureOutcomeMemorySync({
  user,
  SEA,
  nodeName = VENTURE_OUTCOME_MEMORY_GUN_NODE,
} = {}) {
  const pair = user?._?.sea;
  const readable = Boolean(user?.is?.pub && pair && SEA?.decrypt && user?.get);
  const writable = Boolean(readable && SEA?.encrypt);
  const node = readable ? user.get('kernel').get(nodeName) : null;

  const readCurrent = async () => {
    if (!readable || !node) return null;
    const record = await once(node);
    if (!record?.ciphertext) return null;
    const decoded = await SEA.decrypt(record.ciphertext, pair);
    if (!decoded) return null;
    const parsed = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    return normalizeVentureOutcomeMemory(parsed);
  };

  return {
    available: readable,
    writable,
    read: readCurrent,
    async write(memory) {
      if (!writable || !node) return false;
      const incoming = normalizeVentureOutcomeMemory(memory);
      if (!incoming.entries.length) return false;
      let current = null;
      let merged = incoming;
      try {
        current = await readCurrent();
        if (current) merged = mergeVentureOutcomeMemory(current, incoming);
      } catch (_error) {
        // A corrupt or temporarily unavailable prior value must not block a fresh encrypted write.
      }
      if (current && ventureOutcomeMemoryKey(current) === ventureOutcomeMemoryKey(merged)) {
        return false;
      }
      const ciphertext = await SEA.encrypt(JSON.stringify(merged), pair);
      if (!ciphertext) throw new Error('Unable to encrypt Venture Outcome Memory.');
      await put(node, {
        schemaVersion: merged.schemaVersion,
        updatedAt: merged.updatedAt || new Date().toISOString(),
        ciphertext,
      });
      return true;
    },
  };
}
