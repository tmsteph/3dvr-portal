// src/gun/example-usage.js
// Minimal counter demo so every environment can confirm relay reads/writes are synced.
import { createGun } from './adapter.js';
import { getEnvInfo } from './env.js';

(async () => {
  const { ROOT, PR, isVercelPreview } = getEnvInfo();
  const { path, put, sub, once } = await createGun();

  // Gun graph layout: root -> demo -> counter -> {PR}. Each PR gets an isolated counter node.
  const counter = path('demo', 'counter', PR);
  const current = (await once(counter)) || 0;
  await put(counter, Number(current) + 1);

  const unsubscribe = sub(counter, value => {
    console.log('[gun] counter update', { ROOT, value, isVercelPreview });
    const el = document.getElementById('counter');
    if (el) el.textContent = String(value);
  });

  // Expose an escape hatch so previews can manually stop listening if needed.
  if (typeof window !== 'undefined') {
    window.__gunDemoOff = unsubscribe;
  }
})();
