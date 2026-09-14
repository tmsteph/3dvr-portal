import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAssemblyState } from '../assembly/data.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assembly preserves valid need-to-offer matches in portable state', () => {
  const normalized = normalizeAssemblyState({
    offers: [{ id: 'o1', text: 'Design review', owner: 'Ava' }],
    needs: [{ id: 'n1', text: 'Need feedback', owner: 'Core', matchedOfferId: 'o1', done: true }],
  });

  assert.equal(normalized.offers[0].text, 'Design review');
  assert.equal(normalized.needs[0].matchedOfferId, 'o1');
});

test('Assembly clears need matches that point at missing offers', () => {
  const normalized = normalizeAssemblyState({
    offers: [],
    needs: [{ id: 'n1', text: 'Need help', matchedOfferId: 'missing', done: true }],
  });

  assert.equal(normalized.needs[0].matchedOfferId, '');
});

test('Assembly exposes reusable offers, matching, and support receipts', async () => {
  const [html, app, data, css] = await Promise.all([
    read('assembly/index.html'),
    read('assembly/app.js'),
    read('assembly/data.js'),
    read('assembly/support.css'),
  ]);

  assert.match(html, /id="offerForm"/);
  assert.match(html, /id="offerList"/);
  assert.match(html, /id="supportHistoryList"/);
  assert.match(html, /href="\.\/support\.css"/);
  assert.match(app, /need-match-form/);
  assert.match(app, /matchedOfferId: offerId/);
  assert.match(app, /function renderSupportHistory\(\)/);
  assert.match(app, /close-offer/);
  assert.match(data, /matchedOfferId: text\(item\.matchedOfferId\)/);
  assert.match(data, /offers: records\(source\.offers\)/);
  assert.match(css, /\.support-grid/);
});
