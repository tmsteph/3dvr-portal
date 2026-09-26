'use strict';

const http = require('node:http');
const url = process.argv[2] || 'https://lighthouse2.psav.com/schedule/loc/9036/asOf/2026-09-21';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpJson(path, method='GET') {
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:9222,path,method},res=>{
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
  const created=await httpJson('/json/new?'+encodeURIComponent(url),'PUT');
  await sleep(12000);
  const targets=await httpJson('/json/list');
  const target=targets.find(t=>t.id===created.id)
    || targets.find(t=>t.type==='page' && /lighthouse2\.psav\.com\/schedule\//.test(String(t.url||'')));
  if(!target?.webSocketDebuggerUrl) throw new Error('target-unavailable');
  const cdp=await new Cdp(target.webSocketDebuggerUrl).connect();
  try{
    const result=await cdp.eval(`(() => {
      const clean=s=>(s||'').replace(/\\s+/g,' ').trim();
      const resources=performance.getEntriesByType('resource')
        .map(x=>x.name)
        .filter(x=>/lighthouse|api|schedule|resource|event|shift|employee|staff/i.test(x))
        .slice(-160);
      const interesting=[...document.querySelectorAll('*')]
        .filter(el=>{
          const key=[el.tagName,el.id,String(el.className||''),...Array.from(el.attributes||[]).map(a=>a.name+'='+a.value)].join(' ');
          const txt=clean(el.textContent||'');
          return /schedule|resource|timeline|event|shift|employee|staff|mbsc|e2e/i.test(key)
            || (/\\b1000\\b/.test(txt) && txt.length<1000);
        })
        .slice(0,220)
        .map(el=>({
          tag:el.tagName,
          id:el.id||'',
          cls:String(el.className||'').slice(0,260),
          text:clean(el.textContent||'').slice(0,500),
          attrs:Array.from(el.attributes||[]).slice(0,20).reduce((o,a)=>(o[a.name]=String(a.value).slice(0,220),o),{})
        }));
      const storage={};
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(/schedule|user|employee|loc|auth|token|profile/i.test(k||'')) storage[k]='[present]';
      }
      return {
        ok:true,
        url:location.href,
        title:document.title,
        body:clean(document.body?.innerText||'').slice(0,6000),
        resources,
        interesting,
        storageKeys:storage
      };
    })()`);
    process.stdout.write(JSON.stringify(result));
  } finally { cdp.close(); }
})().catch(e=>{
  process.stdout.write(JSON.stringify({ok:false,error:String(e.message||e)}));
  process.exitCode=1;
});
