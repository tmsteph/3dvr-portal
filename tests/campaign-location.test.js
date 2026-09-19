import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAmbiguousLocation,
  looksSpecificLocation,
  resolveBrowserLocation,
  resolveTypedLocation
} from '../campaigns/location.js';
import {
  createLocationResolveHandler,
  normalizePlaceResult
} from '../src/location-resolve/api.js';

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('manual location specificity distinguishes city-only from city/state or ZIP', () => {
  assert.equal(looksSpecificLocation('Springfield'), false);
  assert.equal(looksSpecificLocation('Springfield, IL'), true);
  assert.equal(looksSpecificLocation('62704'), true);

  const candidates = [
    { label: 'Springfield, Illinois, 62701', state: 'Illinois', countryCode: 'US' },
    { label: 'Springfield, Missouri, 65806', state: 'Missouri', countryCode: 'US' }
  ];
  assert.equal(isAmbiguousLocation('Springfield', candidates), true);
  assert.equal(isAmbiguousLocation('Springfield, IL', candidates), false);
});

test('typed location returns candidates through the shared portal API route', async () => {
  let requested = '';
  const result = await resolveTypedLocation('Springfield', {
    origin: 'https://portal.3dvr.tech',
    fetchImpl: async url => {
      requested = String(url);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { label: 'Springfield, Illinois, 62701', state: 'Illinois', countryCode: 'US' },
            { label: 'Springfield, Missouri, 65806', state: 'Missouri', countryCode: 'US' }
          ]
        })
      };
    }
  });

  assert.match(requested, /provider=location-resolve/);
  assert.match(requested, /q=Springfield/);
  assert.equal(result.ambiguous, true);
  assert.equal(result.candidates.length, 2);
});

test('browser location rounds coordinates before reverse geocoding', async () => {
  let requested = '';
  const geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 32.7157384, longitude: -117.1610838 } });
    }
  };

  const result = await resolveBrowserLocation({
    geolocation,
    origin: 'https://portal.3dvr.tech',
    fetchImpl: async url => {
      requested = String(url);
      return {
        ok: true,
        json: async () => ({
          candidate: { label: 'San Diego, California, 92101', state: 'California', countryCode: 'US' }
        })
      };
    }
  });

  assert.match(requested, /lat=32.716/);
  assert.match(requested, /lon=-117.161/);
  assert.equal(result.candidate.label, 'San Diego, California, 92101');
});
