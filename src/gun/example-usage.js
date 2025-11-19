// src/gun/example-usage.js
// Minimal counter demo so every environment can confirm relay reads/writes are synced.
import { createGunToolkit } from './toolkit.js';

function getElement(id) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

function makeStatusWriter(element) {
  return (text, state) => {
    if (!element) return;
    element.textContent = text;
    if (state) {
      element.dataset.state = state;
    } else {
      element.removeAttribute('data-state');
    }
  };
}

function makeLogger(container) {
  if (!container) return () => {};

  container.dataset.initialized = 'false';
  return message => {
    if (!container) return;
    if (container.dataset.initialized !== 'true') {
      container.textContent = '';
      container.dataset.initialized = 'true';
    }
    const line = document.createElement('p');
    line.textContent = message;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  };
}

(async () => {
  const counterEl = getElement('counter');
  const statusEl = getElement('gun-demo-status');
  const logEl = getElement('gun-demo-log');

  const writeStatus = makeStatusWriter(statusEl);
  const log = makeLogger(logEl);

  if (counterEl && counterEl.textContent.trim() === '…') {
    counterEl.textContent = 'Checking…';
  }

  try {
    const toolkit = await createGunToolkit();

    toolkit.status.onStatus(payload => {
      log(`[status] ${payload.status} ${JSON.stringify(payload.detail)}`);
    });

    toolkit.peers.onChange(peers => {
      const states = peers.map(peer => `${peer.peer} (${peer.state})`).join(', ');
      log(`[peers] ${states || '—'}`);
    });

    const counter = toolkit.path('demo', 'counter', toolkit.env.PR);
    log(`[gun] Path demo/counter/${toolkit.env.PR}`);

    const currentRaw = await toolkit.read(['demo', 'counter', toolkit.env.PR]);
    const current = Number(currentRaw) || 0;
    log(`[gun] Current value ${current}`);

    const nextValue = Number(current) + 1;
    await toolkit.write(['demo', 'counter', toolkit.env.PR], nextValue);
    log(`[gun] Wrote value ${nextValue}`);

    if (counterEl) {
      counterEl.textContent = String(nextValue);
    }
    writeStatus('Connected and listening', 'success');

    const unsubscribe = toolkit.listen(counter, value => {
      const numericValue = Number(value);
      const displayValue = Number.isFinite(numericValue) ? numericValue : value;
      log(`[gun] Update received ${JSON.stringify({ value: displayValue })}`);
      if (counterEl) {
        counterEl.textContent = Number.isFinite(numericValue)
          ? String(numericValue)
          : String(displayValue ?? '—');
      }
    });

    if (typeof window !== 'undefined') {
      window.__gunDemoOff = unsubscribe;
      window.__gunToolkit = toolkit;
    }

    const backup = await toolkit.backup.capture(['demo', 'counter', toolkit.env.PR]);
    log(`[backup] captured depth=${backup.depth} keys=${Object.keys(backup.data || {}).length}`);
  } catch (error) {
    console.error('[gun] counter demo failed', error);
    log(`[error] ${error?.message || error}`);
    writeStatus('Connection failed', 'error');
    if (counterEl) {
      counterEl.textContent = 'Error';
    }
  }
})();
