// src/gun/adapter.js
// Framework-agnostic helpers to establish a Gun connection with preview-safe defaults.
import { getEnvInfo } from './env.js';

export function createGun() {
  return import('https://cdn.jsdelivr.net/npm/gun/gun.js').then(({ default: Gun }) => {
    const { RELAY, ROOT, cacheEnabled } = getEnvInfo();

    const gun = Gun({
      peers: [RELAY],
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

    return { Gun, gun, root, path, put, sub, once };
  });
}
