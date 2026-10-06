import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project, createRig } from '../pocket-window/rig.js';

test('off-axis projection fixes the glass and moves near/far objects independently', () => {
  const center = { x:0, y:0, distance:2.7 }, lean = { ...center, x:.8 };
  const position = z => ({ x:.2, y:.1, z });
  const delta = z => project(position(z),lean,390,844).x - project(position(z),center,390,844).x;
  assert.equal(delta(0),0);
  assert.ok(delta(-.9)<-100,'objects beyond the glass move strongly in the opposite direction');
  assert.ok(delta(2)>100,'background reveals behind foreground');
  assert.ok(delta(14)>delta(2));
  assert.equal(project(position(-3),center,390,844),null);
  const close=project(position(-.9),{...center,distance:1.65},390,844);
  assert.ok(close.scale>project(position(-.9),center,390,844).scale);
});

test('fused camera rig stays finite and recenter removes sensor offsets', () => {
  const rig=createRig();
  Object.assign(rig.inputs.head,{x:.4,y:-.3,z:.2});
  Object.assign(rig.inputs.pointer,{x:1,y:1,z:1});
  Object.assign(rig.inputs.motion,{x:1,y:1});
  for(let i=0;i<90;i++)rig.update(1/60,1.2);
  assert.ok(rig.eye.x<=1.8&&rig.eye.distance>=1.65);
  rig.center();
  for(let i=0;i<90;i++)rig.update(1/60,1.2);
  assert.ok(Math.abs(rig.eye.x)<.001&&Math.abs(rig.eye.y)<.001);
  assert.ok(Math.abs(rig.eye.distance-2.7)<.001);
});
