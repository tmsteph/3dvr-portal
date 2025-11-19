// src/gun/adapter.js
// Framework-agnostic helpers to establish a Gun connection with preview-safe defaults.
import { getEnvInfo } from './env.js';

export function resolveGunFactory(moduleResult) {
  if (typeof moduleResult === 'function') return moduleResult;
  if (moduleResult && typeof moduleResult.default === 'function') return moduleResult.default;
  if (moduleResult && typeof moduleResult.Gun === 'function') return moduleResult.Gun;
  if (moduleResult?.default && typeof moduleResult.default.Gun === 'function') return moduleResult.default.Gun;
  if (typeof window !== 'undefined' && typeof window.Gun === 'function') return window.Gun;
  return null;
}

export function createGun() {
  return import('https://cdn.jsdelivr.net/npm/gun/gun.js').then(moduleResult => {
    const GunFactory = resolveGunFactory(moduleResult);
    if (typeof GunFactory !== 'function') {
      throw new Error('Unable to load Gun constructor from CDN or global window.Gun');
    }

    const { RELAY, ROOT, cacheEnabled } = getEnvInfo();
    const fallbackPeers = [
      RELAY,
      'wss://relay.3dvr.tech/gun',
      'wss://gun-relay-3dvr.fly.dev/gun'
    ].filter(Boolean);
    const peers = (typeof window !== 'undefined' && Array.isArray(window.__GUN_PEERS__))
      ? window.__GUN_PEERS__
      : Array.from(new Set(fallbackPeers));

    const gun = GunFactory({
      peers,
      axe: true,                 // better WAN performance
      radisk: cacheEnabled,      // disable in previews to avoid stale state
      localStorage: cacheEnabled // disable in previews to avoid stale state
    });

    const root = gun.get(ROOT);

    // helpers
    const path = (...keys) => keys.reduce((acc, k) => acc.get(String(k)), root);

    function put(node, data) {
      return new Promise((resolve, reject) => {
        node.put(data, ack => (ack && ack.err ? reject(ack.err) : resolve(ack)));
      });
    }

    // subscribe with auto-unsubscribe
    function sub(node, cb) {
      const handler = (data, key) => cb(data, key);
      node.on(handler, { change: true });
      return () => node.off();
    }

    function once(node) {
      return new Promise(resolve => node.once(value => resolve(value)));
    }

    return { Gun: GunFactory, gun, root, path, put, sub, once };
  });
}
