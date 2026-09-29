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

const rimA = new THREE.PointLight(0x4285f4, 15, 18, 2);
rimA.position.set(-5, -1.5, 3);
scene.add(rimA);

const rimB = new THREE.PointLight(0xea4335, 14, 18, 2);
rimB.position.set(5, 0.5, 1);
scene.add(rimB);

const palettes = [
  ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#FFFFFF'],
  ['#F25022', '#7FBA00', '#00A4EF', '#FFB900', '#FFFFFF'],
  ['#E52521', '#049CD8', '#FBD000', '#43B047', '#FFFFFF'],
  ['#FF3B30', '#0078D4', '#FFD60A', '#34C759', '#FFFFFF']
];

let paletteIndex = 0;
let depthScale = 1;
let autoMotion = true;
let glowEnabled = true;
let dragging = false;
let dragMoved = false;
let dragDistance = 0;
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

function addSkiGoggles() {
  const g = new THREE.Group();
  g.position.set(-3.48, 0.08, 0.18);
  g.rotation.z = -0.055;

  const palette = palettes[paletteIndex];

  const outer = new THREE.Shape();
  outer.moveTo(-1.22, 0.12);
  outer.bezierCurveTo(-1.17, 0.72, -0.78, 0.92, -0.26, 0.91);
  outer.lineTo(0.58, 0.91);
  outer.bezierCurveTo(1.10, 0.91, 1.43, 0.68, 1.48, 0.12);
  outer.bezierCurveTo(1.42, -0.55, 1.04, -0.78, 0.50, -0.77);
  outer.lineTo(-0.27, -0.77);
  outer.bezierCurveTo(-0.80, -0.77, -1.17, -0.53, -1.22, 0.12);

  const inner = new THREE.Path();
  inner.moveTo(-0.90, 0.10);
  inner.bezierCurveTo(-0.86, 0.45, -0.62, 0.58, -0.24, 0.57);
  inner.lineTo(0.52, 0.57);
  inner.bezierCurveTo(0.89, 0.57, 1.10, 0.43, 1.14, 0.09);
  inner.bezierCurveTo(1.09, -0.29, 0.86, -0.43, 0.49, -0.43);
  inner.lineTo(-0.23, -0.43);
  inner.bezierCurveTo(-0.62, -0.43, -0.86, -0.29, -0.90, 0.10);
  outer.holes.push(inner);

  const frameGeo = new THREE.ExtrudeGeometry(outer, {
    depth: 0.30,
    bevelEnabled: true,
    bevelSegments: 5,
    steps: 1,
    bevelSize: 0.075,
    bevelThickness: 0.06
  });
  const frame = new THREE.Mesh(frameGeo, makeMaterial(palette[2], 0.20));
  frame.position.z = -0.14;
  frame.scale.setScalar(0.64);
  g.add(frame);

  const visorShape = new THREE.Shape();
  visorShape.moveTo(-0.88, 0.08);
  visorShape.bezierCurveTo(-0.84, 0.41, -0.61, 0.52, -0.22, 0.51);
  visorShape.lineTo(0.50, 0.51);
  visorShape.bezierCurveTo(0.87, 0.51, 1.05, 0.39, 1.08, 0.08);
  visorShape.bezierCurveTo(1.03, -0.23, 0.82, -0.35, 0.47, -0.35);
  visorShape.lineTo(-0.21, -0.35);
  visorShape.bezierCurveTo(-0.58, -0.35, -0.83, -0.22, -0.88, 0.08);

  const visorGeo = new THREE.ExtrudeGeometry(visorShape, {
    depth: 0.11,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.035,
    bevelThickness: 0.025
  });
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(palette[0]),
    emissive: new THREE.Color(palette[0]),
    emissiveIntensity: 0.10,
    transparent: true,
    opacity: 0.84,
    transmission: 0.18,
    roughness: 0.08,
    metalness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.06
  });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.z = 0.10;
  visor.scale.setScalar(0.64);
  g.add(visor);

  const brow = tube([
    [-0.78, 0.44, 0.23],
    [-0.28, 0.56, 0.27],
    [0.32, 0.55, 0.27],
    [0.82, 0.42, 0.22]
  ], palette[1], 0.065);
  brow.scale.setScalar(0.80);
  brow.position.set(0.08, 0.08, 0.06);
  g.add(brow);

  const strapGeo = new THREE.BoxGeometry(0.68, 0.20, 0.11);
  const strapMat = makeMaterial(palette[3], 0.10);
  const leftStrap = new THREE.Mesh(strapGeo, strapMat);
  leftStrap.position.set(-0.91, 0.03, -0.02);
  leftStrap.rotation.z = 0.12;
  const rightStrap = leftStrap.clone();
  rightStrap.position.set(1.14, 0.03, -0.02);
  rightStrap.rotation.z = -0.12;
  g.add(leftStrap, rightStrap);

  const shineGeo = new THREE.PlaneGeometry(0.88, 0.12);
  const shineMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.26,
    side: THREE.DoubleSide
  });
  const shine = new THREE.Mesh(shineGeo, shineMat);
  shine.position.set(0.12, 0.20, 0.23);
  shine.rotation.z = -0.10;
  g.add(shine);

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

function makeBurst(multiplier = 1) {
  const palette = palettes[paletteIndex];
  for (let i = 0; i < Math.floor(34 * multiplier); i++) {
    const geometry = new THREE.SphereGeometry(.035 + Math.random() * .045, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: palette[i % palette.length], transparent: true, opacity: 1 });
    const p = new THREE.Mesh(geometry, mat);
    p.position.set((Math.random() - .5) * .5, (Math.random() - .5) * .35, .4);
    const angle = Math.random() * Math.PI * 2;
    const speed = (.035 + Math.random() * .065) * multiplier;
    p.userData.v = new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, (Math.random() - .35) * .04 * multiplier);
    p.userData.life = 1;
    scene.add(p);
    burstParticles.push(p);
  }
  const pop = 1.06 + (multiplier - 1) * 0.05;
  root.scale.set(pop, pop, pop);
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

addSkiGoggles();
buildLetters();
addSparkField();
resize();

window.addEventListener('resize', resize);

canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  dragMoved = false;
  dragDistance = 0;
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
    dragDistance += Math.hypot(dx, dy);
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
  if (dragMoved) {
    const intensity = THREE.MathUtils.clamp(1 + dragDistance / 120, 1.25, 2.4);
    makeBurst(intensity);
  } else {
    makeBurst(1);
  }
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