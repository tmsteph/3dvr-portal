import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const canvas = document.getElementById('logoCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 0.15, 10.8);

const root = new THREE.Group();
root.rotation.x = -0.05;
scene.add(root);

scene.add(new THREE.AmbientLight(0x9eb7ff, 1.55));

const key = new THREE.PointLight(0xffffff, 22, 22, 1.8);
key.position.set(2.8, 4.5, 6);
scene.add(key);

const rimA = new THREE.PointLight(0x49ddff, 14, 18, 2);
rimA.position.set(-5, -1.5, 3);
scene.add(rimA);

const rimB = new THREE.PointLight(0xff5fb3, 13, 18, 2);
rimB.position.set(5, 0.5, 1);
scene.add(rimB);

const palettes = [
  ['#55e6ff', '#a77cff', '#ff6c9e', '#ffd166', '#66f0c8'],
  ['#80ffdb', '#64a8ff', '#b68cff', '#ff7eb6', '#ffe169'],
  ['#ff7a7a', '#ffbc5b', '#fff173', '#55e6d0', '#5aa8ff'],
  ['#f7f8ff', '#7ee9ff', '#8a9cff', '#cb87ff', '#ff8fcb']
];

let paletteIndex = 0;
let depthScale = 1;
let autoMotion = true;
let glowEnabled = true;
let dragging = false;
let dragMoved = false;
let lastX = 0;
let lastY = 0;
let targetRotX = -0.05;
let targetRotY = 0;
let zoomTarget = 10.8;

const strokeMaterials = [];
const burstParticles = [];

function makeMaterial(color, glow = 0.45) {
  const c = new THREE.Color(color);
  const mat = new THREE.MeshPhysicalMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: glow,
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18
  });
  strokeMaterials.push(mat);
  return mat;
}

function wobblePoint([x, y, z], index) {
  return new THREE.Vector3(
    x,
    y,
    z + Math.sin((x * 2.3) + y + index) * 0.035
  );
}

function tube(points, color, radius = 0.105, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(wobblePoint), closed, 'catmullrom', 0.35);
  const geometry = new THREE.TubeGeometry(curve, Math.max(30, points.length * 12), radius, 10, closed);
  const mesh = new THREE.Mesh(geometry, makeMaterial(color));
  mesh.castShadow = true;
  return mesh;
}

function circleStroke(cx, cy, r, color, z = 0, radius = 0.085) {
  const pts = [];
  const count = 32;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z + Math.sin(a * 3) * 0.025]);
  }
  return tube(pts, color, radius, true);
}

function addStroke(points, color, radius = 0.11) {
  const mesh = tube(points, color, radius);
  root.add(mesh);
  return mesh;
}

function addLegacyGoggles() {
  const g = new THREE.Group();
  g.position.set(-3.45, 0.1, 0.12);

  const left = circleStroke(-0.43, 0, 0.5, palettes[0][0], .08, .095);
  const right = circleStroke(0.63, 0.01, 0.5, palettes[0][2], .08, .095);
  g.add(left, right);

  const bridge = tube([
    [-0.02, 0.06, .09],
    [0.06, 0.16, .13],
    [0.18, 0.18, .14],
    [0.27, 0.08, .10]
  ], palettes[0][1], .075);
  g.add(bridge);

  const leftArm = tube([[-0.92, .11, .04], [-1.22, .24, -.04], [-1.47, .14, -.15]], palettes[0][3], .055);
  const rightArm = tube([[1.13, .12, .04], [1.41, .25, -.04], [1.62, .13, -.15]], palettes[0][4], .055);
  g.add(leftArm, rightArm);

  const lensMaterialA = new THREE.MeshPhysicalMaterial({
    color: 0x43ddff,
    transparent: true,
    opacity: .18,
    roughness: .08,
    transmission: .2,
    thickness: .15,
    side: THREE.DoubleSide
  });
  const lensMaterialB = lensMaterialA.clone();
  lensMaterialB.color.set(0xff67b1);
  const lensGeometry = new THREE.CircleGeometry(.41, 48);
  const lensA = new THREE.Mesh(lensGeometry, lensMaterialA);
  const lensB = new THREE.Mesh(lensGeometry, lensMaterialB);
  lensA.position.set(-.43, 0, .06);
  lensB.position.set(.63, .01, .06);
  g.add(lensA, lensB);

  root.add(g);
}

function buildLetters() {
  // Handwritten-style 3
  addStroke([
    [-1.82, .63, .04], [-1.57, .88, .09], [-1.22, .91, .12], [-1.00, .72, .10],
    [-1.10, .43, .06], [-1.38, .27, .02], [-1.04, .18, .04], [-.91, -.10, .02],
    [-1.05, -.48, -.02], [-1.40, -.65, -.04], [-1.72, -.52, -.03]
  ], palettes[0][0], .12);

  // D
  addStroke([
    [-.58, -.68, -.02], [-.57, -.28, .02], [-.55, .12, .06], [-.52, .52, .10], [-.49, .82, .12]
  ], palettes[0][1], .12);
  addStroke([
    [-.49, .81, .12], [-.06, .83, .14], [.26, .65, .13], [.39, .28, .08],
    [.34, -.18, .03], [.12, -.53, -.02], [-.21, -.67, -.04], [-.57, -.68, -.02]
  ], palettes[0][1], .12);

  // V
  addStroke([
    [.72, .78, .11], [.90, .30, .08], [1.08, -.16, .02], [1.27, -.64, -.04]
  ], palettes[0][2], .12);
  addStroke([
    [1.27, -.64, -.04], [1.49, -.10, .01], [1.70, .37, .07], [1.91, .77, .10]
  ], palettes[0][3], .12);

  // R
  addStroke([
    [2.24, -.66, -.03], [2.25, -.20, .01], [2.25, .28, .06], [2.25, .80, .12]
  ], palettes[0][4], .12);
  addStroke([
    [2.25, .78, .12], [2.62, .83, .14], [2.91, .69, .13], [3.00, .42, .09],
    [2.92, .16, .06], [2.63, .04, .04], [2.26, .07, .04]
  ], palettes[0][4], .12);
  addStroke([
    [2.62, .05, .04], [2.80, -.18, .01], [3.02, -.42, -.02], [3.22, -.66, -.04]
  ], palettes[0][0], .11);
}

function addSparkField() {
  const count = 130;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - .5) * 11;
    positions[i * 3 + 1] = (Math.random() - .5) * 6.5;
    positions[i * 3 + 2] = -1 - Math.random() * 5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xaec9ff, size: .035, transparent: true, opacity: .58 });
  scene.add(new THREE.Points(geometry, mat));
}

function makeBurst() {
  const palette = palettes[paletteIndex];
  for (let i = 0; i < 34; i++) {
    const geometry = new THREE.SphereGeometry(.035 + Math.random() * .045, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: palette[i % palette.length], transparent: true, opacity: 1 });
    const p = new THREE.Mesh(geometry, mat);
    p.position.set((Math.random() - .5) * .5, (Math.random() - .5) * .35, .4);
    const angle = Math.random() * Math.PI * 2;
    const speed = .035 + Math.random() * .065;
    p.userData.v = new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, (Math.random() - .35) * .04);
    p.userData.life = 1;
    scene.add(p);
    burstParticles.push(p);
  }
  root.scale.set(1.06, 1.06, 1.06);
}

function applyPalette() {
  const palette = palettes[paletteIndex];
  strokeMaterials.forEach((mat, i) => {
    const c = new THREE.Color(palette[i % palette.length]);
    mat.color.copy(c);
    mat.emissive.copy(c);
  });
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();

  const mobile = rect.width < 640;
  root.scale.setScalar(mobile ? .76 : 1);
  root.position.y = mobile ? .35 : .25;
}

addLegacyGoggles();
buildLetters();
addSparkField();
resize();

window.addEventListener('resize', resize);

canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  dragMoved = false;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture?.(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;

  if (dragging) {
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
    targetRotY += dx * .008;
    targetRotX += dy * .006;
    lastX = event.clientX;
    lastY = event.clientY;
  } else {
    targetRotY = nx * .19;
    targetRotX = -.05 + ny * .10;
  }
});

canvas.addEventListener('pointerup', (event) => {
  dragging = false;
  if (!dragMoved) makeBurst();
  canvas.releasePointerCapture?.(event.pointerId);
});

canvas.addEventListener('pointercancel', () => { dragging = false; });

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomTarget = THREE.MathUtils.clamp(zoomTarget + event.deltaY * .006, 8.1, 14);
}, { passive: false });

document.getElementById('burstButton').addEventListener('click', makeBurst);

document.getElementById('paletteButton').addEventListener('click', () => {
  paletteIndex = (paletteIndex + 1) % palettes.length;
  applyPalette();
  makeBurst();
});

document.getElementById('motionToggle').addEventListener('change', (event) => {
  autoMotion = event.target.checked;
});

document.getElementById('glowToggle').addEventListener('change', (event) => {
  glowEnabled = event.target.checked;
  strokeMaterials.forEach(mat => {
    mat.emissiveIntensity = glowEnabled ? .45 : .04;
  });
});

document.getElementById('depthRange').addEventListener('input', (event) => {
  depthScale = Number(event.target.value);
});

document.getElementById('resetButton').addEventListener('click', () => {
  targetRotX = -.05;
  targetRotY = 0;
  zoomTarget = 10.8;
  depthScale = 1;
  document.getElementById('depthRange').value = '1';
  root.position.z = 0;
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  root.rotation.x += (targetRotX - root.rotation.x) * .055;
  root.rotation.y += (targetRotY - root.rotation.y) * .055;

  if (autoMotion && !dragging) {
    root.rotation.z = Math.sin(t * .45) * .015;
    root.position.z = Math.sin(t * .7) * .06 * depthScale;
  } else {
    root.rotation.z *= .94;
  }

  camera.position.z += (zoomTarget - camera.position.z) * .08;

  root.children.forEach((child, index) => {
    if (child.isMesh) {
      child.position.z = Math.sin(t * 1.2 + index * .55) * .025 * depthScale;
    }
  });

  root.scale.lerp(new THREE.Vector3(
    root.scale.x > 1.01 ? 1 : root.scale.x,
    root.scale.y > 1.01 ? 1 : root.scale.y,
    root.scale.z > 1.01 ? 1 : root.scale.z
  ), .08);

  for (let i = burstParticles.length - 1; i >= 0; i--) {
    const p = burstParticles[i];
    p.position.add(p.userData.v);
    p.userData.v.multiplyScalar(.985);
    p.userData.life -= .018;
    p.material.opacity = Math.max(0, p.userData.life);
    p.scale.setScalar(.75 + p.userData.life * .55);
    if (p.userData.life <= 0) {
      scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      burstParticles.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}

animate();