import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import '../src/auth/sea.js';
import SEA from 'gun/sea.js';
import { launchConfiguredPlaywrightBrowser } from '../scripts/playwright/browser-targets.mjs';

// Browser UI + real SEA/store test. Session recovery is tested separately; no real account is used.
const accountFixture = `
export async function openCellAccount() {
  if (localStorage.getItem('signedIn') !== 'true') throw new Error('Sign in to open your private Cells.');
  const pair = JSON.parse(localStorage.getItem('testPair'));
  const node = path => ({
    get(key) { return node([...path, key]); },
    put(value, ack) { (window.testWrites ||= []).push({path, value}); ack({ok: 1}); },
    map() { return {on() {}, off() {}}; }
  });
  return {pair, sea: Gun.SEA, user: {...node([]), is: {pub: pair.pub}}};
}`;

test('mobile private Cell saves, reloads, locks on account change and blocks signed-out saves', { timeout: 45000 }, async t => {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const server = createServer(async (req, res) => {
    const route = new URL(req.url, 'http://localhost').pathname;
    const path = resolve(root, `.${route.endsWith('/') ? `${route}index.html` : route}`);
    try {
      if (!path.startsWith(`${root}/`)) throw new Error('invalid path');
      const content = await readFile(path);
      res.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : 'text/html');
      res.end(content);
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const browser = await launchConfiguredPlaywrightBrowser();
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/operator/forge.js')) return route.fulfill({contentType:'text/javascript',body:accountFixture});
    if (url.hostname === 'cdn.jsdelivr.net') {
      const file = url.pathname.endsWith('/sea.js') ? 'sea.js' : 'gun.js';
      return route.fulfill({contentType:'text/javascript',body:await readFile(resolve(root,'node_modules/gun',file),'utf8')});
    }
    if (url.hostname !== '127.0.0.1' || ['/score.js','/gun-init.js','/issue-launcher.js'].includes(url.pathname)) {
      return route.fulfill({contentType:'text/javascript',body:''});
    }
    return route.continue();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/cell/`);
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent === 'Locked');
  assert.equal(await page.locator('#cellForm button[type=submit]').isDisabled(), true);
  const first = await SEA.pair();
  await page.evaluate(pair => {
    localStorage.setItem('signedIn','true'); localStorage.setItem('alias','owner-a');
    localStorage.setItem('userPubKey',pair.pub); localStorage.setItem('testPair',JSON.stringify(pair));
  }, first);
  await page.locator('#cellRetry').click();
  await page.waitForFunction(() => !document.querySelector('#cellForm button[type=submit]').disabled);
  await page.locator('#cellName').fill('Private browser group');
  await page.locator('#purpose').fill('Private browser purpose');
  await page.locator('#cellForm button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#cellCount').textContent === '1');
  const persisted = await page.evaluate(() => JSON.stringify({writes:window.testWrites,
    cache:Object.entries(localStorage).filter(([key])=>key.startsWith('3dvr.cell.private.'))}));
  assert.doesNotMatch(persisted,/Private browser group|Private browser purpose|cellHub/);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#cellList').textContent.includes('Private browser group'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const second = await SEA.pair();
  await page.evaluate(pair => {
    localStorage.setItem('alias','owner-b'); localStorage.setItem('userPubKey',pair.pub);
    localStorage.setItem('testPair',JSON.stringify(pair));
  }, second);
  await page.waitForFunction(() => document.querySelector('#cellCount').textContent === '0');
  assert.doesNotMatch(await page.locator('#cellList').innerText(), /Private browser group/);
  await page.evaluate(() => localStorage.setItem('signedIn','false'));
  await page.waitForFunction(() => document.querySelector('#syncStatus').textContent === 'Locked');
  assert.equal(await page.locator('#cellForm button[type=submit]').isDisabled(), true);
  assert.deepEqual(errors, []);
});
