import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require=createRequire(import.meta.url);
const Gun=require('gun');
require('gun/sea');

test('independent desktop and phone browsers retain chats through a real Gun relay', {timeout:90000}, async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'operator-sync-relay-'));
  const server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(pathname==='/'){
        res.setHeader('content-type','text/html');
        res.end('<script src="/node_modules/gun/gun.js"></script><script src="/node_modules/gun/sea.js"></script>');
        return;
      }
      if(pathname==='/home'){
        res.setHeader('content-type','text/html');
        res.end(await readFile(new URL('../index.html',import.meta.url)));
        return;
      }
      if(pathname.includes('..')||!(/\.(js|css|svg)$/.test(pathname))){
        res.writeHead(404);res.end();return;
      }
      res.setHeader('content-type',pathname.endsWith('.css')?'text/css':'text/javascript');
      res.end(await readFile(new URL(`..${pathname}`,import.meta.url)));
    }catch{res.writeHead(404);res.end()}
  });
  const gun=Gun({web:server,file:resolve(directory,'data'),axe:false,multicast:false,stats:false});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const alias=`sync-test-${Date.now()}`;
  const password='DisposableSyncTestPassword-Only!';
  try{
    const laptop=await browser.newPage({viewport:{width:1280,height:900}});
    const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
    const initialize=async(page,create)=>{
      await page.goto(base);
      await page.evaluate(async({base,alias,password,create})=>{
        window.__GUN_PEERS__=[`${base}/gun`];
        if(create){
          const account=window.Gun({peers:window.__GUN_PEERS__,axe:false}).user();
          await new Promise((done,reject)=>account.create(alias,password,ack=>ack.err?reject(new Error(ack.err)):done()));
        }
        localStorage.setItem('alias',alias);
        localStorage.setItem('password',password);
        const {createOperatorSync}=await import('/operator/sync.js');
        window.sync=createOperatorSync({windowObj:window});
        if(!await window.sync.ready)throw new Error('Account authentication failed');
      },{base,alias,password,create});
    };
    await initialize(laptop,true);
    await initialize(phone,false);
    const save=(page,id,content)=>page.evaluate(({id,content})=>window.sync.save({activeId:id,conversations:[{
      id,createdAt:'2026-10-07T10:00:00Z',updatedAt:'2026-10-07T10:00:00Z',messages:[{role:'user',content}]
    }]}),{id,content});
    assert.deepEqual(await Promise.all([save(laptop,'laptop-notes','Can you take notes for me?'),save(phone,'phone-test','Phone test')]),[true,true]);
    for(const page of [laptop,phone]){
      const loaded=await page.evaluate(()=>window.sync.load({conversations:[]}));
      assert.deepEqual(new Set(loaded.conversations.map(item=>item.id)),new Set(['laptop-notes','phone-test']));
    }
    // Exercise the actual homepage submit flow, not just the sync module.
    await laptop.addInitScript(base=>{
      window.__DISABLE_GUN_DEFAULT_PEERS__=true;
      window.__GUN_PEERS__=[`${base}/gun`];
      localStorage.setItem('signedIn','true');
    },base);
    await laptop.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='cdn.jsdelivr.net'&&/\/gun\/(gun|sea)\.js$/.test(url.pathname)){
        const filename=url.pathname.endsWith('/sea.js')?'sea.js':'gun.js';
        await route.fulfill({contentType:'text/javascript',body:await readFile(new URL(`../node_modules/gun/${filename}`,import.meta.url))});
        return;
      }
      if(url.hostname!=='127.0.0.1')return route.abort();
      if(url.pathname==='/api/openai-site')return route.fulfill({contentType:'application/json',body:JSON.stringify({reply:'Saved test note.',suggestions:[],action:{type:'none'}})});
      return route.continue();
    });
    await laptop.goto(`${base}/home`);
    await laptop.locator('#homeOperatorInput').fill('Homepage note should appear on my phone.');
    await laptop.locator('#homeOperatorSubmit').click();
    await laptop.getByText('Saved test note.',{exact:true}).waitFor();
    let homepageRestored=false;
    for(let attempt=0;attempt<3&&!homepageRestored;attempt++){
      const loaded=await phone.evaluate(()=>window.sync.load({conversations:[]}));
      homepageRestored=loaded?.conversations.some(item=>item.messages.some(message=>message.content==='Homepage note should appear on my phone.'));
    }
    assert.ok(homepageRestored,'homepage chat should reach the independent phone browser');
    // Shut down both device contexts: a fresh browser must recover from the relay alone.
    await laptop.context().close();
    await phone.context().close();
    const fresh=await browser.newPage();
    await initialize(fresh,false);
    const restored=await fresh.evaluate(()=>window.sync.load({conversations:[]}));
    assert.ok(restored.conversations.some(item=>item.id==='laptop-notes'));
    assert.ok(restored.conversations.some(item=>item.id==='phone-test'));
    assert.ok(restored.conversations.some(item=>item.messages.some(message=>message.content==='Homepage note should appear on my phone.')));
  }finally{
    await browser.close();
    for(const client of gun._.opt.ws.web.clients)client.terminate();
    await new Promise(done=>gun._.opt.ws.web.close(done));
    await new Promise(done=>server.close(done));
    await rm(directory,{recursive:true,force:true});
  }
});
