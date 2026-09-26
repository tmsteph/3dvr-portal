'use strict';

const http = require('node:http');
const desired = JSON.parse(process.env.IATSE_DESIRED || '{}');
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
      const cb=this.pending.get(m.id);
      if(cb){this.pending.delete(m.id);cb(m)}
    };
    return this;
  }
  call(method,params={}){
    return new Promise((resolve,reject)=>{
      const id=this.id++;
      const t=setTimeout(()=>{this.pending.delete(id);reject(new Error('cdp-timeout:'+method))},12000);
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
  let targets=await httpJson('/json/list');
  let target=targets.find(t=>t.type==='page' && /member\.iatse\.io\/avail/.test(String(t.url||'')));
  if(!target){
    target=await httpJson('/json/new?https%3A%2F%2Fmember.iatse.io%2Favail','PUT');
    await sleep(7000);
    targets=await httpJson('/json/list');
    target=targets.find(t=>t.type==='page' && /member\.iatse\.io\/avail/.test(String(t.url||''))) || target;
  }
  if(!target?.webSocketDebuggerUrl) throw new Error('iatse-target-unavailable');

  const cdp=await new Cdp(target.webSocketDebuggerUrl).connect();
  try{
    await sleep(1500);
    const before=await cdp.eval(`(() => {
      const out={};
      for(const [date,want] of Object.entries(${JSON.stringify(desired)})){
        const el=document.getElementById('avail_'+date+' 00:00:00');
        out[date]=el?el.value:null;
      }
      return {url:location.href,authenticated:/Logout/.test(document.body?.innerText||''),values:out};
    })()`);
    if(!before?.authenticated) throw new Error('iatse-session-not-authenticated');

    const changed=await cdp.eval(`(() => {
      const desired=${JSON.stringify(desired)};
      const changes=[];
      const missing=[];
      const descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
      for(const [date,want] of Object.entries(desired)){
        const el=document.getElementById('avail_'+date+' 00:00:00');
        if(!el){missing.push(date);continue}
        const from=el.value;
        if(from===want) continue;
        descriptor.set.call(el,want);
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
        changes.push({date,from,to:want});
      }
      return {changes,missing};
    })()`);

    await sleep(12000);
    await cdp.call('Page.reload',{ignoreCache:true});
    await sleep(8000);

    const after=await cdp.eval(`(() => {
      const out={};
      for(const [date,want] of Object.entries(${JSON.stringify(desired)})){
        const el=document.getElementById('avail_'+date+' 00:00:00');
        out[date]=el?el.value:null;
      }
      return {url:location.href,authenticated:/Logout/.test(document.body?.innerText||''),values:out};
    })()`);

    const mismatches=[];
    for(const [date,want] of Object.entries(desired)){
      if(after?.values?.[date]!==want) mismatches.push({date,want,actual:after?.values?.[date]??null});
    }
    process.stdout.write(JSON.stringify({
      ok:mismatches.length===0,
      checkedAt:new Date().toISOString(),
      before:before.values,
      changes:changed.changes,
      missing:changed.missing,
      after:after.values,
      mismatches
    }));
  } finally { cdp.close(); }
})().catch(e=>{
  process.stdout.write(JSON.stringify({ok:false,error:String(e.message||e)}));
  process.exitCode=1;
});
