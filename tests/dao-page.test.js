import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const portalRoot = new URL('../', import.meta.url);

describe('3DVR DAO research page', () => {
  it('keeps the AXE-inspired credits idea simple and clearly experimental', async () => {
    const page = await readFile(new URL('dao/index.html', portalRoot), 'utf8');

    assert.match(page, /<h1>3DVR DAO<\/h1>/);
    assert.match(page, /Do useful work/);
    assert.match(page, /Get a receipt/);
    assert.match(page, /Earn credits/);
    assert.match(page, /Help decide/);
    assert.match(page, /Experiment only · no token sale/);
    assert.match(page, /No real money\. No speculation\./);
    assert.match(page, /Trusting Strangers with Axes/);
    assert.match(page, /gun\.eco\/docs\/Trusting-Strangers-with-Axes/);
    assert.match(page, /github\.com\/amark\/gun\/wiki\/AXE/);
  });
});
