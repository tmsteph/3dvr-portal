const test = require('node:test');
const assert = require('node:assert/strict');

const {
  actionLabel,
  applyRouteToVariant,
  leadAction,
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

test('leadAction maps routes to next-step actions', () => {
  assert.equal(leadAction({ contact: 'mailto:owner@example.com', link: 'https://example.com' }), 'email');
  assert.equal(leadAction({ contact: 'https://example.com/contact', link: 'https://example.com' }), 'form');
  assert.equal(leadAction({ contact: 'https://example.com', link: 'https://example.com' }), 'open');
  assert.equal(leadAction({ contact: '', link: '' }), 'unreachable');
});

test('actionLabel normalizes action strings', () => {
  assert.equal(actionLabel('EMAIL'), 'email');
  assert.equal(actionLabel('whatever'), 'review');
});

test('applyRouteToVariant preserves other tags and replaces route tags', () => {
  assert.equal(applyRouteToVariant('osm-service', 'email'), 'osm-service+route=email');
  assert.equal(applyRouteToVariant('osm-service+route=email', 'form'), 'osm-service+route=form');
  assert.equal(applyRouteToVariant('osm-service+route=contact-page', 'site'), 'osm-service+route=site');
});
