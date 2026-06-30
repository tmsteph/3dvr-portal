import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const canvas = document.getElementById('string-canvas');
const statusEl = document.getElementById('status');
const controls = {
  mode: document.getElementById('mode'),
  energy: document.getElementById('energy'),
  tension: document.getElementById('tension'),
  modes: document.getElementById('modes'),
  curl: document.getElementById('curl')
};
const outputs = {
  energy: document.getElementById('energy-value'),
  tension: document.getElementById('tension-value'),
  modes: document.getElementById('modes-value'),
  curl: document.getElementById('curl-value')
};

const POINT_COUNT = 180;
const STAR_COUNT = 360;
const state = {
  paused: false,
  mode: 'open',
  yaw: -0.45,
  pitch: 0.18,
  distance: 7.2,
  dragging: false,
  pointerX: 0,
  pointerY: 0,
  startYaw: 0,
  startPitch: 0
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance'
});
renderer.setClearColor(0x05070d, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070d, 0.055);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
const root = new THREE.Group();
scene.add(root);

scene.add(new THREE.AmbientLight(0x8fb6ff, 0.8));
const keyLight = new THREE.PointLight(0x50e6ff, 4.5, 24);
keyLight.position.set(-3.5, 3.4, 4);
scene.add(keyLight);
const warmLight = new THREE.PointLight(0xf9d36a, 2.2, 18);
warmLight.position.set(4, -2, -3);
scene.add(warmLight);

const stringGeometry = new THREE.BufferGeometry();
const stringPositions = new Float32Array(POINT_COUNT * 3);
stringGeometry.setAttribute('position', new THREE.BufferAttribute(stringPositions, 3));

const stringMaterial = new THREE.LineBasicMaterial({
  color: 0x50e6ff,
  transparent: true,
  opacity: 0.96
});
const stringLine = new THREE.Line(stringGeometry, stringMaterial);
root.add(stringLine);

const echoMaterial = new THREE.LineBasicMaterial({
  color: 0xff6ad5,
  transparent: true,
  opacity: 0.28
});
const echoGeometry = new THREE.BufferGeometry();
const echoPositions = new Float32Array(POINT_COUNT * 3);
echoGeometry.setAttribute('position', new THREE.BufferAttribute(echoPositions, 3));
const echoLine = new THREE.Line(echoGeometry, echoMaterial);
root.add(echoLine);

const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(POINT_COUNT * 3);
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMaterial = new THREE.PointsMaterial({
  color: 0xf9d36a,
  size: 0.045,
  transparent: true,
  opacity: 0.74,
  depthWrite: false
});
const particles = new THREE.Points(particleGeometry, particleMaterial);
root.add(particles);

const brane = createBrane();
root.add(brane.group);

const compactDimension = createCompactDimension();
root.add(compactDimension);

const stars = createStars();
scene.add(stars);

hydrateControls();
resize();
updateCamera();
animate(0);

window.addEventListener('resize', resize);
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('wheel', onWheel, { passive: false });

Object.entries(controls).forEach(([key, input]) => {
  input.addEventListener('input', () => {
    if (key === 'mode') {
      state.mode = input.value;
      updateModeVisibility();
    }
    syncOutputs();
  });
});

document.getElementById('reset-view').addEventListener('click', () => {
  state.yaw = -0.45;
  state.pitch = 0.18;
  state.distance = 7.2;
  updateCamera();
});

document.getElementById('pause').addEventListener('click', (event) => {
  state.paused = !state.paused;
  event.currentTarget.textContent = state.paused ? 'Resume' : 'Pause';
  event.currentTarget.setAttribute('aria-pressed', String(state.paused));
});

function hydrateControls() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode && controls.mode.querySelector(`option[value="${CSS.escape(mode)}"]`)) {
    controls.mode.value = mode;
    state.mode = mode;
  }
  ['energy', 'tension', 'modes', 'curl'].forEach((key) => {
    const value = params.get(key);
    if (value !== null) {
      controls[key].value = value;
    }
  });
  syncOutputs();
  updateModeVisibility();
}

function syncOutputs() {
  outputs.energy.textContent = Number(controls.energy.value).toFixed(1);
  outputs.tension.textContent = Number(controls.tension.value).toFixed(1);
  outputs.modes.textContent = controls.modes.value;
  outputs.curl.textContent = controls.curl.value;
  statusEl.textContent = statusForMode(state.mode);
}

function statusForMode(mode) {
  if (mode === 'closed') return 'Closed string loop.';
  if (mode === 'brane') return 'String moving on a brane.';
  if (mode === 'compact') return 'Extra dimension curled small.';
  return 'Open string vibration.';
}

function updateModeVisibility() {
  brane.group.visible = state.mode === 'brane';
  compactDimension.visible = state.mode === 'compact';
  echoLine.visible = state.mode !== 'brane';
}

function createBrane() {
  const group = new THREE.Group();
  const grid = new THREE.GridHelper(7.5, 22, 0x35557c, 0x1a2d46);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.42;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  group.add(grid);

  const geometry = new THREE.PlaneGeometry(7.5, 4.6, 28, 18);
  const material = new THREE.MeshBasicMaterial({
    color: 0x243a66,
    transparent: true,
    opacity: 0.17,
    wireframe: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -0.45;
  group.add(mesh);

  return { group, mesh };
}

function createCompactDimension() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0xf9d36a,
    transparent: true,
    opacity: 0.5
  });

  for (let ringIndex = 0; ringIndex < 5; ringIndex += 1) {
    const curve = new THREE.EllipseCurve(0, 0, 0.52 + ringIndex * 0.2, 0.52 + ringIndex * 0.2);
    const points = curve.getPoints(96).map((point) => new THREE.Vector3(point.x, point.y, -0.85 - ringIndex * 0.06));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const ring = new THREE.LineLoop(geometry, material);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = ringIndex * 0.26;
    group.add(ring);
  }

  return group;
}

function createStars() {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let index = 0; index < STAR_COUNT; index += 1) {
    const radius = 9 + Math.random() * 18;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[index * 3 + 1] = Math.cos(phi) * radius;
    positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0x8ebfff,
    size: 0.022,
    transparent: true,
    opacity: 0.62,
    depthWrite: false
  }));
}

function writePoint(target, index, x, y, z) {
  target[index * 3] = x;
  target[index * 3 + 1] = y;
  target[index * 3 + 2] = z;
}

function updateString(time) {
  const energy = Number(controls.energy.value);
  const tension = Number(controls.tension.value);
  const modes = Number(controls.modes.value);
  const curl = Number(controls.curl.value);
  const amp = 0.2 + energy * 0.22;
  const speed = 0.75 + energy * 0.7 + tension * 0.2;
  const length = state.mode === 'brane' ? 6.6 : 5.5;

  for (let index = 0; index < POINT_COUNT; index += 1) {
    const u = index / (POINT_COUNT - 1);
    const centered = u - 0.5;
    let x = centered * length;
    let y = 0;
    let z = 0;
    let echoX = x;
    let echoY = 0;
    let echoZ = 0;

    if (state.mode === 'closed') {
      const angle = u * Math.PI * 2;
      const wave = Math.sin(angle * modes + time * speed) * amp * 0.45;
      const radius = 1.55 + wave;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle * modes * 0.5 + time * 0.7) * amp;
      z = Math.sin(angle) * radius;
      echoX = Math.cos(angle) * (radius + 0.32);
      echoY = Math.sin(angle * modes * 0.5 + time * 0.7 + 0.9) * amp * 0.55;
      echoZ = Math.sin(angle) * (radius + 0.32);
    } else if (state.mode === 'compact') {
      const angle = u * Math.PI * 2 * curl;
      const wave = Math.sin(u * Math.PI * modes + time * speed) * amp;
      x = centered * length;
      y = Math.sin(angle + time * speed) * (0.46 + amp * 0.25) + wave * 0.24;
      z = Math.cos(angle + time * speed) * (0.46 + amp * 0.25);
      echoX = x;
      echoY = Math.sin(angle + time * speed + Math.PI) * 0.22;
      echoZ = Math.cos(angle + time * speed + Math.PI) * 0.22 - 0.55;
    } else {
      const envelope = state.mode === 'brane' ? 1 : Math.sin(Math.PI * u);
      const waveA = Math.sin(u * Math.PI * modes + time * speed);
      const waveB = Math.sin(u * Math.PI * (modes + 1) - time * (speed * 0.72));
      x = centered * length;
      y = (waveA * 0.72 + waveB * 0.28) * amp * envelope;
      z = Math.cos(u * Math.PI * modes - time * speed) * amp * 0.34 * envelope;
      echoX = x;
      echoY = Math.sin(u * Math.PI * (modes + 2) + time * speed * 0.82) * amp * 0.45 * envelope;
      echoZ = z - 0.48;
    }

    writePoint(stringPositions, index, x, y, z);
    writePoint(echoPositions, index, echoX, echoY, echoZ);
    writePoint(particlePositions, index, x, y, z);
  }

  stringGeometry.attributes.position.needsUpdate = true;
  stringGeometry.computeBoundingSphere();
  echoGeometry.attributes.position.needsUpdate = true;
  echoGeometry.computeBoundingSphere();
  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.computeBoundingSphere();

  stringMaterial.color.set(state.mode === 'closed' ? 0xff6ad5 : 0x50e6ff);
  particleMaterial.color.set(state.mode === 'compact' ? 0xf9d36a : 0xffffff);
}

function updateBrane(time) {
  const position = brane.mesh.geometry.attributes.position;
  const energy = Number(controls.energy.value);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const ripple = Math.sin(x * 2.2 + time * 1.6) * Math.cos(y * 1.9 - time) * energy * 0.05;
    position.setZ(index, ripple);
  }
  position.needsUpdate = true;
}

function resize() {
  const width = Math.max(canvas.clientWidth || window.innerWidth, 1);
  const height = Math.max(canvas.clientHeight || window.innerHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function updateCamera() {
  const x = Math.sin(state.yaw) * Math.cos(state.pitch) * state.distance;
  const y = Math.sin(state.pitch) * state.distance;
  const z = Math.cos(state.yaw) * Math.cos(state.pitch) * state.distance;
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
}

function animate(now) {
  requestAnimationFrame(animate);
  const time = now * 0.001;
  if (!state.paused) {
    root.rotation.y += 0.0018;
    compactDimension.rotation.z -= 0.006;
    stars.rotation.y += 0.0004;
    updateString(time);
    updateBrane(time);
  }
  renderer.render(scene, camera);
}

function onPointerDown(event) {
  state.dragging = true;
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  state.startYaw = state.yaw;
  state.startPitch = state.pitch;
  canvas.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!state.dragging) return;
  const dx = (event.clientX - state.pointerX) / Math.max(window.innerWidth, 1);
  const dy = (event.clientY - state.pointerY) / Math.max(window.innerHeight, 1);
  state.yaw = state.startYaw - dx * Math.PI * 1.6;
  state.pitch = THREE.MathUtils.clamp(state.startPitch + dy * Math.PI, -1.1, 1.1);
  updateCamera();
}

function onPointerUp(event) {
  state.dragging = false;
  canvas.releasePointerCapture?.(event.pointerId);
}

function onWheel(event) {
  event.preventDefault();
  state.distance = THREE.MathUtils.clamp(state.distance + Math.sign(event.deltaY) * 0.45, 4.2, 12);
  updateCamera();
}

window.StringTheoryVisualizer = {
  renderer,
  scene,
  camera,
  updateString,
  state
};
