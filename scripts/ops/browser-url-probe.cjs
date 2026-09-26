'use strict';

const http = require('node:http');
const targetUrl = process.argv[2];
if (!targetUrl || !/^https:\/\//.test(targetUrl)) {
  console.log(JSON.stringify({ok:false,error:'https-url-required'}));
  process.exit(64);
}
const port=9222;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function httpJson(path, method='GET'){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path,method},res=>{
      let text=''; res.setEncoding('utf8');
      res.on('data',c=>text+=c);
      res.on('end',()=>{
        if((res.statusCode||500)>=400) return reject(new Error('cdp-http-'+res.statusCode));
        try{resolve(JSON.parse(text||'{}'))}catch{reject(new Error('cdp-invalid-json'))}
      });
    });
    req.setTimeout(5000,()=>req.destroy(new Error('cdp-http-timeout')));
    req.on('error',reject); req.end();
  });
}
class Cdp {
  constructor(url){this.url=url;this.ws=null;this.id=1;this.pending=new Map()}
  async connect(){
    this.ws=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{
      const t=setTimeout(()=>reject(new Error('ws-timeout')),8000);
      this.ws.onopen=()=>{clearTimeout(t);resolve()};
      this.ws.onerror=e=>{clearTimeout(t);reject(e)};
    });
    this.ws.onmessage=e=>{
      let m; try{m=JSON.parse(String(e.data||''))}catch{return}
      const cb=this.pending.get(m.id); if(cb){this.pending.delete(m.id);cb(m)}
    };
    return this;
  }
  call(method,params={}){
    return new Promise((resolve,reject)=>{
      const id=this.id++;
      const t=setTimeout(()=>{this.pending.delete(id);reject(new Error('cdp-timeout'))},10000);
      this.pending.set(id,m=>{clearTimeout(t);resolve(m)});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async eval(expression){
    const m=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(m.result?.exceptionDetails) throw new Error('browser-evaluation-failed');
    return m.result?.result?.value;
  }
  close(){try{this.ws?.close()}catch{}}
}
(async()=>{
  const created=await httpJson('/json/new?'+encodeURIComponent(targetUrl),'PUT');
  await sleep(10000);
  const targets=await httpJson('/json/list');
  let target=targets.find(t=>t.id===created.id)
    || targets.find(t=>t.type==='page' && String(t.url||'').startsWith(new URL(targetUrl).origin));
  if(!target?.webSocketDebuggerUrl) throw new Error('target-unavailable');
  const cdp=await new Cdp(target.webSocketDebuggerUrl).connect();
  try{
    await sleep(2500);
    const result=await cdp.eval(`(() => {
      const clean=s=>(s||'').replace(/\\s+/g,' ').trim();
      const redact=s=>clean(s)
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig,'[email]')
        .replace(/\\b\\d{6,}\\b/g,'[number]');
      const raw=redact(document.body?.innerText||'').slice(0,7000);
      const controls=[...document.querySelectorAll('button,a,input,select,[role="button"]')]
        .map(el=>({
          tag:el.tagName,
          type:el.getAttribute('type')||'',
          text:redact(el.innerText||el.textContent||el.getAttribute('aria-label')||'').slice(0,220),
          id:el.id||'',
          name:el.getAttribute('name')||'',
          aria:redact(el.getAttribute('aria-label')||'').slice(0,180),
          href:(el.href||'').replace(/[?#].*$/,''),
          disabled:!!el.disabled
        }))
        .filter(x=>x.text||x.id||x.name||x.aria||x.href)
        .slice(0,120);
      return {ok:true,url:location.href,title:document.title,body:raw,controls};
    })()`);
    console.log(JSON.stringify(result));
  } finally { cdp.close(); }
})().catch(e=>{
  console.log(JSON.stringify({ok:false,error:String(e.message||e)}));
  process.exitCode=1;
});
