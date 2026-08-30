import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageDir = new URL('../micro-support/', import.meta.url);

describe('micro support pilot', () => {
  it('ships tiny support tiers with clear non-investment language', async () => {
    const html = await readFile(new URL('index.html', pageDir), 'utf8');

    assert.match(html, /Micro Support \| 3DVR Portal/);
    assert.match(html, /\$1/);
    assert.match(html, /\$5/);
    assert.match(html, /Signal/);
    assert.match(html, /Boost/);
    assert.match(html, /https:\/\/buy\.stripe\.com\/aFa5kDadUdWrdNleUIc7u0l/);
    assert.match(html, /https:\/\/buy\.stripe\.com\/6oU6oH99Q3hN38H5k8c7u0m/);
    assert.match(html, /This is support, not an investment product\./);
    assert.match(html, /does not offer equity, interest, repayment, profit-sharing, or a financial return/);
    assert.match(html, /not presented as tax-deductible charitable donations/);
  });

  it('ships a Stripe return page', async () => {
    const html = await readFile(new URL('success.html', pageDir), 'utf8');
    assert.match(html, /Signal sent\./);
    assert.match(html, /Support another/);
    assert.match(html, /Back to Portal/);
  });
});
