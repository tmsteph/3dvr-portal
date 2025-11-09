import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../finance/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('finance ledger hub', () => {
  it('includes an index page wired to the finance script and Gun node', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /3dvr Finance/);
    assert.match(html, /<form[^>]+id="expenditure-form"/);
    assert.match(html, /<link[^>]+href="\.\/styles.css"/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/sea\.js"/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/axe\.js"/);
    assert.match(html, /<script[^>]+src="\.\.\/score.js"/);
    assert.match(html, /<script[^>]+src="\.\/app.js"/);
  });

  it('ships a stylesheet tailored for the finance layout', async () => {
    const stylesUrl = new URL('styles.css', baseDir);
    assert.equal(await fileExists(stylesUrl), true, 'styles.css should exist');

    const css = await readFile(stylesUrl, 'utf8');
    assert.match(css, /\.finance-shell/);
    assert.match(css, /\.finance-ledger/);
    assert.match(css, /\.finance-card/);
  });

  it('persists entries to the finance\/expenditures Gun graph with documented structure', async () => {
    const scriptUrl = new URL('app.js', baseDir);
    assert.equal(await fileExists(scriptUrl), true, 'app.js should exist');

    const js = await readFile(scriptUrl, 'utf8');
    assert.match(js, /Gun\(window\.__GUN_PEERS__ \|\| \[/);
    assert.ok(js.includes("gun.get('finance').get('expenditures')"));
    assert.match(js, /financeLedger\.get\(/);
    assert.match(js, /form\.addEventListener\('submit'/);
    assert.match(js, /Gun\.text\.random/);
  });

  it('registers the finance workspace in the portal app grid', async () => {
    const portalIndex = new URL('../index.html', baseDir);
    assert.equal(await fileExists(portalIndex), true, 'root index.html should exist');

    const html = await readFile(portalIndex, 'utf8');
    const financeIndex = html.indexOf('>Finance<');
    const gamesIndex = html.indexOf('>Games<');
    assert.ok(financeIndex !== -1, 'Finance app card should be listed on the portal');
    assert.ok(gamesIndex !== -1, 'Games app card should still be present');
    assert.ok(financeIndex < gamesIndex, 'Finance card should appear before Games to keep alphabetical order');
    assert.match(html, /href="finance\/(?:index\.html)?"/);
  });
});
