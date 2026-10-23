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
  const node = (owner, path = [], writable = false) => ({
    get(key) { return node(owner, [...path, key], writable); },
    put(value, ack) {
      if (!writable) throw new Error('Read-only account graph');
      (window.testWrites ||= []).push({path, value});
      fetch('/__cell-test-graph', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({owner,path,value})}).then(r=>r.json()).then(ack);
    },
    map() {
      let active = false, timer;
      return {
        on(callback) {
          active = true;
          const poll = async () => {
            try {
              const query = new URLSearchParams({owner,path:JSON.stringify(path)});
              const data = await (await fetch('/__cell-test-graph?'+query)).json();
              if (active) for (const [key,value] of data) callback(value,key,undefined,{off(){active=false;clearTimeout(timer);}});
            } catch {}
            if (active) timer = setTimeout(poll,80);
          };
          void poll();
        },
        off() { active = false; clearTimeout(timer); }
      };
    }
  });
  return {pair, sea: Gun.SEA, user: {...node(pair.pub,[],true), is: {pub:pair.pub}},
    gun: {user:pub=>node(pub)}};
}`;

test('mobile private Cell saves, reloads, locks on account change and blocks signed-out saves', { timeout: 60000 }, async t => {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const graph = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname;
    if (route === '/__cell-test-graph') {
      res.setHeader('Content-Type','application/json');
      if (req.method === 'POST') {
        let body = ''; for await (const chunk of req) body += chunk;
        const {owner,path,value} = JSON.parse(body); graph.set(owner+'/'+path.join('/'),value);
        res.end(JSON.stringify({ok:1}));
      } else {
        const prefix = url.searchParams.get('owner')+'/'+JSON.parse(url.searchParams.get('path')).join('/')+'/';
        res.end(JSON.stringify([...graph].filter(([key])=>key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
          .map(([key,value])=>[key.slice(prefix.length),value])));
      }
      return;
    }
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
  const routeHandler = async route => {
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
  };
  await context.route('**/*', routeHandler);
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
  // Restore the owner and exercise recipient-bound membership from a separate browser context.
  await page.evaluate(pair => {
    localStorage.setItem('signedIn','true'); localStorage.setItem('alias','owner-a');
    localStorage.setItem('userPubKey',pair.pub); localStorage.setItem('testPair',JSON.stringify(pair));
  }, first);
  await page.locator('#cellRetry').click();
  await page.waitForFunction(() => document.querySelector('#cellCount').textContent === '1');
  await page.locator('[data-select-cell]').click();
  const memberContext = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await memberContext.route('**/*',routeHandler);
  await memberContext.addInitScript(pair => {
    if (localStorage.getItem('testPair')) return;
    localStorage.setItem('signedIn','true'); localStorage.setItem('alias','member');
    localStorage.setItem('userPubKey',pair.pub); localStorage.setItem('testPair',JSON.stringify(pair));
  }, second);
  const memberPage = await memberContext.newPage();
  memberPage.on('pageerror',error=>errors.push(error.message));
  await memberPage.goto(`${base}/cell/`);
  await memberPage.waitForFunction(() => document.querySelector('#cellMemberCode').value.startsWith('3dvr-cell-member:'));
  await page.locator('#cellInviteCode').fill(await memberPage.locator('#cellMemberCode').inputValue());
  await page.locator('#cellInviteButton').click();
  await page.waitForFunction(() => document.querySelector('#cellInviteLink').value.includes('#invite='));
  const link = await page.locator('#cellInviteLink').inputValue();
  await memberPage.goto(link);
  await memberPage.locator('#cellInviteAccept').click();
  await memberPage.waitForFunction(() => document.querySelector('#cellCount').textContent === '1');
  await memberPage.locator('[data-select-cell]').click();
  assert.equal(await memberPage.locator('#cellForm button[type=submit]').isDisabled(),true);
  await page.locator('#purpose').fill('New private member update');
  await page.locator('#cellForm button[type=submit]').click();
  await memberPage.waitForFunction(() => document.querySelector('#cellList').textContent.includes('New private member update'));
  await page.locator('[data-revoke-invite]').click();
  await memberPage.waitForFunction(() => document.querySelector('#cellCount').textContent === '0');
  assert.equal(await memberPage.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  assert.doesNotMatch(JSON.stringify([...graph]),/Private browser group|New private member update/);
  assert.deepEqual(errors, []);
});
