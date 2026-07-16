const test = require('node:test');
const assert = require('node:assert/strict');
const { assessWebsiteHtml, qualifyLeadWebsite } = require('../thomas-agent/node/lead-quality');

test('classifies a current multi-section business website as substantial', () => {
  const words = Array.from({ length: 140 }, (_, index) => `service${index}`).join(' ');
  const html = `<h1>Acme</h1><h2>Services</h2><h2>About</h2><p>${words}</p><a href="/services">Services</a><a href="/about">About</a><a href="/contact">Contact us</a>`;
  assert.equal(assessWebsiteHtml(html, 'https://acme.example').classification, 'substantial');
});

test('classifies placeholders and sparse pages as weak', () => {
  assert.equal(assessWebsiteHtml('<h1>Coming soon</h1>', 'https://acme.example').classification, 'weak');
  assert.equal(assessWebsiteHtml('<h1>Acme</h1><p>Call us for details.</p>', 'https://acme.example').classification, 'weak');
});

test('website qualification fails closed when a site cannot be verified', async () => {
  const result = await qualifyLeadWebsite({ link: 'https://blocked.example' }, {
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  assert.equal(result.qualified, false);
  assert.equal(result.classification, 'unverified');
});
