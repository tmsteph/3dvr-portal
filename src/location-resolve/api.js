const NOMINATIM_ORIGIN = 'https://nominatim.openstreetmap.org';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();
let nextRequestAt = 0;

function clean(value = '', max = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cityFromAddress(address = {}) {
  return clean(
    address.city || address.town || address.village || address.municipality
    || address.hamlet || address.county || ''
  );
}

export function normalizePlaceResult(result = {}) {
  const address = result.address || {};
  const city = cityFromAddress(address);
  const state = clean(address.state || address.region || '');
  const postcode = clean(address.postcode || '');
  const country = clean(address.country || '');
  const countryCode = clean(address.country_code || '').toUpperCase();
  const label = [city, state, postcode]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(', ') || clean(result.display_name || '');

  return {
    label,
    city,
    state,
    postcode,
    country,
    countryCode,
    lat: Number(result.lat),
    lon: Number(result.lon)
  };
}

async function throttle() {
  const delay = Math.max(0, nextRequestAt - Date.now());
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  nextRequestAt = Date.now() + 1100;
}

async function nominatimFetch(url, fetchImpl = globalThis.fetch, throttleImpl = throttle) {
  const key = url.toString();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  await throttleImpl();
  const response = await fetchImpl(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en',
      'Referer': 'https://portal.3dvr.tech/campaigns/',
      'User-Agent': '3DVR-Portal/1.0 (https://portal.3dvr.tech/)'
    }
  });
  if (!response.ok) {
    const error = new Error(`Location lookup returned ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }
  const value = await response.json();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function json(res, status, body) {
  res.status(status);
  return res.json(body);
}

export function createLocationResolveHandler({ fetchImpl = globalThis.fetch, throttleImpl = throttle } = {}) {
  return async function locationResolveHandler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    const q = clean(req.query?.q);
    const lat = Number(req.query?.lat);
    const lon = Number(req.query?.lon);

    try {
      if (q) {
        const url = new URL('/search', NOMINATIM_ORIGIN);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('dedupe', '1');
        url.searchParams.set('limit', '5');
        url.searchParams.set('q', q);
        const raw = await nominatimFetch(url, fetchImpl, throttleImpl);
        const candidates = (Array.isArray(raw) ? raw : [])
          .map(normalizePlaceResult)
          .filter(item => item.label && Number.isFinite(item.lat) && Number.isFinite(item.lon));
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        return json(res, 200, { ok: true, mode: 'search', query: q, candidates });
      }

      if (Number.isFinite(lat) && Number.isFinite(lon)
        && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        const url = new URL('/reverse', NOMINATIM_ORIGIN);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('zoom', '12');
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lon', String(lon));
        const raw = await nominatimFetch(url, fetchImpl, throttleImpl);
        const candidate = normalizePlaceResult(raw || {});
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        return json(res, 200, {
          ok: true,
          mode: 'reverse',
          candidate: candidate.label ? candidate : null
        });
      }

      return json(res, 400, {
        error: 'Provide a place query or latitude/longitude.',
        code: 'location_input_required'
      });
    } catch (error) {
      return json(res, error?.statusCode || 500, {
        error: error?.message || 'Location lookup failed.',
        code: 'location_lookup_failed'
      });
    }
  };
}

export default createLocationResolveHandler();
