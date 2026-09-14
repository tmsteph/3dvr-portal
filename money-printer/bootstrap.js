import { createMoneyPrinterStorage } from '../src/money-printer/moneyPrinterStorage.js';
import {
  ingestMarketPulseCapsuleCandidates,
  parseMarketPulseCapsuleRecord,
} from '../src/money-printer/marketPulseIngest.js';

const CAPSULE_PATH = [
  '3dvr-portal',
  'growth',
  'market-pulse',
  'venture-capsules',
  'latest',
];
const DEFAULT_PEERS = ['wss://gun-relay-3dvr.fly.dev/gun'];

function getNode(root, path = []) {
  return path.reduce((node, key) => node.get(key), root);
}

function once(node, timeoutMs = 900) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    try {
      node.once((value) => finish(value));
    } catch (_error) {
      finish(null);
    }
  });
}

async function importLatestMarketPulseCandidates() {
  if (typeof window.Gun !== 'function') return null;
  const peers = Array.isArray(window.__GUN_PEERS__) && window.__GUN_PEERS__.length
    ? window.__GUN_PEERS__
    : DEFAULT_PEERS;
  const gun = window.Gun(peers);
  const record = await once(getNode(gun, CAPSULE_PATH));
  if (!record?.candidatesJson) return null;

  const payload = parseMarketPulseCapsuleRecord(record);
  if (!payload.candidates.length) return null;
  const storage = createMoneyPrinterStorage();
  const current = storage.hydrate();
  const result = ingestMarketPulseCapsuleCandidates(current, payload);
  if (result.imported > 0 || result.updated > 0) {
    storage.write(result.state);
  }
  return result;
}

async function boot() {
  try {
    const result = await importLatestMarketPulseCandidates();
    if (result && window.sessionStorage) {
      window.sessionStorage.setItem('3dvr.money-printer.market-pulse-import.v1', JSON.stringify({
        imported: result.imported,
        updated: result.updated,
        at: new Date().toISOString(),
      }));
    }
  } catch (_error) {
    // Market Pulse enrichment is optional. Money Printer must remain usable offline and local-first.
  }
  await import('./app.js');
}

boot();
