import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../email-operator/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('email operator hub', () => {
  it('ships the operator page with a real queue, detail pane, and Gun-backed app shell', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /Email Operator/);
    assert.match(html, /Approval-first automation/);
    assert.match(html, /id="thread-list"/);
    assert.match(html, /id="thread-subject"/);
    assert.match(html, /id="draft-editor"/);
    assert.match(html, /id="notes-editor"/);
    assert.match(html, /id="operator-prompt"/);
    assert.match(html, /data-filter="approval"/);
    assert.match(html, /data-operator-action="approve-send"/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+src="\.\.\/auth-identity\.js"/);
    assert.match(html, /<script[^>]+src="\.\.\/score\.js"/);
    assert.match(html, /<script[^>]+src="\.\/app\.js"/);

    const portalIndex = new URL('../index.html', baseDir);
    const portalHtml = await readFile(portalIndex, 'utf8');
    const deployGuidesIndex = portalHtml.indexOf('>Deploy Guides<');
    const emailIndex = portalHtml.indexOf('>Email Operator<');
    const billingIndex = portalHtml.indexOf('>Billing<');
    assert.ok(emailIndex !== -1, 'Email Operator app card should be listed on the portal');
    assert.ok(deployGuidesIndex !== -1, 'Deploy Guides app card should still be present');
    assert.ok(billingIndex !== -1, 'Billing app card should still be present');
    assert.ok(deployGuidesIndex < emailIndex, 'Email Operator should render after Deploy Guides');
    assert.ok(emailIndex < billingIndex, 'Email Operator should render before Billing');
    assert.match(portalHtml, /href="email-operator\/(?:index\.html)?"/);
  });

  it('ships a stylesheet tailored for the operator workspace layout', async () => {
    const stylesUrl = new URL('styles.css', baseDir);
    assert.equal(await fileExists(stylesUrl), true, 'styles.css should exist');

    const css = await readFile(stylesUrl, 'utf8');
    assert.match(css, /\.operator-layout/);
    assert.match(css, /\.thread-list/);
    assert.match(css, /\.editor-grid/);
    assert.match(css, /\.status-chip--approval/);
  });

  it('ships Gun-backed app logic for per-operator queues and draft generation', async () => {
    const appUrl = new URL('app.js', baseDir);
    assert.equal(await fileExists(appUrl), true, 'app.js should exist');

    const js = await readFile(appUrl, 'utf8');
    assert.match(js, /get\('3dvr-portal'\)\s*:\s*createLocalGunNodeStub\(\)/);
    assert.match(js, /get\('operators'\)\.get\(state\.operator\.key\)/);
    assert.match(js, /threadsNode\.map\(\)\.on/);
    assert.match(js, /seedOperatorThreads/);
    assert.match(js, /generateDraftTemplate/);
    assert.match(js, /buildWorkbenchPrompt/);
    assert.match(js, /3dvr-portal\/emailOperator\/operators/);
  });
});
