import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('cell cross-app integration', () => {
  it('threads cell context through contacts, CRM, and finance', async () => {
    const contactsHtmlUrl = new URL('../contacts/index.html', import.meta.url);
    const crmHtmlUrl = new URL('../crm/index.html', import.meta.url);
    const crmJsUrl = new URL('../crm/app.js', import.meta.url);
    const financeHtmlUrl = new URL('../finance/index.html', import.meta.url);
    const financeJsUrl = new URL('../finance/app.js', import.meta.url);
    const financeCssUrl = new URL('../finance/styles.css', import.meta.url);

    assert.equal(await fileExists(contactsHtmlUrl), true, 'contacts index should exist');
    assert.equal(await fileExists(crmHtmlUrl), true, 'crm index should exist');
    assert.equal(await fileExists(crmJsUrl), true, 'crm app script should exist');
    assert.equal(await fileExists(financeHtmlUrl), true, 'finance index should exist');
    assert.equal(await fileExists(financeJsUrl), true, 'finance app script should exist');
    assert.equal(await fileExists(financeCssUrl), true, 'finance stylesheet should exist');

    const contactsHtml = await readFile(contactsHtmlUrl, 'utf8');
    const crmHtml = await readFile(crmHtmlUrl, 'utf8');
    const crmJs = await readFile(crmJsUrl, 'utf8');
    const financeHtml = await readFile(financeHtmlUrl, 'utf8');
    const financeJs = await readFile(financeJsUrl, 'utf8');
    const financeCss = await readFile(financeCssUrl, 'utf8');

    assert.match(contactsHtml, /portalCellLink/);
    assert.match(contactsHtml, /cellContextBanner/);
    assert.match(contactsHtml, /cellContextLink/);
    assert.match(contactsHtml, /Cell/);

    assert.match(crmHtml, /cellContextBanner/);
    assert.match(crmHtml, /Cell/);
    assert.match(crmJs, /cellContextId/);
    assert.match(crmJs, /refreshCellContextBanner/);

    assert.match(financeHtml, /cellContextBanner/);
    assert.match(financeHtml, /Cell/);
    assert.match(financeJs, /cellContextId/);
    assert.match(financeJs, /refreshCellContextBanner/);
    assert.match(financeCss, /finance-cell-context/);
  });
});
