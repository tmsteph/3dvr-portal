const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname, '../horizon/index.html'),'utf8'),source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const noop=()=>{};const context=new Proxy({createLinearGradient:()=>({addColorStop:noop}),measureText:()=>({width:80})},{get:(o,k)=>o[k]||noop,set:(o,k,v)=>(o[k]=v,true)});
const elements=new Map();function el(){const classes=new Set();return {hidden:false,dataset:{},style:{},classList:{contains:n=>classes.has(n),add:n=>classes.add(n),remove:n=>classes.delete(n)},removeAttribute(k){delete this[k];},append:noop,focus:noop,addEventListener:noop,setPointerCapture:noop,getContext:()=>context,querySelectorAll:()=>[],getClientRects:()=>[{}]};}
const document={querySelector:s=>{if(!elements.has(s))elements.set(s,el());return elements.get(s);},querySelectorAll:()=>[],createElement:el,addEventListener:noop};
const sandbox={document,innerWidth:1280,innerHeight:800,devicePixelRatio:1,addEventListener:noop,requestAnimationFrame:noop,setInterval:noop,Intl,Date,Math};vm.createContext(sandbox);vm.runInContext(source,sandbox);
vm.runInContext("keys.add('w');update(1);",sandbox);assert.equal(vm.runInContext('player.z',sandbox),4);
vm.runInContext("keys.clear();player.x=-3;player.z=4;update(0);update(0)",sandbox);assert.equal(vm.runInContext('collected',sandbox),1);
vm.runInContext('openRoom(APPS[0])',sandbox);assert(elements.get('#panel').classList.contains('open'));assert.equal(elements.get('#launch').href,'https://portal.3dvr.tech/valley/');assert.equal(elements.get('#app-list').hidden,true);
vm.runInContext('closeRoom()',sandbox);assert(!elements.get('#panel').classList.contains('open'));
vm.runInContext('draw(0)',sandbox);
assert(!/<script[^>]+src=/.test(html));assert.equal((html.match(/<iframe/g)||[]).length,1);assert(html.includes('tabindex="-1"'));assert(html.includes("geolocation 'none'"));
const before=vm.runInContext('JSON.stringify(player)',sandbox);vm.runInContext("openRoom(APPS.find(a=>a.name==='Sky Room'))",sandbox);assert.ok(elements.get('#sky-frame').srcdoc.includes('skyCanvas'));assert(html.includes('sandbox="allow-scripts"'));assert.equal(elements.get('#sky-frame').hidden,false);vm.runInContext('closeRoom()',sandbox);assert.equal(elements.get('#sky-frame').srcdoc,undefined);assert.equal(vm.runInContext('JSON.stringify(player)',sandbox),before);assert(html.includes('[hidden]{display:none!important}'));
console.log('PASS: syntax/init/draw, forward motion, collection dedupe, app open/back, scoped passive Sky Room frame, close unloads frame and preserves world position; no private state');
