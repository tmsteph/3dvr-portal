// src/gun/example-usage.js
// Minimal counter demo so every environment can confirm relay reads/writes are synced.
import { createGun } from './adapter.js';
import { getEnvInfo } from './env.js';

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
  const { ROOT, PR, isVercelPreview } = getEnvInfo();

  const counterEl = getElement('counter');
  const statusEl = getElement('gun-demo-status');
  const logEl = getElement('gun-demo-log');

  const writeStatus = makeStatusWriter(statusEl);
  const log = makeLogger(logEl);

  if (counterEl && counterEl.textContent.trim() === '…') {
    counterEl.textContent = 'Checking…';
  }

  try {
    log(`[env] Root ${ROOT} | preview: ${isVercelPreview}`);
    writeStatus('Connecting to Gun relay…');

    const { path, put, sub, once } = await createGun();

    log('[gun] Relay module loaded');

    // Gun graph layout: root -> demo -> counter -> {PR}. Each PR gets an isolated counter node.
    const counter = path('demo', 'counter', PR);
    log(`[gun] Path demo/counter/${PR}`);

    const currentRaw = await once(counter);
    const current = Number(currentRaw) || 0;
    log(`[gun] Current value ${current}`);

    const nextValue = Number(current) + 1;
    await put(counter, nextValue);
    log(`[gun] Wrote value ${nextValue}`);

    if (counterEl) {
      counterEl.textContent = String(nextValue);
    }
    writeStatus('Connected and listening', 'success');

    const unsubscribe = sub(counter, value => {
      const numericValue = Number(value);
      const displayValue = Number.isFinite(numericValue) ? numericValue : value;
      log(`[gun] Update received ${JSON.stringify({ value: displayValue })}`);
      if (counterEl) {
        counterEl.textContent = Number.isFinite(numericValue)
          ? String(numericValue)
          : String(displayValue ?? '—');
      }
    });

    // Expose an escape hatch so previews can manually stop listening if needed.
    if (typeof window !== 'undefined') {
      window.__gunDemoOff = unsubscribe;
    }
  } catch (error) {
    console.error('[gun] counter demo failed', error);
    log(`[error] ${error?.message || error}`);
    writeStatus('Connection failed', 'error');
    if (counterEl) {
      counterEl.textContent = 'Error';
    }
  }
})();
