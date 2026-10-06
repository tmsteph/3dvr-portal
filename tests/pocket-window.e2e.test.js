import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

let server, origin, browser;
const root=resolve(import.meta.dirname,'..');
const artifacts=process.env.POCKET_ARTIFACTS || '/tmp/pocket-window-playtest';
before(async()=>{
  server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      const file=resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
      const data=await readFile(file);
      res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream'});
      res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  origin=process.env.POCKET_URL || 'http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  await mkdir(artifacts,{recursive:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
async function signature(page) {
  return page.evaluate(()=>{
    const c=document.querySelector('canvas'),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let hash=0;for(let i=0;i<data.length;i+=128)hash=(hash*31+data[i])>>>0;return hash;
  });
}
async function settled(page){await page.waitForTimeout(700);}

test('desktop, portrait and landscape render and support dramatic input without permission',{timeout:60000},async()=>{
  for(const [name,width,height,mobile] of [['desktop',1440,900,false],['portrait',390,844,true],['small-phone',360,640,true],['landscape',844,390,true]]) {
    const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());});
    await page.goto(origin+'/pocket-window/?v=extreme');
    await page.waitForFunction(()=>document.querySelector('canvas').width===innerWidth);
    await page.screenshot({path:artifacts+'/'+name+'-center.png'});
    const initial=await signature(page);
    assert.equal(await page.locator('#still').isChecked(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true);
    await page.waitForTimeout(200);assert.equal(await signature(page),initial,'reduced-motion disables ambient and intro motion');
    if(mobile) {
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width*.5,y:height*.5,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width*.85,y:height*.4,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else await page.mouse.move(width*.85,height*.4);
    await settled(page);assert.notEqual(await signature(page),initial,'drag/mouse changes the projected world');
    await page.screenshot({path:artifacts+'/'+name+'-lean.png'});
    await page.keyboard.press('Escape');await settled(page);
    assert.equal(await signature(page),initial,'Escape recenters to the same world');
    const centered=await signature(page);
    if(mobile) {
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width*.4,y:height*.5,id:1},{x:width*.6,y:height*.5,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width*.15,y:height*.5,id:1},{x:width*.85,y:height*.5,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else {await page.locator('#world').focus();await page.keyboard.press('+');}
    await settled(page);assert.notEqual(await signature(page),centered,'pinch/keyboard provides depth movement');
    await page.screenshot({path:artifacts+'/'+name+'-closer.png'});
    await page.locator('#settings').click();
    assert.equal(await page.locator('#settings').getAttribute('aria-expanded'),'true');
    const box=await page.locator('#panel').boundingBox();
    assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[],'no external assets or camera upload requests');
    await context.close();
  }
});

test('camera denial and tilt denial preserve touch fallback',{timeout:15000},async()=>{
  const page=await browser.newPage();
  await page.addInitScript(()=>{
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}});
    DeviceOrientationEvent.requestPermission=async()=> 'denied';
  });
  await page.goto(origin+'/pocket-window/');
  await page.locator('#settings').click();
  await page.locator('#cam').click();
  assert.match(await page.locator('#status').textContent(),/permission declined/);
  assert.equal(await page.locator('#cam').isEnabled(),true);
  await page.locator('#motion').click();
  assert.match(await page.locator('#status').textContent(),/permission declined/);
  await page.keyboard.press('Escape');
  const initial=await signature(page);await page.mouse.move(100,100);await settled(page);
  assert.notEqual(await signature(page),initial);await page.close();
});

test('local camera can stop, tilt centers against actual device readings',{timeout:15000},async()=>{
  const context=await browser.newContext({permissions:['camera'],reducedMotion:'reduce'});
  const page=await context.newPage();let uploads=0;
  page.on('request',r=>{if(r.method()!=='GET')uploads++;});
  await page.goto(origin+'/pocket-window/');
  await page.locator('#settings').click();await page.locator('#cam').click();
  await page.waitForFunction(()=>document.querySelector('#cam').textContent==='Disable Camera');
  await page.evaluate(()=>{window.testTracks=document.querySelector('video').srcObject.getTracks();});
  await page.locator('#cam').click();
  assert.equal(await page.evaluate(()=>window.testTracks.every(t=>t.readyState==='ended')),true);
  await page.locator('#motion').click();
  await page.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{gamma:12,beta:60})));
  await page.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{gamma:32,beta:70})));
  await settled(page);const tilted=await signature(page);
  await page.locator('#center').click();await settled(page);const centered=await signature(page);
  assert.notEqual(centered,tilted);
  await page.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{gamma:32,beta:70})));
  await settled(page);assert.equal(await signature(page),centered,'center survives the next identical gyro event');
  assert.equal(uploads,0);await context.close();
});
