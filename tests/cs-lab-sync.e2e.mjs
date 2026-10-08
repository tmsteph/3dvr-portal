import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const Gun = require('gun');
require('gun/sea');
const root = new URL('../', import.meta.url);
const directory = await mkdtemp('/tmp/cs-lab-relay-');
const server = createServer(async (req,res) => {
  try {
    let path = new URL(req.url,'http://local').pathname;
    if (path.endsWith('/')) path += 'index.html';
    if (path === '/setup') {
      res.setHeader('content-type','text/html');
      return res.end('<script src="/node_modules/gun/gun.js"></script><script src="/node_modules/gun/sea.js"></script>');
    }
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json' : path.endsWith('.css') ? 'text/css' : 'text/html';
    res.setHeader('content-type',type);
    res.end(await readFile(new URL('.'+path,root)));
  } catch { res.writeHead(404); res.end(); }
});
const gun = Gun({web:server,file:directory+'/data',axe:false,multicast:false,stats:false});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = 'http://127.0.0.1:'+server.address().port;
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/opt/google/chrome/chrome',timeout:20000,args:['--no-sandbox']});
console.log('Browser launched');
const password = 'DisposableStudySyncTest-Only!';
const alias = 'cs-sync-'+Date.now();
const key = '3dvr.cs-build-lab.v1';
const errors = [];
async function pageFor(width) {
  const context = await browser.newContext({viewport:{width,height:900}});
  const page = await context.newPage();
  console.log('Page created',width);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.jsdelivr.net' && /\/(gun|sea)\.js$/.test(url.pathname)) {
      const file = url.pathname.endsWith('/sea.js') ? 'sea.js' : 'gun.js';
      return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('node_modules/gun/'+file,root))});
    }
    if (url.hostname !== '127.0.0.1') return route.abort();
    return route.continue();
  });
  await page.addInitScript(base=>{
    window.__DISABLE_GUN_DEFAULT_PEERS__=true;
    window.__GUN_PEERS__=[base+'/gun'];
  },base);
  await page.goto(base+'/setup', {waitUntil:'domcontentloaded'});
  console.log('Setup loaded',width);
  return page;
}
async function login(page,alias,create=false) {
  await page.evaluate(async ({base,alias,password,create})=>{
    const user=Gun({peers:[base+'/gun'],axe:false}).user();
    if(create) await new Promise((r,j)=>user.create(alias,password,a=>a.err?j(new Error(a.err)):r()));
    await new Promise((r,j)=>user.auth(alias,password,a=>a.err?j(new Error(a.err)):r()));
    localStorage.setItem('signedIn','true');
    localStorage.setItem('alias',alias);
    localStorage.setItem('password',password);
    localStorage.setItem('userPubKey',user.is.pub);
    window.testPub=user.is.pub;
  },{base,alias,password,create});
  console.log('Account authenticated',create);
}
const step=(page,name)=>page.getByRole('checkbox',{name,exact:true});
try {
  const laptop=await pageFor(1280);
  const phone=await pageFor(390);
  await login(laptop,alias,true);
  await login(phone,alias);
  await laptop.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,modules:{complexity:{steps:{learn:true},notes:'Migrated study note',completedAt:null}}})),key);
  await laptop.goto(base+'/cs-build-lab/');
  console.log('Lab loaded',await laptop.locator('#storage-status').textContent());
  await laptop.waitForFunction(()=>document.querySelector('#storage-status')?.textContent.includes('acknowledged'));
  await phone.goto(base+'/cs-build-lab/');
  await step(phone,'Algorithms & complexity: learn').waitFor();
  await phone.waitForFunction(()=>document.querySelector('[data-module="complexity"][data-phase="learn"]')?.checked === true);
  assert.equal(await phone.locator('#notes-complexity').inputValue(),'Migrated study note');
  // Different fields from both devices must converge without either page reloading.
  await step(laptop,'Algorithms & complexity: build').check();
  await phone.locator('#module-structures summary').click();
  await step(phone,'Data structures: learn').check();
  await laptop.waitForFunction(()=>document.querySelector('[data-module="structures"][data-phase="learn"]')?.checked);
  await phone.waitForFunction(()=>document.querySelector('[data-module="complexity"][data-phase="build"]')?.checked);
  await step(phone,'Algorithms & complexity: learn').uncheck();
  await phone.locator('#notes-complexity').fill('Phone revision');
  await laptop.waitForFunction(()=>!document.querySelector('[data-module="complexity"][data-phase="learn"]').checked);
  await laptop.waitForFunction(()=>document.querySelector('#notes-complexity').value === 'Phone revision');
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await phone.screenshot({path:'/tmp/cs-sync-mobile.png',fullPage:true});
  // A fresh independent browser restores the same account, not the guest backup.
  const fresh=await pageFor(390);
  await login(fresh,alias);
  await fresh.goto(base+'/cs-build-lab/');
  await fresh.waitForFunction(()=>document.querySelector('#notes-complexity')?.value === 'Phone revision');
  assert.equal(await fresh.locator('[data-module=complexity][data-phase=learn]').isChecked(),false);
  assert.equal(await fresh.locator('[data-module=complexity][data-phase=build]').isChecked(),true);
  // Switching identity on the original browser cannot import the first account's guest cache.
  await laptop.goto(base+'/setup');
  await login(laptop,alias+'-other',true);
  await laptop.goto(base+'/cs-build-lab/');
  console.log('Lab loaded',await laptop.locator('#storage-status').textContent());
  await laptop.waitForFunction(()=>document.querySelector('#storage-status')?.textContent.includes('acknowledged'));
  assert.equal(await laptop.locator('#notes-complexity').inputValue(),'');
  assert.equal(await step(laptop,'Algorithms & complexity: learn').isChecked(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: real Gun/SEA relay; migration; independent mobile/desktop live sync; unchecks; notes; fresh browser restore; account isolation; mobile layout.');
} finally {
  await browser.close();
  gun.off();
  server.closeAllConnections();
  await new Promise(r=>server.close(r));
  await rm(directory,{recursive:true,force:true});
}
process.exit(0);
