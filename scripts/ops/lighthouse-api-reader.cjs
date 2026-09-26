'use strict';

const http = require('node:http');
const weeks = process.argv.slice(2);
if (!weeks.length) {
  console.log(JSON.stringify({ok:false,error:'week-dates-required'}));
  process.exit(64);
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

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
  constructor(url){this.url=url;this.ws=null;this.id=1;this.pending=new Map();this.listeners=[]}
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
      if(cb){this.pending.delete(m.id);cb(m);return}
      for(const fn of this.listeners) fn(m);
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
  on(fn){this.listeners.push(fn)}
  close(){try{this.ws?.close()}catch{}}
}

(async()=>{
  const created=await httpJson('/json/new?about%3Ablank','PUT');
  const cdp=await new Cdp(created.webSocketDebuggerUrl).connect();
  try{
    await cdp.call('Network.enable');
    await cdp.call('Page.enable');

    async function readWeek(date) {
      const wanted='/api/schedules/schedule/employee/week/';
      let requestId=null;
      let responseUrl=null;
      let responseStatus=null;
      let finishedResolve;
      const finished=new Promise(resolve=>{finishedResolve=resolve});
      const listener=m=>{
        if(m.method==='Network.responseReceived' && String(m.params?.response?.url||'').includes(wanted)){
          requestId=m.params.requestId;
          responseUrl=m.params.response.url;
          responseStatus=m.params.response.status;
        }
        if(m.method==='Network.loadingFinished' && requestId && m.params?.requestId===requestId){
          finishedResolve();
        }
        if(m.method==='Network.loadingFailed' && requestId && m.params?.requestId===requestId){
          finishedResolve();
        }
      };
      cdp.on(listener);
      const route='https://lighthouse2.psav.com/schedule/loc/9036/asOf/'+date;
      await cdp.call('Page.navigate',{url:route});
      const deadline=Date.now()+25000;
      while(!requestId && Date.now()<deadline) await sleep(250);
      if(!requestId) return {asOf:date,ok:false,error:'schedule-api-request-not-seen'};
      await Promise.race([finished,sleep(15000)]);
      let body;
      try {
        const b=await cdp.call('Network.getResponseBody',{requestId});
        body=b.result?.body||'';
      } catch(e) {
        return {asOf:date,ok:false,error:'response-body-unavailable',status:responseStatus,url:responseUrl};
      }
      let data;
      try{data=JSON.parse(body)}catch{
        return {asOf:date,ok:false,error:'schedule-api-invalid-json',status:responseStatus,url:responseUrl,body:body.slice(0,800)};
      }
      return {asOf:date,ok:true,status:responseStatus,url:responseUrl,data};
    }

    const results=[];
    for(const date of weeks) results.push(await readWeek(date));
    process.stdout.write(JSON.stringify({ok:true,checkedAt:new Date().toISOString(),weeks:results}));
  } finally { cdp.close(); }
})().catch(e=>{
  process.stdout.write(JSON.stringify({ok:false,error:String(e.message||e)}));
  process.exitCode=1;
});
