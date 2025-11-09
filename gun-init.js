(function initGunPeers(global) {
  const defaultPeers = [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun'
  ];
  const existingPeers = Array.isArray(global.__GUN_PEERS__)
    ? global.__GUN_PEERS__
    : [];
  const mergedPeers = Array.from(new Set([...defaultPeers, ...existingPeers].filter(Boolean)));
  global.__GUN_PEERS__ = mergedPeers;

  function runDiagnostics() {
    if (typeof global.Gun !== 'function' || global.__GUN_BRAVE_DIAGNOSTICS__) {
      return;
    }
    global.__GUN_BRAVE_DIAGNOSTICS__ = true;

    (async () => {
      try {
        const isBrave = !!navigator.brave && (await navigator.brave.isBrave?.());
        console.log('Brave?', isBrave);
      } catch (err) {
        console.warn('Brave detection failed', err);
      }

      const diagGun = global.Gun({
        peers: mergedPeers,
        axe: true,
        radisk: false,
        localStorage: false
      });

      diagGun.on('hi', peer => console.log('[GUN] HI', peer?.url || peer));
      diagGun.on('bye', peer => console.warn('[GUN] BYE', peer?.url || peer));

      const testNode = diagGun.get('brave_sync_test');
      testNode.put({ now: Date.now() }, ack => console.log('PUT ack:', ack));
      testNode.once(data => console.log('READ:', data));
    })();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runDiagnostics, { once: true });
    } else {
      runDiagnostics();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
