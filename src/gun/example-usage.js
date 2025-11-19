// src/gun/example-usage.js
// Minimal counter demo so every environment can confirm relay reads/writes are synced.
import { createGunToolkit, omitMetaFields } from './toolkit.js';

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

function extractCounterValue(raw) {
  const cleaned = omitMetaFields(raw);
  if (cleaned && typeof cleaned === 'object' && 'value' in cleaned) {
    return cleaned.value;
  }
  return cleaned;
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

    const counterPath = ['demo', 'counter', toolkit.env.PR];
    const counter = toolkit.path(...counterPath);
    log(`[gun] Path demo/counter/${toolkit.env.PR}`);

    const currentRaw = await toolkit.read(counterPath);
    const currentValue = extractCounterValue(currentRaw);
    const current = Number(currentValue) || 0;
    log(`[gun] Current value ${current}`);

    const nextValue = Number(current) + 1;
    await toolkit.write(counterPath, { value: nextValue, updatedAt: new Date().toISOString() });
    log(`[gun] Wrote value ${nextValue}`);

    if (counterEl) {
      counterEl.textContent = String(nextValue);
    }
    writeStatus('Connected and listening', 'success');

    const unsubscribe = toolkit.listen(counter, value => {
      const displayValue = extractCounterValue(value);
      const numericValue = Number(displayValue);
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

    const backup = await toolkit.backup.capture(counterPath);
    const keyCount = backup.data && typeof backup.data === 'object'
      ? Object.keys(backup.data).length
      : 0;
    log(`[backup] captured depth=${backup.depth} keys=${keyCount}`);
  } catch (error) {
    console.error('[gun] counter demo failed', error);
    log(`[error] ${error?.message || error}`);
    writeStatus('Connection failed', 'error');
    if (counterEl) {
      counterEl.textContent = 'Error';
    }
  }
})();
