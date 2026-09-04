import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const portalRoot = new URL('../', import.meta.url);

describe('3DVR DAO dashboard', () => {
  it('shows a working governance, treasury, and capital-allocation prototype', async () => {
    const page = await readFile(new URL('dao/index.html', portalRoot), 'utf8');

    assert.match(page, /Build 3DVR\./);
    assert.match(page, /Earn a voice\./);
    assert.match(page, /Proposal #001/);
    assert.match(page, /Support proposal/);
    assert.match(page, /Delegate my voice/);
    assert.match(page, /Your contribution wallet/);
    assert.match(page, /Community grants/);
    assert.match(page, /Investment pool/);
    assert.match(page, /AI Capital Scout/);
    assert.match(page, /Public receipt trail/);
    assert.match(page, /How GUN fits/);
    assert.match(page, /Could 3DVR invest\?/);
    assert.match(page, /simulated credits and money/);
    assert.match(page, /data-vote="yes"/);
    assert.match(page, /demoReceipt/);
    assert.match(page, /Trusting Strangers with Axes/);
    assert.match(page, /gun\.eco\/docs\/Trusting-Strangers-with-Axes/);
  });
});
