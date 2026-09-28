import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Living World ships as an in-portal evolving 3D experience', async () => {
  const page = await read('living-world/index.html');

  assert.match(page, /Living World · 3DVR/);
  assert.match(page, /three@0\.176\.0\/build\/three\.module\.js/);
  assert.match(page, /id="world-prompt"/);
  assert.match(page, /World dreams/);
  assert.match(page, /dreamWorld\(false\)/);
  assert.match(page, /deviceorientation/);
  assert.match(page, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(page, /portal:issue-launcher\" content=\"off/);
  assert.match(page, /requestPointerLock/);
  assert.match(page, /pointerlockchange/);
  assert.match(page, /document\.exitPointerLock/);
  assert.match(page, /promptInput\.blur\(\)/);
  assert.match(page, /const weaponModes = \['pulse','beam','bomb'\]/);
  assert.match(page, /function firePulse/);
  assert.match(page, /function fireBomb/);
  assert.match(page, /function updateBeam/);
  assert.match(page, /Digit1/);
  assert.match(page, /Digit2/);
  assert.match(page, /Digit3/);
  assert.match(page, /rainbow\|more colors/);
  assert.match(page, /prism:\{bg:/);
  assert.match(page, /candy:\{bg:/);
  assert.match(page, /solar:\{bg:/);
  assert.match(page, /askLivingWorld/);
  assert.match(page, /provider=operator/);
  assert.match(page, /applyWorldAiTags/);
  assert.match(page, /You can talk to me normally/);
  assert.match(page, /fastTravel/);
  assert.match(page, /thrustAccel/);
  assert.match(page, /const controlMotion = \{/);
  assert.match(page, /function smoothControl/);
  assert.match(page, /Math\.exp\(-rate\*dt\)/);
  assert.match(page, /controlMotion\.lookYaw = smoothControl/);
  assert.match(page, /controlMotion\.lookPitch = smoothControl/);
  assert.match(page, /controlMotion\.thrust = smoothControl/);
  assert.match(page, /resetControlMotion/);
  assert.match(page, /const shipVelocity = new THREE\.Vector3/);
  assert.match(page, /const shipAcceleration = new THREE\.Vector3/);
  assert.match(page, /shipVelocity\.addScaledVector\(shipAcceleration,dt\)/);
  assert.match(page, /Math\.exp\(-dragRate\*dt\)/);
  assert.match(page, /maxShipSpeed/);
  assert.match(page, /ShiftLeft/);
  assert.match(page, /ControlLeft/);
  assert.match(page, /KeyC/);
  assert.match(page, /KeyF/);
  assert.match(page, /KeyG/);
  assert.match(page, /ArrowLeft/);
  assert.match(page, /openWorldEditor/);
  assert.match(page, /event\.code === 'Slash' \|\| event\.code === 'Enter'/);
  assert.match(page, /function enterTextMode/);
  assert.match(page, /function enterWorldMode/);
  assert.match(page, /event\.code === 'Escape'/);
  assert.match(page, /Text mode/);
  assert.match(page, /World mode/);
  assert.match(page, /const game = \{/);
  assert.match(page, /function buildGamePath/);
  assert.match(page, /function trackProfile/);
  assert.match(page, /Glide/);
  assert.match(page, /Slalom/);
  assert.match(page, /Skyline/);
  assert.match(page, /Corkscrew/);
  assert.match(page, /Gauntlet/);
  assert.match(page, /passRadius/);
  assert.match(page, /game\.difficulty >= 3/);
  assert.match(page, /applyQuaternion\(camera\.quaternion\)/);
  assert.doesNotMatch(page.slice(page.indexOf('function gamePointSequence'), page.indexOf('function updateGateMaterials')), /const baseYaw = yaw/);
  assert.match(page, /TubeGeometry\(game\.curve,Math\.max\(96,points\.length\*26\),\.18,8,false\)/);
  assert.match(page, /function updateGame/);
  assert.match(page, /Path Run/);
  assert.match(page, /new THREE\.TubeGeometry/);
  assert.match(page, /gameTarget/);
  assert.match(page, /stage-status/);
  assert.match(page, /gate-status/);
  assert.match(page, /score-status/);
});

test('Living World is discoverable from Labs and Operator search', async () => {
  const [labs, search] = await Promise.all([
    read('labs/index.html'),
    read('operator/app-search.js')
  ]);

  assert.match(labs, /href="\.\.\/living-world\/"/);
  assert.match(search, /title: 'Living World', href: '\/living-world\/'/);
});
