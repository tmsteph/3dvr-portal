import fs from 'node:fs/promises';
import path from 'node:path';

async function configuredBridgeOrigin(options = {}) {
  const direct = String(options.bridgeOrigin || process.env.THREEDVR_ORGANISM_BRIDGE_URL || '').trim();
  if (direct) return direct;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'runtime', 'organism-bridge.json'), 'utf8');
    return String(JSON.parse(raw)?.origin || '').trim();
  } catch {
    return '';
  }
}

function normalizeBridgeOrigin(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function createOrganismVercelRelay(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return async function organismVercelRelay(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' });

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const bridgeOrigin = normalizeBridgeOrigin(await configuredBridgeOrigin(options));
    if (!bridgeOrigin) {
      return res.status(503).json({
        ok: false,
        error: 'Your private Digital Organism bridge is syncing. Try again shortly.'
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
    try {
      const upstream = await fetchImpl(`${bridgeOrigin}/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: controller.signal
      });
      const data = await upstream.json().catch(() => ({ ok: false, error: 'Private bridge returned invalid JSON.' }));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(upstream.status).json(data);
    } catch (error) {
      console.error('Organism bridge relay failed:', error?.message || error);
      return res.status(503).json({ ok: false, error: 'Your private Digital Organism is temporarily unreachable.' });
    } finally {
      clearTimeout(timer);
    }
  };
}
