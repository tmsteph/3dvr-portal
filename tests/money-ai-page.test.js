import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../money-ai/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('money-ai control center', () => {
  it('ships index + app scripts with Gun and loop controls', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'money-ai/index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /Money Loop Control Center/);
    assert.match(html, /id="money-loop-form"/);
    assert.match(html, /id="autopilot-run"/);
    assert.match(html, /id="autopilot-token-request"/);
    assert.match(html, /id="autopilot-email"/);
    assert.match(html, /id="autopilot-token"/);
    assert.match(html, /id="market-focus"/);
    assert.match(html, /id="opportunity-list"/);
    assert.match(html, /id="rate-limit-summary"/);
    assert.match(html, /id="publish-summary"/);
    assert.match(html, /id="promotion-summary"/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+src="\/score\.js"/);
    assert.match(html, /<script[^>]+src="\.\/app\.js"/);
  });

  it('documents explicit portal money-ai node paths in the sync module', async () => {
    const syncUrl = new URL('gun-sync.js', baseDir);
    assert.equal(await fileExists(syncUrl), true, 'money-ai/gun-sync.js should exist');

    const js = await readFile(syncUrl, 'utf8');
    assert.ok(js.includes("root.get('3dvr-portal')"));
    assert.ok(js.includes("moneyRoot.get('runs')"));
    assert.ok(js.includes("moneyRoot.get('opportunities')"));
    assert.ok(js.includes("moneyRoot.get('ads')"));
    assert.ok(js.includes("legacyRoot.get('runs')"));
  });
});
