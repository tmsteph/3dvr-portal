const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyRouteToVariant,
  routeFromContact,
  routeFromVariant,
} = require('../thomas-agent/node/lead-route');

test('routeFromVariant prefers explicit route tags', () => {
  assert.equal(routeFromVariant('osm-service+route=form'), 'form');
  assert.equal(routeFromVariant('osm-service+email'), 'email');
  assert.equal(routeFromVariant('osm-service+contact-page-unverified'), 'contact-page');
});

test('routeFromContact classifies common lead routes', () => {
  assert.equal(routeFromContact({ contact: 'mailto:owner@example.com', link: 'https://example.com' }), 'email');
  assert.equal(routeFromContact({ contact: 'owner@example.com', link: 'https://example.com' }), 'email');
  assert.equal(routeFromContact({ contact: 'https://example.com/contact', link: 'https://example.com' }), 'contact-page');
  assert.equal(routeFromContact({ contact: 'https://example.com', link: 'https://example.com' }), 'site');
});

test('applyRouteToVariant preserves other tags and replaces route tags', () => {
  assert.equal(applyRouteToVariant('osm-service', 'email'), 'osm-service+route=email');
  assert.equal(applyRouteToVariant('osm-service+route=email', 'form'), 'osm-service+route=form');
  assert.equal(applyRouteToVariant('osm-service+route=contact-page', 'site'), 'osm-service+route=site');
});
