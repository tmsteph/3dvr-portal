const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync(__dirname+'/../sign-in.html','utf8');
const code=html.slice(html.indexOf('    let authAttemptState'),html.indexOf('    function finishLogin('));
function setup(){let expire,resolveRelay,callback,calls=0,finishes=0,creates=0,createCallback,busy=false,status='';const elements={username:{value:'fixture@3dvr'},password:{value:' synthetic '},'auth-reload':{hidden:true},'create-account':{checked:false,addEventListener:()=>{}},'confirm-password':{value:' synthetic '}};const gun={};const account={back:()=>gun,_:{},create:(a,p,cb)=>{creates++;createCallback=cb},is:null,auth:(a,p,cb)=>{calls++;callback=cb;assert.equal(a,'fixture@3dvr');assert.equal(p,'synthetic')}};const listeners={};const ctx=vm.createContext({window:{addEventListener:(n,f)=>listeners[n]=f},document:{getElementById:id=>elements[id]},setTimeout:f=>(expire=f,1),clearTimeout:()=>{},setAuthBusy:value=>{busy=value},setAuthStatus:value=>{status=value},gun,gunIsStub:false,waitForGunRelay:()=>new Promise(r=>resolveRelay=r),user:account,finishLogin:()=>finishes++});vm.runInContext("user._={opt:{},sea:{pub:'fixture',epub:'fixture-epub',priv:'fixture-priv',epriv:'fixture-epriv'}}",ctx);vm.runInContext(code,ctx);return {ctx,elements,account,listeners,start:()=>ctx.signIn(),relay:(ready=true)=>resolveRelay(ready),expire:()=>expire(),busy:()=>busy,status:()=>status,ack:a=>callback(a),calls:()=>calls,creates:()=>creates,createAck:a=>createCallback(a),finishes:()=>finishes};}
test('single flight before relay and after auth begins',async()=>{const s=setup();const p=s.start();await s.start();s.relay();await p;await s.start();assert.equal(s.calls(),1)});
test('pre-auth relay timeout lets the same page retry once the relay recovers',async()=>{
  const s=setup();
  const first=s.start();
  assert.equal(s.busy(),true);
  assert.equal(s.elements['create-account'].disabled,true);
  s.relay(false);
  await first;
  assert.equal(s.calls(),0);
  assert.equal(s.creates(),0);
  assert.equal(s.elements['auth-reload'].hidden,true);
  assert.equal(s.elements['create-account'].disabled,false);
  assert.equal(s.busy(),false);
  assert.match(s.status(),/relay has not connected yet.*Try again on this page/);
  const retry=s.start();
  s.relay();
  await retry;
  s.account.is={pub:'fixture'};
  s.ack({pub:'fixture'});
  assert.equal(s.calls(),1);
  assert.equal(s.finishes(),1);
});
test('explicit signup can retry connection without promising an account was created',async()=>{
  const s=setup();
  s.elements['create-account'].checked=true;
  const first=s.start();
  s.relay(false);
  await first;
  assert.equal(s.creates(),0);
  assert.equal(s.elements['create-account'].checked,true);
  assert.doesNotMatch(s.status(),/Creation may have completed/);
  const retry=s.start();
  s.relay();
  await retry;
  assert.equal(s.creates(),1);
});
test('leaving before relay readiness prevents retry and never starts authentication',async()=>{
  const s=setup();
  const pending=s.start();
  s.listeners.pagehide();
  s.relay(false);
  await pending;
  await s.start();
  assert.equal(s.calls(),0);
  assert.equal(s.busy(),true);
});
test('late underlying mutation cannot finish UI or permit retry',async()=>{const s=setup();const p=s.start();s.relay();await p;s.expire();s.account.is={pub:'late'};s.ack({pub:'late'});await s.start();assert.equal(s.finishes(),0);assert.equal(s.calls(),1);assert.equal(s.account.is.pub,'late')});
for(const ack of [{err:'network'},{wait:true},{err:'wrong password'},null])test('failure is terminal: '+JSON.stringify(ack),async()=>{const s=setup();const p=s.start();s.relay();await p;s.ack(ack);await s.start();assert.equal(s.calls(),1);assert.equal(s.finishes(),0);assert.equal(s.elements['auth-reload'].hidden,false)});
test('verified success finishes once',async()=>{const s=setup();const p=s.start();s.relay();await p;s.account.is={pub:'fixture'};s.ack({pub:'fixture'});s.ack({pub:'fixture'});assert.equal(s.finishes(),1)});
test('pagehide invalidates callback',async()=>{const s=setup();const p=s.start();s.relay();await p;s.listeners.pagehide();s.account.is={pub:'late'};s.ack({pub:'late'});assert.equal(s.finishes(),0)});
test('no implicit account creation and alternative auth guarded',()=>{assert.match(code,/if \(creating\) \{/);assert.match(html,/function continueAsGuest\(\) \{\s*if \(authAttemptState !== 'idle'\) return/);assert.match(html,/function startOauth\(provider\) \{\s*if \(authAttemptState !== 'idle'\) return/)});

test('default login error never creates an account',async()=>{const s=setup();const p=s.start();s.relay();await p;s.ack({err:'not found'});assert.equal(s.creates(),0)});
test('explicit signup creates then verifies once',async()=>{const s=setup();s.elements['create-account'].checked=true;const p=s.start();s.relay();await p;assert.equal(s.creates(),1);assert.equal(s.calls(),0);s.createAck({pub:'fixture'});assert.equal(s.calls(),1);s.account.is={pub:'fixture'};s.ack({pub:'fixture'});assert.equal(s.finishes(),1)});
test('signup password mismatch starts no request',async()=>{const s=setup();s.elements['create-account'].checked=true;s.elements['confirm-password'].value='different';await s.start();assert.equal(s.creates(),0);assert.equal(s.calls(),0)});
test('late creation cannot start authentication after timeout',async()=>{const s=setup();s.elements['create-account'].checked=true;const p=s.start();s.relay();await p;s.expire();s.createAck({pub:'fixture'});assert.equal(s.calls(),0)});
function finishSetup(){let expire,resolveMigration,profile=0;const values=new Map();const ctx=vm.createContext({authAttemptState:'complete',setTimeout:f=>(expire=f,1),clearTimeout:()=>{},window:{location:{href:''}},localStorage:{setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},user:{is:{pub:'verified-fixture'},get:()=>({put:()=>{}})},postSignInDestination:'/helm/',migrateGuestProgress:()=>new Promise(r=>resolveMigration=r),ensureUserTotalsConsistency:()=>Promise.resolve(),recordUserProfile:()=>{profile++;return new Promise(()=>{})},console});const fn=html.slice(html.indexOf('    function finishLogin('),html.indexOf('    function clearGuestSession('));vm.runInContext(fn,ctx);return{ctx,values,start:()=>ctx.finishLogin('fixture','fixture@3dvr','synthetic'),expire:()=>expire(),resolve:()=>resolveMigration(),profile:()=>profile};}
test('post-auth guest read cannot prevent bounded navigation',()=>{const s=finishSetup();s.start();assert.equal(s.ctx.window.location.href,'');s.expire();assert.equal(s.ctx.window.location.href,'/helm/');assert.equal(s.values.get('userPubKey'),'verified-fixture')});
test('late optional migration does not start a new profile stage',async()=>{const s=finishSetup();s.start();s.expire();s.resolve();await new Promise(setImmediate);assert.equal(s.profile(),0)});
test('pagehide prevents optional deadline redirect',()=>{const s=finishSetup();s.start();s.ctx.authAttemptState='terminal';s.expire();assert.equal(s.ctx.window.location.href,'')});
test('profile read cannot hold navigation forever',async()=>{const s=finishSetup();s.start();s.resolve();await new Promise(setImmediate);assert.equal(s.profile(),1);s.expire();assert.equal(s.ctx.window.location.href,'/helm/')});
function relaySetup(){const events={},timers=new Map();let id=0;const ctx=vm.createContext({gunIsStub:false,gun:{on:(n,f)=>events[n]=f},setTimeout:f=>{timers.set(++id,f);return id},clearTimeout:n=>timers.delete(n),console});vm.runInContext('const connectedGunRelayPeers=new Set();const gunRelayWaiters=new Set();'+html.slice(html.indexOf('    function watchGunRelay()'),html.indexOf('    function isGuestUpgradeContext()')),ctx);return{ctx,events,expire:()=>{for(const f of [...timers.values()])f()},count:()=>timers.size};}
test('the final relay departure invalidates readiness until fresh hi',async()=>{
  const s=relaySetup();
  const peer={url:'https://fixture.invalid/gun'};
  s.events.hi(peer);
  assert.equal(await s.ctx.waitForGunRelay(),true);
  s.events.bye(peer);
  const ready=s.ctx.waitForGunRelay();
  assert.equal(s.count(),1);
  s.events.hi(peer);
  assert.equal(await ready,true);
  assert.equal(s.count(),0);
});
test('one peer departure keeps another ready without a new hi',async()=>{
  const s=relaySetup();
  const peers=[{url:'https://fixture.invalid/gun'},{url:'wss://fixture.invalid/gun'}];
  for(const peer of peers) s.events.hi(peer);
  s.events.bye(peers[0]);
  s.events.bye(peers[0]); // duplicate departure must not remove the other peer
  const surviving=s.ctx.waitForGunRelay();
  assert.equal(s.count(),0);
  assert.equal(await surviving,true);
  s.events.bye(peers[1]);
  const waiting=s.ctx.waitForGunRelay();
  assert.equal(s.count(),1);
  s.expire();
  assert.equal(await waiting,false);
  assert.equal(s.count(),0);
});
test('relay timeout removes waiter and later reconnect supports a fresh wait',async()=>{
  const s=relaySetup();
  const p=s.ctx.waitForGunRelay();
  s.expire();
  assert.equal(await p,false);
  s.events.hi({url:'https://fixture.invalid/gun'});
  assert.equal(await s.ctx.waitForGunRelay(),true);
  assert.equal(s.count(),0);
});

test('bfcache restore exposes reload and never re-arms authentication',async()=>{const s=setup();const p=s.start();s.relay();await p;s.listeners.pagehide();s.listeners.pageshow({persisted:true});assert.equal(s.elements['auth-reload'].hidden,false);await s.start();assert.equal(s.calls(),1)});
test('legacy password whitespace normalization retained',()=>{assert.match(code,/password = document.getElementById\('password'\).value.trim\(\)/)});

test('only valid current success enables Gun persistence',async()=>{const s=setup();const p=s.start();s.relay();await p;assert.equal(s.account._.opt.remember,undefined);s.account.is={pub:'fixture'};s.ack({pub:'fixture'});assert.equal(s.account._.opt.remember,true)});
test('timeout leaves persistence disabled despite late internal success',async()=>{const s=setup();const p=s.start();s.relay();await p;s.expire();s.account.is={pub:'fixture'};s.ack({pub:'fixture'});assert.equal(s.account._.opt.remember,undefined);assert.equal(s.finishes(),0)});
test('unexpected options shape fails closed before saving app identity',async()=>{const s=setup();const p=s.start();s.relay();await p;delete s.account._.opt;s.account.is={pub:'fixture'};s.ack({pub:'fixture'});assert.equal(s.finishes(),0)});
test('credential form pins matching Gun runtime and never eagerly recalls',()=>{assert.match(html,/gun@0\.2020\.1241\/gun.js/);assert.match(html,/gun@0\.2020\.1241\/sea.js/);assert.doesNotMatch(html,/user\.recall\?\./)});
