import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const portalRoot = new URL('../', import.meta.url);

describe('3DVR DAO pages', () => {
  it('keeps the main DAO page simple and sends the interactive example to a separate page', async () => {
    const page = await readFile(new URL('dao/index.html', portalRoot), 'utf8');

    assert.match(page, /What is a DAO\?/);
    assert.match(page, /Decentralized Autonomous Organization/);
    assert.match(page, /does <strong>not<\/strong> need its own coin/);
    assert.match(page, /Blockchain is common/);
    assert.match(page, /Autonomous.*does not mean AI runs the organization/s);
    assert.match(page, /What would that mean for 3DVR\?/);
    assert.match(page, /future coin or token remains optional/);
    assert.match(page, /DAO should work without one/);
    assert.match(page, /Quick next experiment/);
    assert.match(page, /3DVR Credits/);
    assert.match(page, /record one useful contribution in GUN/);
    assert.match(page, /sign the receipt with SEA/);
    assert.match(page, /do not automatically make every value immutable/);
    assert.match(page, /financial double-spending/);
    assert.match(page, /Where could a coin fit\?/);
    assert.match(page, /separate experiment, not a requirement for the DAO/);
    assert.match(page, /Then AXE/);
    assert.match(page, /Could 3DVR invest money too\?/);
    assert.match(page, /separate experiment rather than pretending to represent all of 3DVR/);
    assert.match(page, /href="\.\/demo\/"/);
    assert.doesNotMatch(page, /data-vote=/);
    assert.doesNotMatch(page, /reputation-weighted/);
    assert.doesNotMatch(page, /settlement/i);
    assert.match(page, /Trusting Strangers with Axes/);
  });

  it('puts the interactive example on the demo page using plain language', async () => {
    const demo = await readFile(new URL('dao/demo/index.html', portalRoot), 'utf8');

    assert.match(demo, /What could shared decision-making feel like\?/);
    assert.match(demo, /Should 3DVR buy three RISC-V boards/);
    assert.match(demo, /Let someone I trust vote for me/);
    assert.match(demo, /Your history/);
    assert.match(demo, /Shared money/);
    assert.match(demo, /Where could AI help\?/);
    assert.match(demo, /data-vote="yes"/);
    assert.match(demo, /demoReceipt/);
    assert.doesNotMatch(demo, /reputation-weighted/);
    assert.doesNotMatch(demo, /settlement/i);
    assert.doesNotMatch(demo, /capital scout/i);
  });
});
