function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function readPathwayProgress(config, storage = defaultStorage()) {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(config.storageKey));
    return value && value.mode === config.id ? value : null;
  } catch {
    return null;
  }
}

export function writePathwayProgress(config, state, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(config.storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearPathwayProgress(config, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.removeItem(config.storageKey);
    return true;
  } catch {
    return false;
  }
}
