import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import {
  openDatabase,
  loadState,
  exportWorkspace,
  importWorkspace
} from '../life-space/storage.js';
import { createLifeSpaceSync } from '../life-space/sync.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#world');
const shell = canvas.closest('.world-shell');
const launchCard = $('#launch-card');
const launchButton = $('#launch');
const controls = $('#controls');
const spaceSelect = $('#space-select');
const syncStatus = $('#sync-status');
const speedValue = $('#speed-value');
const speedBar = $('#speed-bar');
const targetKind = $('#target-kind');
const targetTitle = $('#target-title');
const targetDistance = $('#target-distance');
const streakEl = $('#streak');
const toast = $('#toast');
const boostFlash = $('#boost-flash');
const targetMarker = $('#target-marker');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030711);
scene.fog = new THREE.FogExp2(0x030711, 0.0065);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const beaconGroup = new THREE.Group();
scene.add(beaconGroup);

scene.add(new THREE.HemisphereLight(0x8fc8ff, 0x080b18, 1.7));
const sunLight = new THREE.PointLight(0xffdc86, 52, 120, 1.5);
scene.add(sunLight);
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(1.2, 28, 28),
  new THREE.MeshStandardMaterial({ color: 0xffe8a6, emissive: 0xffb44f, emissiveIntensity: 2.5, roughness: 0.25 })
);
scene.add(sun);
const sunHalo = new THREE.Mesh(
  new THREE.SphereGeometry(2.15, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xffca72, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
);
scene.add(sunHalo);

const starsGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(1800 * 3);
for (let index = 0; index < 1800; index += 1) {
  const radius = 30 + Math.random() * 180;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);
  starPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPositions[index * 3 + 1] = radius * Math.cos(phi);
  starPositions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
}
starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(
  starsGeometry,
  new THREE.PointsMaterial({ color: 0xa7ccf5, size: 0.09, transparent: true, opacity: 0.62 })
));

const demoItems = [
  { id: 'demo-flow', type: 'idea', title: 'Find the flow' },
  { id: 'demo-build', type: 'project', title: 'Build something real' },
  { id: 'demo-explore', type: 'note', title: 'Explore the edges' },
  { id: 'demo-return', type: 'ritual', title: 'Return to the light' }
];

let db = null;
let sync = null;
let state = { activeSpaceId: 'demo', spaces: [{ id: 'demo', name: 'Flight test', items: demoItems }] };
let running = false;
let yaw = Math.PI;
let pitch = 0;
let roll = 0;
let speed = 0;
let throttle = 0.42;
let boost = 0;
let streak = 0;
let targetId = null;
let toastTimer = null;
let dragTravel = 0;
let primaryPointerId = null;
let previousPinchDistance = null;
const keys = new Set();
const activePointers = new Map();
const beacons = [];
const selectable = [];
const forward = new THREE.Vector3();
const markerVector = new THREE.Vector3();
const markerForward = new THREE.Vector3();
const markerDirection = new THREE.Vector3();

function currentSpace() {
  return state.spaces?.find(space => space.id === spaceSelect.value)
    || state.spaces?.find(space => space.id === state.activeSpaceId)
    || state.spaces?.[0];
}

function itemTitle(item) {
  return String(item.title || item.text || item.note || item.name || item.type || 'Untitled').trim().slice(0, 72);
}

function idHash(value) {
  let hash = 2166136261;
  for (const char of String(value || 'gate')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function gatePosition(item, index) {
  const seed = idHash(item.id) + index * 811;
  const angle = index * 2.399 + seededUnit(seed) * 0.9;
  const radius = 16 + (index % 6) * 8 + seededUnit(seed + 1) * 5;
  return new THREE.Vector3(
    Math.sin(angle) * radius,
    (seededUnit(seed + 2) - 0.5) * 18,
    Math.cos(angle) * radius
  );
}

function typeColor(type) {
  if (type === 'checklist') return 0xffc665;
  if (type === 'link') return 0x64efcb;
  if (type === 'image') return 0xff8fd8;
  if (type === 'file') return 0xbba0ff;
  return 0x69ccff;
}

function makeLabel(text) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 96;
  const context = labelCanvas.getContext('2d');
  context.clearRect(0, 0, 512, 96);
  context.fillStyle = 'rgba(3, 9, 22, .74)';
  context.roundRect(6, 8, 500, 80, 20);
  context.fill();
  context.strokeStyle = 'rgba(150, 219, 255, .28)';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#eef9ff';
  context.font = '700 28px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text || 'Untitled', 256, 49, 454);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(4.6, 0.86, 1);
  sprite.position.y = 2.35;
  return sprite;
}

function clearBeacons() {
  while (beaconGroup.children.length) {
    const child = beaconGroup.children.pop();
    child.traverse(node => {
      node.geometry?.dispose?.();
      node.material?.map?.dispose?.();
      node.material?.dispose?.();
    });
  }
  beacons.length = 0;
  selectable.length = 0;
}

function buildBeacons() {
  clearBeacons();
  const space = currentSpace();
  const items = (space?.items || []).filter(item => !item.archived).slice(0, 36);
  const source = items.length ? items : demoItems;

  source.forEach((item, index) => {
    const color = typeColor(item.type);
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, 0.11, 10, 56),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.68, blending: THREE.AdditiveBlending })
    );
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.46, 1),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.25, roughness: 0.28 })
    );
    group.position.copy(gatePosition(item, index));
    group.lookAt(0, 0, 0);
    group.add(ring, core, makeLabel(itemTitle(item)));
    group.userData = { item, ring, core, passed: false, phase: index * 0.83 };
    ring.userData.beacon = group;
    core.userData.beacon = group;
    beaconGroup.add(group);
    beacons.push(group);
    selectable.push(ring, core);
  });

  streak = 0;
  streakEl.textContent = '0';
  setTarget(beacons[0] || null);
}

function setTarget(beacon) {
  targetId = beacon?.userData?.item?.id || null;
  for (const entry of beacons) {
    const selected = entry === beacon;
    entry.userData.ring.material.opacity = selected ? 1 : entry.userData.passed ? 0.2 : 0.68;
    entry.userData.ring.scale.setScalar(selected ? 1.16 : 1);
  }
  if (!beacon) {
    targetKind.textContent = 'HOME STAR';
    targetTitle.textContent = 'Find your line';
    targetDistance.textContent = '—';
    return;
  }
  const item = beacon.userData.item;
  targetKind.textContent = String(item.type || 'idea').toUpperCase();
  targetTitle.textContent = itemTitle(item);
}

function targetBeacon() {
  return beacons.find(beacon => beacon.userData.item.id === targetId) || null;
}

function updateTargetMarker() {
  const target = targetBeacon();
  if (!running || !target) {
    targetMarker.hidden = true;
    return;
  }
  targetMarker.hidden = false;
  markerVector.copy(target.position).project(camera);
  camera.getWorldDirection(markerForward);
  markerDirection.copy(target.position).sub(camera.position).normalize();
  const behind = markerForward.dot(markerDirection) < 0;
  let x = behind ? -markerVector.x : markerVector.x;
  let y = behind ? -markerVector.y : markerVector.y;
  const edge = 0.82;
  const scale = Math.min(1, edge / Math.max(Math.abs(x), Math.abs(y), 0.001));
  x *= scale;
  y *= scale;
  targetMarker.style.left = `${(x * 0.5 + 0.5) * 100}%`;
  targetMarker.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
}

function nearestUnpassed() {
  let closest = null;
  let closestDistance = Infinity;
  for (const beacon of beacons) {
    if (beacon.userData.passed) continue;
    const distance = camera.position.distanceTo(beacon.position);
    if (distance < closestDistance) {
      closest = beacon;
      closestDistance = distance;
    }
  }
  return closest;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1200);
}

function flashBoost() {
  boostFlash.classList.remove('on');
  void boostFlash.offsetWidth;
  boostFlash.classList.add('on');
}

function passNearbyGate() {
  for (const beacon of beacons) {
    if (beacon.userData.passed) continue;
    const distance = camera.position.distanceTo(beacon.position);
    if (distance > 2.25) continue;
    beacon.userData.passed = true;
    beacon.userData.ring.material.opacity = 0.2;
    streak += 1;
    streakEl.textContent = String(streak);
    boost = Math.max(boost, 0.75);
    showToast(`✦ ${itemTitle(beacon.userData.item)}`);
    flashBoost();
    if (targetId === beacon.userData.item.id) setTarget(nearestUnpassed());
  }
}

function resize() {
  const rect = shell.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
}

function resetFlight() {
  camera.position.set(0, 1.8, 18);
  speed = 5;
  throttle = 0.42;
  boost = 0;
  const target = nearestUnpassed() || beacons[0] || null;
  setTarget(target);
  camera.lookAt(target?.position || new THREE.Vector3(0, 0, 0));
  yaw = camera.rotation.y;
  pitch = camera.rotation.x;
  roll = 0;
  camera.rotation.set(pitch, yaw, roll);
}

function updateFlight(dt) {
  const turn = (keys.has('a') || keys.has('arrowleft') ? -1 : 0)
    + (keys.has('d') || keys.has('arrowright') ? 1 : 0);
  const climb = (keys.has('arrowup') ? 1 : 0) + (keys.has('arrowdown') ? -1 : 0);
  const manualRoll = (keys.has('q') ? -1 : 0) + (keys.has('e') ? 1 : 0);

  if (keys.has('w')) throttle = Math.min(1, throttle + dt * 0.55);
  if (keys.has('s')) throttle = Math.max(0.08, throttle - dt * 0.7);
  yaw -= turn * dt * (0.82 + speed * 0.012);
  pitch = THREE.MathUtils.clamp(pitch + climb * dt * 0.82, -1.18, 1.18);
  const bankTarget = turn * -0.34 + manualRoll * 0.52;
  roll = THREE.MathUtils.lerp(roll, bankTarget, 1 - Math.exp(-dt * 4.2));

  const wantsBoost = keys.has('shift') || keys.has(' ');
  boost = THREE.MathUtils.lerp(boost, wantsBoost ? 1 : 0, 1 - Math.exp(-dt * (wantsBoost ? 7 : 2.4)));
  const desiredSpeed = 5 + throttle * 16 + boost * 18;
  speed = THREE.MathUtils.lerp(speed, desiredSpeed, 1 - Math.exp(-dt * 2.5));
  camera.rotation.set(pitch, yaw, roll);
  camera.getWorldDirection(forward);
  camera.position.addScaledVector(forward, speed * dt);

  const flow = THREE.MathUtils.clamp((speed - 5) / 34, 0, 1);
  speedValue.textContent = String(Math.round(flow * 100));
  speedBar.style.width = `${Math.round(flow * 100)}%`;
  camera.fov = THREE.MathUtils.lerp(camera.fov, 60 + flow * 18, 1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();

  const target = targetBeacon();
  if (target) targetDistance.textContent = `${Math.round(camera.position.distanceTo(target.position))}u`;
  passNearbyGate();
  updateTargetMarker();
}

function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(selectable, false)[0];
  const beacon = hit?.object?.userData?.beacon;
  if (beacon) {
    setTarget(beacon);
    showToast(`Target · ${itemTitle(beacon.userData.item)}`);
  }
}

function pointerDistance() {
  const values = [...activePointers.values()];
  if (values.length < 2) return null;
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

canvas.addEventListener('pointerdown', event => {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (primaryPointerId == null) {
    primaryPointerId = event.pointerId;
    dragTravel = 0;
  }
  if (activePointers.size === 2) previousPinchDistance = pointerDistance();
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  const previous = activePointers.get(event.pointerId);
  if (!previous) return;
  const next = { x: event.clientX, y: event.clientY };
  activePointers.set(event.pointerId, next);

  if (activePointers.size >= 2) {
    const distance = pointerDistance();
    if (distance != null && previousPinchDistance != null) {
      throttle = THREE.MathUtils.clamp(throttle + (distance - previousPinchDistance) * 0.0022, 0.08, 1);
      dragTravel += Math.abs(distance - previousPinchDistance);
    }
    previousPinchDistance = distance;
    return;
  }

  if (event.pointerId !== primaryPointerId || !running) return;
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  dragTravel += Math.hypot(dx, dy);
  yaw -= dx * 0.0042;
  pitch = THREE.MathUtils.clamp(pitch - dy * 0.0038, -1.18, 1.18);
  roll = THREE.MathUtils.lerp(roll, THREE.MathUtils.clamp(-dx * 0.012, -0.42, 0.42), 0.35);
});

function releasePointer(event) {
  const wasPrimary = event.pointerId === primaryPointerId;
  if (wasPrimary && dragTravel < 7 && activePointers.size === 1) pick(event.clientX, event.clientY);
  activePointers.delete(event.pointerId);
  previousPinchDistance = activePointers.size >= 2 ? pointerDistance() : null;
  if (wasPrimary) primaryPointerId = activePointers.keys().next().value ?? null;
  if (!activePointers.size) dragTravel = 0;
}

canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  throttle = THREE.MathUtils.clamp(throttle - event.deltaY * 0.0008, 0.08, 1);
}, { passive: false });

window.addEventListener('keydown', event => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  keys.add(event.key.toLowerCase());
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) event.preventDefault();
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));

launchButton.addEventListener('click', () => {
  running = true;
  launchCard.hidden = true;
  resetFlight();
  clock.getDelta();
  showToast('Fly the line');
});

spaceSelect.addEventListener('change', () => {
  buildBeacons();
  resetFlight();
  showToast(currentSpace()?.name || 'New space');
});

function populateSpaces() {
  spaceSelect.innerHTML = '';
  const spaces = state.spaces?.length ? state.spaces : [{ id: 'demo', name: 'Flight test', items: demoItems }];
  for (const space of spaces) {
    const option = document.createElement('option');
    option.value = space.id;
    option.textContent = space.name || 'Untitled space';
    option.selected = space.id === state.activeSpaceId;
    spaceSelect.append(option);
  }
  if (!spaceSelect.value && spaces[0]) spaceSelect.value = spaces[0].id;
}

async function loadLocalState() {
  try {
    db = await openDatabase();
    const localState = await loadState(db);
    if (localState?.spaces?.length) state = localState;
  } catch {
    syncStatus.textContent = 'Local flight mode';
  }
}

async function refreshFromSync() {
  if (!db) return;
  try {
    sync = createLifeSpaceSync({
      onStatus(message) { syncStatus.textContent = message; }
    });
    const payload = await exportWorkspace(db, state);
    const merged = await sync.load(payload);
    if (!merged?.state?.spaces?.length) return;
    state = merged.state;
    try { await importWorkspace(db, merged); } catch {}
    if (!running) {
      populateSpaces();
      buildBeacons();
      resetFlight();
    }
  } catch {
    syncStatus.textContent = 'Life Space local';
  }
}

async function initialize() {
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  controls.textContent = touch
    ? 'Drag to steer · pinch for speed · tap a gate to target'
    : 'Drag to steer · wheel/W/S speed · Shift boost · arrows climb';
  resize();
  await loadLocalState();
  populateSpaces();
  buildBeacons();
  resetFlight();
  syncStatus.textContent = state.spaces?.length ? 'Life Space ready' : 'Flight test';
  refreshFromSync();
}

new ResizeObserver(resize).observe(shell);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animate(time) {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (running) updateFlight(dt);

  if (!reduceMotion) {
    const pulse = Math.sin(time * 0.002);
    sun.scale.setScalar(1 + pulse * 0.035);
    sunHalo.scale.setScalar(1 + pulse * 0.08);
    sunHalo.material.opacity = 0.11 + (pulse + 1) * 0.025;
    for (const beacon of beacons) {
      const { ring, core, phase, passed } = beacon.userData;
      ring.rotation.z += dt * (passed ? 0.25 : 0.72);
      core.rotation.x += dt * 0.48;
      core.rotation.y += dt * 0.7;
      const breathe = 1 + Math.sin(time * 0.0025 + phase) * 0.045;
      core.scale.setScalar(breathe);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

initialize();
requestAnimationFrame(animate);
