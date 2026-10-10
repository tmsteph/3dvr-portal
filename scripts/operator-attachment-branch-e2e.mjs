import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Exercise the branch's actual composer markup and attachment module.
// No production deployment, account, or network service is required.
const markup = await readFile('operator/index.html', 'utf8');
const form = markup.match(/<form id="operator-form">[\s\S]*?<\/form>/)?.[0];
assert.ok(form, 'Operator form is present in branch HTML');
assert.match(form, /class="operator-mode-control"/);
const moduleSource = await readFile('operator/attachments.js', 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('http://localhost:43911/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head></head><body>' + form + '</body></html>' });
    }
    if (path === '/operator/attachments.js') {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: moduleSource });
    }
    return route.abort();
  });
  await page.goto('http://localhost:43911/');
  await page.evaluate(async () => {
    const { installOperatorAttachments } = await import('/operator/attachments.js');
    window.__attachment = installOperatorAttachments({
      form: document.querySelector('#operator-form'),
      input: document.querySelector('#operator-input')
    });
  });
  const attach = page.locator('#operator-form .operator-attach');
  const fileInput = page.locator('#operator-form input[type="file"]');
  assert.equal(await attach.count(), 1, 'attachment control is installed');
  assert.equal(await fileInput.count(), 1, 'file input is installed');
  assert.equal(await attach.getAttribute('aria-label'), 'Attach image');
  assert.equal(await page.evaluate(() => {
    const actions = document.querySelector('#operator-form .operator-actions');
    const attach = actions.querySelector('.operator-attach');
    const submit = actions.querySelector('button[type="submit"]');
    return Boolean(attach && submit && attach.nextElementSibling === submit);
  }), true, 'attachment control precedes composer submit, not collaboration selector');
  await fileInput.setInputFiles({
    name: 'probe.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+0SpcAAAAASUVORK5CYII=', 'base64')
  });
  await page.waitForFunction(() => window.__attachment.getPayload().length === 1);
  assert.equal(await page.locator('.operator-attachment-tray').isVisible(), true);
  assert.equal(await page.evaluate(() => window.__attachment.getPayload()[0].type), 'image/png');
  assert.match(await page.evaluate(() => window.__attachment.getPayload()[0].dataUrl), /^data:image\/png;base64,/);
  await page.getByRole('button', { name: 'Remove attached screenshot' }).click();
  assert.equal(await page.evaluate(() => window.__attachment.getPayload().length), 0);
  console.log('PASS: branch Operator screenshot attachment, preview, payload, and removal');
} finally {
  await browser.close();
}
