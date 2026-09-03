import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const portalRoot = new URL('../', import.meta.url);

describe('3DVR DAO research page', () => {
  it('explains the AXE-inspired credits direction without presenting a launched token', async () => {
    const page = await readFile(new URL('dao/index.html', portalRoot), 'utf8');

    assert.match(page, /<h1>3DVR DAO \+ Credits<\/h1>/);
    assert.match(page, /Advanced eXchange Equation/);
    assert.match(page, /Trusting Strangers with Axes/);
    assert.match(page, /Stage 3 proposed contracts for bandwidth and relay service/);
    assert.match(page, /Research stage · no token sale/);
    assert.match(page, /first experiment should be contribution credits, not speculation/i);
    assert.match(page, /gun\.eco\/docs\/Trusting-Strangers-with-Axes/);
    assert.match(page, /github\.com\/amark\/gun\/wiki\/AXE/);
  });
});
