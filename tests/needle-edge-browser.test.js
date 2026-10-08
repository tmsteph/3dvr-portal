import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const html=await readFile(new URL('../needle-edge/index.html',import.meta.url),'utf8');
const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];

async function browserFixture(error=false){
 const ids=['load','s','d','run','f','q','result','decision','json','meta','go'];
 const elements=Object.fromEntries(ids.map(id=>[id,{hidden:true,disabled:false,value:'',textContent:''}]));
 const heap=new Uint8Array(4<<20),calls=[],freed=[];
 let pointer=8;
 const module={
  HEAPU8:heap,_malloc:n=>{const p=pointer;pointer+=n;return p},_free:p=>freed.push(p),_needle_reset:()=>{},
  _needle_load:()=>0,_needle_init:()=>123,
  _needle_last_error:()=>1,UTF8ToString:p=>p===1?'specific runtime failure':new TextDecoder().decode(heap.subarray(p,heap.indexOf(0,p))),
  _needle_complete:(...args)=>{
   calls.push(args);
   if(error)return -1;
   const output=new TextEncoder().encode(JSON.stringify({function_calls:[{name:'show_workboard',arguments:{}}],confidence:0.95})+'\0');
   heap.set(output,args[4]);
   return 7; // Completion returns token count, not JSON byte length.
  }
 };
 const context=vm.createContext({...elements,document:{getElementById:id=>elements[id]},
  TextEncoder,TextDecoder,Uint8Array,BigInt,performance:{now:()=>100},location:{href:'',origin:'https://portal.3dvr.tech'},
  fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}),
  createNeedle:async()=>module});
 vm.runInContext(code,context);
 await elements.load.onclick();
 elements.q.value='Show my work board';
 elements.f.onsubmit({preventDefault(){}});
 return {elements,calls,freed};
}
test('Needle 3 text routing uses six ABI arguments and no PCM input',async()=>{
 const {elements,calls}=await browserFixture();
 assert.equal(calls.length,1);
 assert.equal(calls[0].length,6);
 assert.equal(calls[0][1],0);
 assert.equal(calls[0][2],0);
 assert.ok(calls[0][3]>0);
 assert.ok(calls[0][4]>0);
 assert.equal(calls[0][5],1<<20);
 assert.equal(elements.decision.textContent,'show_workboard');
 assert.equal(elements.go.hidden,false);
 assert.equal(elements.run.disabled,false);
});
test('engine failures show the runtime error and allow retry',async()=>{
 const {elements,calls,freed}=await browserFixture(true);
 assert.ok(freed.includes(calls[0][0]) && freed.includes(calls[0][4]));
 assert.equal(elements.decision.textContent,'Error');
 assert.equal(elements.json.textContent,'specific runtime failure');
 assert.equal(elements.run.disabled,false);
});
test('JS, WASM, and weights use the same immutable upstream revision',()=>{
 assert.equal((html.match(/needle3\/resolve\/2ae11323dc000f5e70c49f7403efa6af12ba9e67\//g)||[]).length,3);
 assert.doesNotMatch(html,/needle3\/resolve\/main\//);
});
