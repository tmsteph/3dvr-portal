import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Prism Wing ships as a focused gentle-cruise arcade flight experience', async () => {
  const page = await read('living-world/index.html');

  assert.match(page, /Prism Wing · 3DVR/);
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
  assert.match(page, /const controlMotion = \{/);
  assert.match(page, /function smoothControl/);
  assert.match(page, /Math\.exp\(-rate\*dt\)/);
  assert.match(page, /controlMotion\.lookYaw = smoothControl/);
  assert.match(page, /controlMotion\.lookPitch = smoothControl/);
  assert.match(page, /controlMotion\.thrust = smoothControl/);
  assert.match(page, /const movementModes = \[/);
  assert.match(page, /id:'flight'/);
  assert.doesNotMatch(page, /id:'adventure'/);
  assert.doesNotMatch(page, /id:'ski'/);
  assert.doesNotMatch(page, /id:'race'/);
  assert.doesNotMatch(page, /id:'arena'/);
  assert.match(page, /const motionVelocity = new THREE\.Vector3/);
  assert.match(page, /const flightForward = new THREE\.Vector3/);
  assert.match(page, /const flightRight = new THREE\.Vector3/);
  assert.match(page, /gate\.userData\.boost/);
  assert.doesNotMatch(page, /event\.code === 'Tab'/);
  assert.match(page, /fullSpeed:22/);
  assert.match(page, /boostSpeed:9/);
  assert.match(page, /gateBoostSpeed:7/);
  assert.match(page, /strafeSpeed:4\.2/);
  assert.match(page, /verticalSpeed:3\.8/);
  assert.match(page, /throttleUp:\.82/);
  assert.match(page, /throttleDown:1\.35/);
  assert.match(page, /trackSample\?\.tangent/);
  assert.match(page, /flightForward\.copy\(trackSample\.tangent\)/);
  assert.match(page, /flightThrottle \+ accelerate\*flow\.throttleUp\*dt - brakeKey\*flow\.throttleDown\*dt/);
  assert.match(page, /flow\.fullSpeed\*flightThrottle/);
  assert.match(page, /flow\.boostSpeed\*controlMotion\.thrust/);
  assert.match(page, /motionVelocity\.lerp\(motionDesired,velocityBlend\)/);
  assert.match(page, /There is no forced auto-fly/);
  assert.match(page, /use <code>W<\/code> to accelerate and <code>S<\/code> to slow down or stop/);
  assert.match(page, /const accelerate = keys\.has\('KeyW'\) \? 1 : 0/);
  assert.match(page, /const brakeKey = keys\.has\('KeyS'\) \? 1 : 0/);
  assert.match(page, /const brakeTarget = \(brakeKey \|\| keys\.has\('Space'\) \|\| keys\.has\('KeyX'\)\) \? 1 : 0/);
  assert.match(page, /keys\.has\('KeyR'\)/);
  assert.match(page, /<code>Space<\/code> to brake/);
  assert.match(page, /function triggerBarrelRoll/);
  assert.match(page, /function barrelRollAngle/);
  assert.match(page, /event\.code === 'KeyQ'/);
  assert.match(page, /event\.code === 'KeyE'/);
  assert.match(page, /touchEuler\.set\(pitch,yaw,barrelRollAngle\(now\),'YXZ'\)/);
  assert.match(page, /<code>Q\/E<\/code> barrel-roll left\/right/);
  assert.match(page, /id="mode-button"[^>]*hidden/);
  assert.match(page, /id="mode-status"/);
  assert.match(page, /resetControlMotion/);
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
  assert.match(page, /applyQuaternion\(camera\.quaternion\)/);
  assert.doesNotMatch(page.slice(page.indexOf('function gamePointSequence'), page.indexOf('function updateGateMaterials')), /const baseYaw = yaw/);
  assert.match(page, /TubeGeometry\(game\.curve,Math\.max\(96,points\.length\*26\),\.3,8,false\)/);
  assert.match(page, /function updateGame/);
  assert.match(page, /Flight line/);
  assert.match(page, /new THREE\.TubeGeometry/);
  assert.match(page, /gameTarget/);
  assert.match(page, /stage-status/);
  assert.match(page, /gate-status/);
  assert.match(page, /score-status/);
  assert.match(page, /flow-status/);
  assert.match(page, /function nearestPathSample/);
  assert.match(page, /trackSample\.distance < flow\.magnetRange/);
  assert.match(page, /motionDesired\.addScaledVector\(trackPull,flow\.magnetStrength\*magnet\)/);
  assert.match(page, /window\.__prismWingDebug/);
  assert.match(page, /passNextGate\(\)/);
  assert.match(page, /finitePosition/);
  assert.match(page, /finiteVelocity/);
  assert.match(page, /const gateBoostSpeed = Number\(currentMovementMode\(\)\.gateBoostSpeed\) \|\| 7/);
  assert.doesNotMatch(page, /currentMovementMode\(\)\.boost\*\.22/);
  assert.match(page, /function updateTrackFlow/);
  assert.match(page, /flowMultiplier/);
  assert.match(page, /function updateWorldFlowVisuals/);
  assert.match(page, /toneMappingExposure = 1\.05 \+ intensity/);
  assert.match(page, /flow-wash/);
  assert.match(page, /data-flow-state/);
  assert.match(page, /gently attracts you toward the center/);
});

test('Prism Wing and split game prototypes are discoverable', async () => {
  const [labs, search] = await Promise.all([
    read('labs/index.html'),
    read('operator/app-search.js')
  ]);

  assert.match(labs, /href="\.\.\/living-world\/"/);
  assert.match(search, /title: 'Prism Wing', href: '\/living-world\/'/);
  assert.match(search, /title: '3DVR Adventure', href: '\/open-world\/'/);
  assert.match(search, /title: 'Prism Racer', href: '\/prism-racer\/'/);
});


test('Game Hub exposes separate flight, open-world, and racing experiences', async () => {
  const [hub, adventure, racer] = await Promise.all([
    read('games.html'),
    read('open-world/index.html'),
    read('prism-racer/index.html')
  ]);
  assert.match(hub, /Prism Wing/);
  assert.match(hub, /3DVR Adventure/);
  assert.match(hub, /Prism Racer/);
  assert.match(adventure, /WASD move/);
  assert.match(adventure, /Space\/click jump \+ hold jetpack/);
  assert.match(adventure, /stars <b id="stars">0\/8/);
  assert.match(adventure, /id="jet">100%/);
  assert.match(adventure, /pointerJet/);
  assert.match(adventure, /jetFuel=Math\.max\(0,jetFuel-\.46\*dt\)/);
  assert.match(adventure, /vy=Math\.min\(10\.8,vy\+34\*dt\)/);
  assert.match(racer, /W throttle/);
  assert.match(racer, /Shift boost/);
  assert.match(racer, /magnetic road/);
});
