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
    if (typeof document === 'undefined') {
      return;
    }

    if (document.getElementById('brave-shield-warning')) {
      const details = document.querySelector('#brave-shield-warning [data-reason]');
      if (details && reason && !details.textContent.includes(reason)) {
        details.textContent += `, ${reason}`;
      }
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'brave-shield-warning';
    wrapper.setAttribute('role', 'status');
    wrapper.setAttribute('aria-live', 'polite');
    wrapper.style.position = 'fixed';
    wrapper.style.zIndex = '2147483647';
    wrapper.style.right = '16px';
    wrapper.style.bottom = '16px';
    wrapper.style.maxWidth = '360px';
    wrapper.style.padding = '16px';
    wrapper.style.borderRadius = '12px';
    wrapper.style.background = 'rgba(21, 21, 21, 0.92)';
    wrapper.style.color = '#fff';
    wrapper.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.35)';
    wrapper.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    wrapper.style.lineHeight = '1.4';

    const heading = document.createElement('strong');
    heading.textContent = 'Brave Shields are blocking realtime sync';

    const description = document.createElement('p');
    description.style.margin = '8px 0 0 0';
    description.textContent = 'GunJS needs cross-site cookies and WebSocket access. Turn the Brave shield off or set Cross-site cookies to Allow and Fingerprinting to Standard for portal.3dvr.tech and relay.3dvr.tech.';

    const details = document.createElement('p');
    details.style.margin = '8px 0 0 0';
    details.dataset.reason = 'true';
    details.textContent = reason ? `Detected issue: ${reason}` : 'Detected issue: Brave Shields likely active.';

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Dismiss';
    close.style.marginTop = '12px';
    close.style.padding = '6px 12px';
    close.style.border = 'none';
    close.style.borderRadius = '8px';
    close.style.cursor = 'pointer';
    close.style.fontWeight = '600';
    close.style.background = '#ff8a00';
    close.style.color = '#151515';
    close.addEventListener('click', () => {
      wrapper.remove();
    });

    wrapper.appendChild(heading);
    wrapper.appendChild(description);
    wrapper.appendChild(details);
    wrapper.appendChild(close);

    document.body.appendChild(wrapper);
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
