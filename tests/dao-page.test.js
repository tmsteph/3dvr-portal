import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const portalRoot = new URL('../', import.meta.url);

describe('3DVR DAO page', () => {
  it('explains the governance idea before showing the interactive dashboard', async () => {
    const page = await readFile(new URL('dao/index.html', portalRoot), 'utf8');

    assert.match(page, /Help build 3DVR\./);
    assert.match(page, /Help decide what it becomes\./);
    assert.match(page, /In plain English/);
    assert.match(page, /How it could work/);
    assert.match(page, /What would the community actually govern\?/);
    assert.match(page, /Try a simple example/);
    assert.match(page, /What could this feel like\?/);
    assert.ok(page.indexOf('In plain English') < page.indexOf('Example proposal #001'));
    assert.match(page, /Support proposal/);
    assert.match(page, /Delegate my voice/);
    assert.match(page, /Your contribution history/);
    assert.match(page, /Community treasury/);
    assert.match(page, /Future capital pool/);
    assert.match(page, /AI Capital Scout/);
    assert.match(page, /Public receipt trail/);
    assert.match(page, /Why GUN \+ AXE\?/);
    assert.match(page, /Could 3DVR eventually invest\?/);
    assert.match(page, /data-vote="yes"/);
    assert.match(page, /demoReceipt/);
    assert.match(page, /Trusting Strangers with Axes/);
    assert.match(page, /gun\.eco\/docs\/Trusting-Strangers-with-Axes/);
  });
});
