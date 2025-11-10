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

  function showBraveShieldNotice(reason) {
    if (typeof console === 'undefined') {
      return;
    }

    const message = reason
      ? `Brave diagnostic: ${reason}`
      : 'Brave diagnostic: Brave Shields likely active.';

    console.info(message);
  }

  function runDiagnostics() {
    if (typeof global.Gun !== 'function' || global.__GUN_BRAVE_DIAGNOSTICS__) {
      return;
    }
    global.__GUN_BRAVE_DIAGNOSTICS__ = true;

    (async () => {
      try {
        const isBrave = !!navigator.brave && (await navigator.brave.isBrave?.());
        console.log('Brave?', isBrave);
        if (isBrave) {
          showBraveShieldNotice('Brave browser detected');
        }
      } catch (err) {
        console.warn('Brave detection failed', err);
      }

      const diagGun = global.Gun({
        peers: mergedPeers,
        axe: true,
        radisk: false,
        localStorage: false
      });

      let sawHi = false;
      let wrote = false;
      let read = false;
      const timeouts = [];

      const clearTimers = () => {
        while (timeouts.length) {
          clearTimeout(timeouts.pop());
        }
      };

      diagGun.on('hi', peer => {
        sawHi = true;
        console.log('[GUN] HI', peer?.url || peer);
      });
      diagGun.on('bye', peer => {
        console.warn('[GUN] BYE', peer?.url || peer);
        if (sawHi && !read) {
          showBraveShieldNotice('connection dropped before data synced');
        }
      });

      const testNode = diagGun.get('brave_sync_test');
      timeouts.push(setTimeout(() => {
        if (!wrote) {
          showBraveShieldNotice('write acknowledgement timed out');
        }
      }, 4000));
      timeouts.push(setTimeout(() => {
        if (!read) {
          showBraveShieldNotice('read timed out');
        }
      }, 6000));

      testNode.put({ now: Date.now() }, ack => {
        wrote = !ack?.err;
        console.log('PUT ack:', ack);
        if (ack?.err) {
          showBraveShieldNotice(`write error: ${ack.err}`);
        } else if (wrote) {
          clearTimeout(timeouts[0]);
        }
      });
      testNode.once(data => {
        read = !!data;
        console.log('READ:', data);
        if (read) {
          clearTimers();
        }
      });
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
