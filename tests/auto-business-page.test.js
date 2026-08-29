import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl = new URL('../auto-business/index.html', import.meta.url);
const appUrl = new URL('../auto-business/app.js', import.meta.url);

describe('auto-business control room', () => {
  it('ships the demand-to-revenue control room', async () => {
    const html = await readFile(pageUrl, 'utf8');
    assert.match(html, /Find demand\. Sell the result\. Assemble fulfillment\./);
    assert.match(html, /Demand Radar/);
    assert.match(html, /Automation Quick Win/);
    assert.match(html, /What other autonomous businesses taught us/);
    assert.match(html, /Project Vend/);
    assert.match(html, /THICKET/);
    assert.match(html, /Kill condition/);
  });

  it('reads the existing Market Pulse latest record', async () => {
    const js = await readFile(appUrl, 'utf8');
    assert.match(js, /market-pulse/);
    assert.match(js, /reactionSnapshotsJson/);
    assert.match(js, /opportunitiesJson/);
    assert.match(js, /warningsJson/);
  });
});
