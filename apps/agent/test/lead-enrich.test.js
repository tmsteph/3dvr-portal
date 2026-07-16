const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectCandidatePages,
  decideEnrichmentUpdate,
  enrichLead,
  extractEmails,
  extractMailto,
  isPlaceholderEmail,
} = require('../thomas-agent/node/lead-enrich');

test('extractMailto decodes encoded mailto values', () => {
  const html = [
    '<a href="mailto:owner%40example.com?subject=Hello">Email</a>',
    '<a href="mailto:ignored%40wixpress.com">Ignore</a>',
  ].join('\n');

  assert.equal(extractMailto(html), 'mailto:owner@example.com');
});

test('extractEmails decodes obfuscated visible emails and prefers the site domain', () => {
  const html = [
    '<p>hello [at] agency [dot] com</p>',
    '<p>owner%40example.com</p>',
    '<p>billing@example.net</p>',
    '<p>jill@agency.com</p>',
  ].join('\n');

  assert.deepEqual(extractEmails(html, 'https://example.com'), [
    'owner@example.com',
    'billing@example.net',
    'jill@agency.com',
  ]);
});

test('isPlaceholderEmail skips framework and placeholder addresses', () => {
  assert.equal(isPlaceholderEmail('hello@example.com'), true);
  assert.equal(isPlaceholderEmail('noreply@example.com'), true);
  assert.equal(isPlaceholderEmail('assets@wixpress.com'), true);
  assert.equal(isPlaceholderEmail('owner@example.com'), false);
});

test('collectCandidatePages adds fallback contact pages and respects the cap', () => {
  const html = '<a href="/team">Team</a><a href="/contact-us">Contact</a><a href="/pricing">Pricing</a>';
  const pages = collectCandidatePages(html, 'https://example.com', 3);

  assert.deepEqual(pages, [
    'https://example.com',
    'https://example.com/contact-us',
    'https://example.com/contact',
  ]);
});

test('enrichLead prefers the better same-domain email over a weaker third-party email', async () => {
  const pages = new Map([
    ['https://example.com/', '<a href="/contact">Contact</a><p>hello@agency.com</p>'],
    ['https://example.com/contact', '<p>owner@example.com</p>'],
  ]);

  const result = await enrichLead(
    { name: 'Acme Studio', link: 'https://example.com', contact: '', variant: '' },
    {
      fetchImpl: async (url) => ({
        ok: true,
        url,
        headers: {
          get(name) {
            return name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null;
          },
        },
        async text() {
          return pages.get(url) || '';
        },
      }),
      maxPages: 2,
    },
  );

  assert.equal(result.source, 'email');
  assert.equal(result.contact, 'mailto:owner@example.com');
});

test('enrichLead falls back to a form route when no email is available', async () => {
  const pages = new Map([
    ['https://example.com/', '<form method="post" action="/contact/send"><input name="name" /></form>'],
  ]);

  const result = await enrichLead(
    { name: 'Acme Studio', link: 'https://example.com', contact: '', variant: '' },
    {
      fetchImpl: async (url) => ({
        ok: true,
        url,
        headers: {
          get(name) {
            return name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null;
          },
        },
        async text() {
          return pages.get(url) || '';
        },
      }),
      maxPages: 1,
    },
  );

  assert.equal(result.source, 'form');
  assert.equal(result.contact, 'https://example.com/');
  assert.equal(result.detail, 'https://example.com/contact/send');
});

test('decideEnrichmentUpdate keeps mailto leads unless prefer-form refresh is explicit', () => {
  const row = {
    name: 'Acme Studio',
    link: 'https://example.com',
    contact: 'mailto:owner@example.com',
    variant: 'osm-service+route=email',
  };
  const result = {
    contact: 'https://example.com/contact',
    source: 'form',
    detail: 'https://example.com/contact/send',
  };

  const normal = decideEnrichmentUpdate(row, result, {});
  assert.equal(normal.shouldReplaceContact, false);
  assert.equal(normal.nextVariant, 'osm-service+route=email');

  const explicit = decideEnrichmentUpdate(row, result, { refresh: true, preferForm: true });
  assert.equal(explicit.shouldReplaceContact, true);
  assert.equal(explicit.nextVariant, 'osm-service+route=form');
});
