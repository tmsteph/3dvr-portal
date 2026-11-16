// Conversation history on a device is partitioned by account. The base key
// is the signed-out (guest) bucket; every signed-in account gets its own
// bucket key. A bucket only ever reads and retires its own data: an account
// bucket must never fall back to the base bucket or adopt the pre-partition
// legacy history, or one person's chats silently become another's
// (portal issue #3764).

export function pickConversationStoreSource(storage, { key, baseKey, legacyKey } = {}) {
  const read = candidate => {
    try {
      return storage?.getItem?.(candidate) || '';
    } catch {
      return '';
    }
  };
  const raw = read(key);
  if (raw) return { raw, legacy: '' };
  // Only the base bucket may adopt the legacy history: that is the bucket
  // the legacy history was written for before partitioning existed.
  if (key === baseKey) return { raw: '', legacy: read(legacyKey) };
  return { raw: '', legacy: '' };
}

export function retireLegacyConversationHistory(storage, { key, baseKey, legacyKey } = {}) {
  // After a save, only the base bucket retires the legacy key it migrated.
  // Account buckets leave every other bucket's data untouched, so saving as
  // one account can never delete the guest bucket or another partition.
  if (key !== baseKey) return;
  try {
    storage?.removeItem?.(legacyKey);
  } catch {}
}
