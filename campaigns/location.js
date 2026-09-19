function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function looksSpecificLocation(value = '') {
  const text = clean(value);
  return Boolean(
    /,/.test(text)
    || /\b[A-Z]{2}\b/i.test(text)
    || /\b\d{5}(?:-\d{4})?\b/.test(text)
  );
}

function uniquePlaces(candidates = []) {
  const seen = new Set();
  return candidates.filter(candidate => {
    const key = clean(candidate?.label).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isAmbiguousLocation(value, candidates = []) {
  if (looksSpecificLocation(value)) return false;
  const places = uniquePlaces(candidates);
  if (places.length < 2) return false;
  const regions = new Set(places.map(item =>
    [clean(item.state), clean(item.countryCode)].filter(Boolean).join('|').toLowerCase()
  ));
  return regions.size > 1;
}

async function requestJson(url, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Location lookup failed.');
    error.code = payload.code || 'location_lookup_failed';
    throw error;
  }
  return payload;
}

function currentPosition(geolocation, timeoutMs = 6500) {
  return new Promise((resolve, reject) => {
    if (!geolocation?.getCurrentPosition) {
      reject(new Error('Browser location is unavailable.'));
      return;
    }
    geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1000,
        timeout: timeoutMs
      }
    );
  });
}

export async function resolveTypedLocation(value, {
  fetchImpl = globalThis.fetch,
  origin = globalThis.location?.origin || ''
} = {}) {
  const query = clean(value);
  if (!query) return { mode: 'empty', candidates: [] };
  const url = new URL('/api/openai-site', origin || 'https://portal.3dvr.tech');
  url.searchParams.set('provider', 'location-resolve');
  url.searchParams.set('q', query);
  const payload = await requestJson(url.toString(), fetchImpl);
  const candidates = uniquePlaces(payload.candidates || []);
  return {
    mode: 'typed',
    query,
    candidates,
    ambiguous: isAmbiguousLocation(query, candidates),
    candidate: candidates[0] || null
  };
}

export async function resolveBrowserLocation({
  geolocation = globalThis.navigator?.geolocation,
  fetchImpl = globalThis.fetch,
  origin = globalThis.location?.origin || ''
} = {}) {
  const position = await currentPosition(geolocation);
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Browser location did not return usable coordinates.');
  }

  const lat = Math.round(latitude * 1000) / 1000;
  const lon = Math.round(longitude * 1000) / 1000;
  const url = new URL('/api/openai-site', origin || 'https://portal.3dvr.tech');
  url.searchParams.set('provider', 'location-resolve');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  const payload = await requestJson(url.toString(), fetchImpl);

  return {
    mode: 'browser',
    candidate: payload.candidate || null,
    approximateCoordinates: { lat, lon }
  };
}
