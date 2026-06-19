import { createDefaultMoneyPrinterState, refreshMoneyPrinterState } from './moneyPrinterCore.js';

// Storage adapters for money-printer-web today and future CLI/daemon persistence later.
// The core engine does not depend on localStorage; this module is the browser storage boundary.

export const MONEY_PRINTER_STORAGE_KEY = '3dvr.money-printer.state.v1';

function getDefaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function readMoneyPrinterState(storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeMoneyPrinterState(state, storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function removeMoneyPrinterState(storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function hydrateMoneyPrinterState(storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  const defaults = createDefaultMoneyPrinterState();
  const stored = readMoneyPrinterState(storage, key);
  return refreshMoneyPrinterState({
    ...defaults,
    ...(stored || {})
  });
}

export function createMoneyPrinterStorage(storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  return {
    key,
    read() {
      return readMoneyPrinterState(storage, key);
    },
    write(state) {
      return writeMoneyPrinterState(state, storage, key);
    },
    remove() {
      return removeMoneyPrinterState(storage, key);
    },
    hydrate() {
      return hydrateMoneyPrinterState(storage, key);
    }
  };
}
