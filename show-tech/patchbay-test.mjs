import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatchbay } from './patchbay.mjs';

function fixtures() {
  const calls=[];
  const pipewire={
    state:{sessionAvailable:true,sinks:[{id:40,name:'USB Interface Main',default:true},{id:41,name:'HDMI Output',default:false}]},
    handle(action){calls.push(action);return {ok:true};},
  };
  const nativeAv={state:{available:true}};
  return {patchbay:createPatchbay({nativeAv,pipewire}),calls};
}

test('exposes logical program outputs and physical ports',()=>{
  const {patchbay}=fixtures();
  const m=patchbay.manifest();
  assert.deepEqual(m.logicalOutputs.map(x=>x.id),['program.video','program.audio']);
  assert.ok(m.ports.some(x=>x.id==='video:gstreamer:auto'));
  assert.ok(m.ports.some(x=>x.id==='audio:pipewire:40'));
  assert.equal(m.patches['program.audio'],'audio:pipewire:default');
});

test('patching program audio to a PipeWire sink sets that sink default',()=>{
  const {patchbay,calls}=fixtures();
  const event=patchbay.setPatch('program.audio','audio:pipewire:41');
  assert.equal(event.target,'audio:pipewire:41');
  assert.deepEqual(calls.at(-1),{type:'audio.default',payload:{target:41}});
  assert.equal(patchbay.state.patches['program.audio'],'audio:pipewire:41');
});

test('rejects incompatible and unavailable patch targets',()=>{
  const {patchbay}=fixtures();
  assert.throws(()=>patchbay.setPatch('program.audio','video:gstreamer:auto'),/cannot be patched/);
  assert.throws(()=>patchbay.setPatch('program.video','video:missing'),/Unknown or unavailable/);
});

test('works as a virtual patchbay when PipeWire is unavailable',()=>{
  const patchbay=createPatchbay({nativeAv:{state:{available:true}},pipewire:{state:{sessionAvailable:false,sinks:[]},handle(){throw new Error('should not call')}}});
  assert.equal(patchbay.state.patches['program.audio'],'audio:gstreamer:auto');
  assert.ok(patchbay.ports().some(x=>x.id==='video:gstreamer:headless'));
  assert.ok(!patchbay.ports().some(x=>x.id.startsWith('audio:pipewire:')));
});
