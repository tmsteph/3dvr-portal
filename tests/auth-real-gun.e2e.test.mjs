/** Synthetic isolated acceptance. Run from repository root with installed gun/playwright:
 * PORTAL_E2E_EXECUTABLE_PATH=/usr/bin/chromium node --test tests/auth-real-gun.e2e.test.mjs
 * Never points at production, uses real user credentials, or prints signing material.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {verifySignedSeaPayload} from '../src/auth/sea.js';
const require=createRequire(import.meta.url),Gun=require('gun');require('gun/sea');
assert.equal(require('gun/package.json').version, '0.2020.1241', 'Test must exercise the pinned sign-in runtime');
const repo=process.cwd();
const gunPath=require.resolve('gun/gun.js'),seaPath=require.resolve('gun/sea.js');
const fixture=`<!doctype html><script src="/fixture-gun.js"></script><script src="/fixture-sea.js"></script><p>Isolated identity fixture</p>`;
const identity=fixture+`<script>
const fixtureRoot=Gun({peers:[location.origin+'/gun'],localStorage:false,axe:false});
const fixtureUser=fixtureRoot.user();fixtureUser.recall({sessionStorage:true});
window.fixtureIdentityReady=new Promise((resolve,reject)=>{
 let timer;
 const deadline=setTimeout(()=>{clearInterval(timer);resolve(false)},5000);
 timer=setInterval(async()=>{if(!fixtureUser.is?.pub)return;clearInterval(timer);clearTimeout(deadline);
 try{const pair=fixtureUser._.sea;const signed=await SEA.sign('synthetic-carryover',pair);
 const verified=await SEA.verify(signed,fixtureUser.is.pub);
 const encrypted=await SEA.encrypt('synthetic-private-note',pair);
 const decrypted=await SEA.decrypt(encrypted,pair);
 resolve(verified==='synthetic-carryover'&&decrypted==='synthetic-private-note'&&fixtureUser.is.pub===localStorage.getItem('userPubKey'));}catch{resolve(false)}},25);
});
</script>`;

test('real existing-account sign-in carries verified identity into Helm and restores an encrypted reply',{timeout:90000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'portal-auth-real-'));
 let expectedPub,base;
 const transportErrors=[],chats=[];
 const prompt='Synthetic local fixture: what is six times seven?',reply='Isolated reply: 42';
 const server=createServer(async(req,res)=>{try{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p==='/fixture'||p==='/identity'){res.setHeader('content-type','text/html');return res.end(p==='/fixture'?fixture:identity)}
  if(p==='/fixture-gun.js'||p==='/fixture-sea.js'){res.setHeader('content-type','application/javascript');return res.end(await readFile(p.includes('-gun')?gunPath:seaPath))}
  if(p==='/api/openclaw'){
   try{
    assert.equal(req.method,'POST');
    let raw='';for await(const chunk of req){raw+=chunk;assert.ok(raw.length<20000)}
    const body=JSON.parse(raw);
    // Use the same browser-to-Node SEA normalization as the Portal handler.
    const checked=await verifySignedSeaPayload(body,{scope:'openclaw-helm',expectedOrigin:base,maxAgeMs:120000});
    assert.ok(checked.ok,checked.reason);
    const proof=checked.verified;
    assert.equal(body.authPub,expectedPub);
    assert.equal(proof.pub,expectedPub);assert.equal(proof.scope,'openclaw-helm');
    assert.equal(proof.origin,base);assert.equal(proof.action,body.action);
    assert.ok(['status','chat'].includes(body.action));
    assert.ok(Number.isSafeInteger(proof.iat)&&Math.abs(Date.now()-proof.iat)<120000);
    for(const key of ['requestId','sessionId','engine',...(body.action==='chat'?['message','createdAt','expiresAt']:[])])assert.deepEqual(proof[key],body[key]);
    assert.equal(body.engine,'openclaw');assert.ok(body.requestId&&body.sessionId);
    if(body.action==='chat'){assert.equal(body.message,prompt);chats.push({id:body.requestId,sessionId:body.sessionId})}
    res.setHeader('content-type','application/json');
    return res.end(JSON.stringify(body.action==='status'?{ok:true,gateway:'reachable',chatEnabled:true}:{ok:true,reply}));
   }catch(error){transportErrors.push(error.message);res.writeHead(400,{'content-type':'application/json'});return res.end('{"error":"Invalid isolated fixture proof"}')}
  }
  if(p.startsWith('/api/')){res.writeHead(404,{'content-type':'application/json'});return res.end('{"configured":false}')}
  const path=resolve(repo,'.'+(p.endsWith('/')?p+'index.html':p));if(!path.startsWith(repo+sep)||!['.html','.js','.css','.svg'].includes(extname(path))){res.writeHead(404);return res.end()}
  res.setHeader('content-type',extname(path)==='.html'?'text/html':extname(path)==='.js'?'application/javascript':extname(path)==='.css'?'text/css':'image/svg+xml');res.end(await readFile(path));
 }catch{res.writeHead(404);res.end()}});
 const relay=Gun({web:server,file:join(dir,'relay'),axe:false,multicast:false,stats:false});
 await new Promise((r,j)=>server.once('error',j).listen(0,'127.0.0.1',r));
 base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PORTAL_E2E_EXECUTABLE_PATH?{executablePath:process.env.PORTAL_E2E_EXECUTABLE_PATH}:{})});
  const contexts=[];
  async function context(){const c=await browser.newContext({serviceWorkers:'block'});contexts.push(c);
   if(typeof c.routeWebSocket!=='function')throw Error('Playwright >=1.48 required for fail-closed WebSocket isolation');
   await c.routeWebSocket('**/*',socket=>{const u=new URL(socket.url());if(u.hostname==='127.0.0.1'&&u.port===new URL(base).port)socket.connectToServer();else socket.close();});
   await c.route('**/*',async route=>{const u=new URL(route.request().url());
    if(u.origin===base)return route.continue();
    if(u.origin==='https://cdn.jsdelivr.net'&&/^\/npm\/gun(?:@0\.2020\.1241)?\/(gun|sea)\.js$/.test(u.pathname))return route.fulfill({contentType:'application/javascript',body:await readFile(u.pathname.endsWith('/sea.js')?seaPath:gunPath)});
    return route.abort();
   });
   await c.addInitScript(base=>{window.__DISABLE_GUN_DEFAULT_PEERS__=true;window.__GUN_PEERS__=[base+'/gun'];},base);return c;
  }
  const alias='isolated-'+Date.now()+'@3dvr',password='SyntheticLocalAccountOnly-123!';
  const seedContext=await context(),seed=await seedContext.newPage();await seed.goto(base+'/fixture');
  expectedPub=await seed.evaluate(async({base,alias,password})=>{const user=Gun({peers:[base+'/gun'],localStorage:false,axe:false}).user();return await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('isolated seed timeout')),15000);user.create(alias,password,a=>{clearTimeout(t);if(a.err)reject(Error('isolated seed failed'));else resolve(a.pub)})});},{base,alias,password});
  assert.ok(expectedPub); // Public key only; never expose private signing material.
  const c=await context(),page=await c.newPage();
  await page.goto(base+'/sign-in.html?redirect=%2Fidentity');
  await page.locator('#username').fill(alias);await page.locator('#password').fill(password);
  assert.equal(await page.locator('#create-account').isChecked(),false);
  await page.locator('#auth-submit').click();await page.waitForURL(base+'/identity',{timeout:35000});
  assert.equal(await page.evaluate(()=>window.fixtureIdentityReady),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('userPubKey')),expectedPub);
  await page.reload();assert.equal(await page.evaluate(()=>window.fixtureIdentityReady),true);

  // Real Helm modules and encrypted store; only the local agent transport is fake.
  await page.goto(base+'/helm/');
  try{await page.waitForFunction(()=>document.querySelector('#connection')?.textContent==='OpenClaw ready')}catch(error){
   const connection=await page.locator('#connection').textContent().catch(()=>null);
   assert.fail(`Isolated Helm did not become ready: ${connection||error.message}; fixture: ${transportErrors.join('; ')||'no transport errors'}`);
  }
  await page.locator('#message').fill(prompt);
  await page.locator('#send').click();
  await page.waitForFunction(reply=>document.querySelector('#messages')?.textContent.includes(reply)&&document.querySelector('#messages')?.textContent.includes('Sent'),reply);
  assert.equal(chats.length,1);assert.deepEqual(transportErrors,[]);
  const id=chats[0].id;
  const encryptedCompleted=await page.evaluate(async({id,pub,prompt,reply})=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('3dvr-helm-cache',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
   try{
    const key=`3dvr.helm.encrypted-messages.${pub}:${id}:completed`;
    const value=await new Promise((resolve,reject)=>{const r=db.transaction('messages','readonly').objectStore('messages').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    if(!value?.ciphertext||Object.keys(value).sort().join(',')!=='ciphertext,updatedAt')return false;
    const serialized=JSON.stringify(value);if(serialized.includes(prompt)||serialized.includes(reply))return false;
    const pair=JSON.parse(sessionStorage.getItem('pair'));
    const decoded=await Gun.SEA.decrypt(value.ciphertext,pair);
    const record=typeof decoded==='string'?JSON.parse(decoded):decoded;
    return record?.id===id&&record.status==='completed'&&record.text===prompt&&record.reply===reply;
   }finally{db.close()}
  },{id,pub:expectedPub,prompt,reply});
  assert.equal(encryptedCompleted,true,'Real store must persist decryptable completed ciphertext');
  await page.reload();
  await page.waitForFunction(reply=>document.querySelector('#messages')?.textContent.includes(reply)&&document.querySelector('#messages')?.textContent.includes('Sent'),reply);
  await page.waitForFunction(()=>document.querySelector('#connection')?.textContent==='OpenClaw ready');
  assert.equal(chats.length,1,'Restoring a completed message must not dispatch it again');
  assert.deepEqual(transportErrors,[]);
  for(const context of contexts)await context.close();
 }finally{
  if(browser)await browser.close();
  // stats/AXE/multicast are disabled above; close fixture sockets and HTTP.
  // Gun's finite wire heartbeat may drain on its next tick (up to 20 seconds).
  // The CI command has a 120-second outer deadline, so cleanup hangs fail CI.
  for(const client of relay._.opt.ws?.web?.clients||[])client.terminate();
  if(relay._.opt.ws?.web)await new Promise(r=>relay._.opt.ws.web.close(r));
  server.closeAllConnections?.();
  await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});
 }
});
