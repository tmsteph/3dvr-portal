import test from 'node:test';
import assert from 'node:assert/strict';
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

test('normalizes geocoder output to city/state/postcode instead of a street address', () => {
  const place = normalizePlaceResult({
    lat: '32.7157',
    lon: '-117.1611',
    display_name: '100 Example St, San Diego, California, United States',
    address: {
      house_number: '100',
      road: 'Example St',
      city: 'San Diego',
      state: 'California',
      postcode: '92101',
      country: 'United States',
      country_code: 'us'
    }
  });

  assert.equal(place.label, 'San Diego, California, 92101');
  assert.equal(place.countryCode, 'US');
  assert.doesNotMatch(place.label, /Example St/);
});

test('reverse location lookup returns an approximate normalized place', async () => {
  let requested = '';
  let headers = null;
  const handler = createLocationResolveHandler({
    throttleImpl: async () => {},
    fetchImpl: async (url, options) => {
      requested = String(url);
      headers = options.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          lat: '32.716',
          lon: '-117.161',
          address: {
            city: 'San Diego',
            state: 'California',
            postcode: '92101',
            country: 'United States',
            country_code: 'us'
          }
        })
      };
    }
  });
  const res = mockResponse();
  await handler({
    method: 'GET',
    query: { provider: 'location-resolve', lat: '32.716', lon: '-117.161' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.candidate.label, 'San Diego, California, 92101');
  assert.match(requested, /\/reverse\?/);
  assert.match(headers['User-Agent'], /3DVR-Portal/);
});

test('typed location lookup returns multiple candidates for ambiguity handling', async () => {
  const handler = createLocationResolveHandler({
    throttleImpl: async () => {},
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ([
        {
          lat: '39.80',
          lon: '-89.64',
          address: { city: 'Springfield', state: 'Illinois', postcode: '62701', country_code: 'us' }
        },
        {
          lat: '37.21',
          lon: '-93.29',
          address: { city: 'Springfield', state: 'Missouri', postcode: '65806', country_code: 'us' }
        }
      ])
    })
  });
  const res = mockResponse();
  await handler({ method: 'GET', query: { q: 'Springfield' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.candidates.length, 2);
  assert.equal(res.body.candidates[0].state, 'Illinois');
  assert.equal(res.headers['Cache-Control'], 'public, max-age=3600, s-maxage=86400');
});
