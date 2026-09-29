import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const canvas = document.getElementById('logoCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
camera.position.set(0, 0.02, 11.4);

const root = new THREE.Group();
scene.add(root);

const ambient = new THREE.AmbientLight(0x9fa9b8, 1.45);
scene.add(ambient);

const key = new THREE.PointLight(0xffffff, 18, 24, 1.7);
key.position.set(1.8, 4.2, 6);
scene.add(key);

const rimBlue = new THREE.PointLight(0x00a5e5, 10, 19, 2);
rimBlue.position.set(-4.6, -1.6, 3);
scene.add(rimBlue);

const rimPink = new THREE.PointLight(0xec008c, 9, 19, 2);
rimPink.position.set(4.8, 0.6, 2.4);
scene.add(rimPink);

const COLORS = {
  goggle: '#B7B9BC',
  red: '#FF2026',
  yellow: '#FFEC00',
  blue: '#00A5E5',
  magenta: '#EC008C'
};

const burstColors = [COLORS.red, COLORS.yellow, COLORS.blue, COLORS.magenta];

const variants = {
  original: {
    label: 'Original',
    radius: 0.055,
    radialSegments: 8,
    emissive: 0.015,
    roughness: 0.62,
    metalness: 0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.5,
    zJitter: 0.003,
    float: 0.008,
    spring: 0.04,
    visorOpacity: 0,
    lightBoost: 0.72
  },
  modern: {
    label: 'Modern 3D',
    radius: 0.070,
    radialSegments: 10,
    emissive: 0.16,
    roughness: 0.27,
    metalness: 0.02,
    clearcoat: 0.90,
    clearcoatRoughness: 0.12,
    zJitter: 0.010,
    float: 0.017,
    spring: 0.055,
    visorOpacity: 0.07,
    lightBoost: 0.96,
    strokeFlatten: 0.44
  },
  n64: {
    label: 'N64',
    radius: 0.108,
    radialSegments: 9,
    emissive: 0.26,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.52,
    clearcoatRoughness: 0.18,
    zJitter: 0.042,
    float: 0.050,
    spring: 0.15,
    visorOpacity: 0.16,
    lightBoost: 1.22
  }
};

const logoGroup = new THREE.Group();
root.add(logoGroup);

let currentVariant = 'modern';
let materialRecords = [];
let animatedMeshes = [];
let burstParticles = [];

let depthScale = 1;
let autoMotion = true;
let glowEnabled = true;
let dragging = false;
let dragMoved = false;
let dragDistance = 0;
let lastX = 0;
let lastY = 0;
let targetRotX = -0.035;
let targetRotY = 0;
let zoomTarget = 11.4;
let baseScale = 1;
let burstScale = 1;

const paths = {
  goggles: [
    [-4.46, .42, 0], [-4.43, .58, 0], [-4.34, .70, 0], [-4.18, .79, 0],
    [-3.94, .84, 0], [-3.62, .86, 0], [-3.24, .86, 0], [-2.82, .86, 0],
    [-2.39, .86, 0], [-2.08, .81, 0], [-1.88, .71, 0], [-1.79, .55, 0],
    [-1.76, .31, 0], [-1.76, .02, 0], [-1.79, -.23, 0], [-1.89, -.39, 0],
    [-2.07, -.50, 0], [-2.31, -.55, 0], [-2.56, -.52, 0], [-2.76, -.42, 0],
    [-2.92, -.27, 0], [-3.05, -.10, 0], [-3.15, .00, 0], [-3.25, .00, 0],
    [-3.37, -.11, 0], [-3.51, -.28, 0], [-3.69, -.43, 0], [-3.90, -.51, 0],
    [-4.12, -.52, 0], [-4.31, -.45, 0], [-4.43, -.31, 0], [-4.49, -.12, 0],
    [-4.50, .10, 0], [-4.49, .28, 0]
  ],
  three: [
    [-1.58, .72, 0], [-1.30, .64, 0], [-1.02, .62, 0], [-.72, .68, 0],
    [-.49, .76, 0], [-.34, .72, 0], [-.26, .58, 0], [-.27, .39, 0],
    [-.36, .22, 0], [-.52, .08, 0], [-.72, -.03, 0], [-.91, -.10, 0],
    [-1.08, -.05, 0], [-1.22, .02, 0], [-1.31, -.04, 0], [-1.26, -.14, 0],
    [-1.10, -.20, 0], [-.94, -.17, 0], [-.80, -.10, 0], [-.66, -.16, 0],
    [-.50, -.31, 0], [-.38, -.52, 0], [-.35, -.74, 0], [-.43, -.92, 0],
    [-.60, -1.05, 0], [-.83, -1.11, 0], [-1.08, -1.08, 0], [-1.34, -.98, 0],
    [-1.53, -.84, 0]
  ],
  d: [
    [.08, .76, 0], [.08, .46, 0], [.08, .08, 0], [.08, -.33, 0],
    [.09, -.73, 0], [.14, -.91, 0], [.34, -.97, 0], [.61, -.96, 0],
    [.87, -.86, 0], [1.08, -.69, 0], [1.23, -.46, 0], [1.31, -.18, 0],
    [1.29, .10, 0], [1.18, .34, 0], [.99, .54, 0], [.75, .69, 0],
    [.48, .80, 0], [.25, .84, 0], [.08, .76, 0]
  ],
  v: [
    [1.47, .80, 0], [1.59, .46, 0], [1.73, .09, 0], [1.87, -.30, 0],
    [2.01, -.68, 0], [2.13, -.92, 0], [2.23, -.98, 0], [2.33, -.92, 0],
    [2.47, -.63, 0], [2.62, -.22, 0], [2.77, .20, 0], [2.91, .61, 0],
    [2.98, .81, 0]
  ],
  rStem: [
    [3.16, -.94, 0], [3.16, -.52, 0], [3.16, -.10, 0], [3.16, .34, 0], [3.16, .78, 0]
  ],
  rLoop: [
    [3.16, .78, 0], [3.44, .84, 0], [3.71, .83, 0], [3.93, .72, 0],
    [4.02, .54, 0], [4.00, .34, 0], [3.87, .18, 0], [3.66, .10, 0],
    [3.42, .10, 0], [3.17, .20, 0]
  ],
  rLeg: [
    [3.58, .10, 0], [3.68, -.17, 0], [3.83, -.45, 0], [4.02, -.76, 0], [4.13, -.93, 0]
  ]
};

function disposeLogo() {
  materialRecords = [];
  animatedMeshes = [];
  while (logoGroup.children.length) {
    const child = logoGroup.children.pop();
    child.traverse?.((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(mat => mat.dispose());
      }
    });
  }
}

function makeMaterial(color, config, glowMultiplier = 1) {
  const c = new THREE.Color(color);
  const material = new THREE.MeshPhysicalMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: glowEnabled ? config.emissive * glowMultiplier : 0,
    roughness: config.roughness,
    metalness: config.metalness,
    clearcoat: config.clearcoat,
    clearcoatRoughness: config.clearcoatRoughness
  });
  materialRecords.push({ material, baseGlow: config.emissive * glowMultiplier });
  return material;
}

function pointWithDepth(point, index, config) {
  return new THREE.Vector3(
    point[0],
    point[1],
    point[2] + Math.sin(point[0] * 2.1 + point[1] * 1.7 + index) * config.zJitter
  );
}

function addTube(points, color, radius, config, options = {}) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p, i) => pointWithDepth(p, i, config)),
    Boolean(options.closed),
    options.curveType || 'catmullrom',
    options.tension ?? 0.34
  );
  const geometry = new THREE.TubeGeometry(
    curve,
    Math.max(48, points.length * 12),
    radius,
    config.radialSegments,
    Boolean(options.closed)
  );
  const mesh = new THREE.Mesh(geometry, makeMaterial(color, config, options.glowMultiplier ?? 1));
  if (currentVariant === 'modern' && options.writing) {
    mesh.scale.z = config.strokeFlatten ?? 0.44;
  }
  mesh.userData.basePosition = mesh.position.clone();
  mesh.userData.floatPhase = animatedMeshes.length * 0.67;
  animatedMeshes.push(mesh);
  logoGroup.add(mesh);
  return mesh;
}

function addVisor(config) {
  if (config.visorOpacity <= 0) return;
  const shape = new THREE.Shape();
  const pts = paths.goggles;
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x071018,
    transparent: true,
    opacity: config.visorOpacity,
    roughness: .12,
    metalness: .02,
    clearcoat: .8,
    clearcoatRoughness: .1,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const visor = new THREE.Mesh(geometry, material);
  visor.position.z = -0.035;
  logoGroup.add(visor);
}

function buildLogo() {
  disposeLogo();
  const config = variants[currentVariant];

  addVisor(config);
  addTube(paths.goggles, COLORS.goggle, config.radius * .90, config, {
    closed: true,
    glowMultiplier: .34,
    curveType: 'centripetal'
  });
  addTube(paths.three, COLORS.red, config.radius, config, { writing: true });
  addTube(paths.d, COLORS.yellow, config.radius, config, { closed: true, writing: true, curveType: 'centripetal' });
  addTube(paths.v, COLORS.blue, config.radius, config, { writing: true });
  addTube(paths.rStem, COLORS.magenta, config.radius, config, { writing: true });
  addTube(paths.rLoop, COLORS.magenta, config.radius, config, { writing: true });
  addTube(paths.rLeg, COLORS.magenta, config.radius, config, { writing: true });

  rimBlue.intensity = 10 * config.lightBoost;
  rimPink.intensity = 9 * config.lightBoost;
  key.intensity = 18 * (.86 + config.lightBoost * .14);
}

function setVariant(name, burst = true) {
  if (!variants[name]) return;
  currentVariant = name;
  document.documentElement.dataset.variant = name;

  document.querySelectorAll('.variant-card').forEach(button => {
    const active = button.dataset.variant === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  buildLogo();
  if (burst) makeBurst(name === 'n64' ? 1.25 : .85);
}

function addSparkField() {
  const count = 115;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - .5) * 12;
    positions[i * 3 + 1] = (Math.random() - .5) * 6.5;
    positions[i * 3 + 2] = -1 - Math.random() * 5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x728092,
    size: .026,
    transparent: true,
    opacity: .42
  });
  scene.add(new THREE.Points(geometry, material));
}

function makeBurst(multiplier = 1) {
  const countBase = currentVariant === 'n64' ? 42 : currentVariant === 'modern' ? 34 : 27;
  for (let i = 0; i < Math.floor(countBase * multiplier); i++) {
    const geometry = new THREE.SphereGeometry(.028 + Math.random() * .040, 8, 8);
    const color = burstColors[i % burstColors.length];
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const particle = new THREE.Mesh(geometry, material);
    particle.position.set((Math.random() - .5) * .42, (Math.random() - .5) * .30, .38);
    const angle = Math.random() * Math.PI * 2;
    const speed = (.030 + Math.random() * .060) * multiplier;
    particle.userData.v = new THREE.Vector3(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      (Math.random() - .34) * .045 * multiplier
    );
    particle.userData.life = 1;
    scene.add(particle);
    burstParticles.push(particle);
  }
  burstScale = Math.max(burstScale, 1.045 + (multiplier - 1) * .055);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  baseScale = rect.width < 640 ? .71 : .92;
  root.position.y = rect.width < 640 ? .18 : .08;
}

addSparkField();
buildLogo();
resize();

window.addEventListener('resize', resize);

document.querySelectorAll('.variant-card').forEach(button => {
  button.addEventListener('click', () => setVariant(button.dataset.variant));
});

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
    targetRotY = nx * .16;
    targetRotX = -.035 + ny * .075;
  }
});

canvas.addEventListener('pointerup', (event) => {
  dragging = false;
  if (dragMoved) {
    const intensity = THREE.MathUtils.clamp(1 + dragDistance / 125, 1.22, 2.35);
    makeBurst(intensity);
  } else {
    makeBurst(1);
  }
  canvas.releasePointerCapture?.(event.pointerId);
});

canvas.addEventListener('pointercancel', () => { dragging = false; });

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomTarget = THREE.MathUtils.clamp(zoomTarget + event.deltaY * .006, 8.6, 14.5);
}, { passive: false });

document.getElementById('burstButton').addEventListener('click', () => makeBurst(1.15));

document.getElementById('motionToggle').addEventListener('change', (event) => {
  autoMotion = event.target.checked;
});

document.getElementById('glowToggle').addEventListener('change', (event) => {
  glowEnabled = event.target.checked;
  materialRecords.forEach(({ material, baseGlow }) => {
    material.emissiveIntensity = glowEnabled ? baseGlow : 0;
  });
});

document.getElementById('depthRange').addEventListener('input', (event) => {
  depthScale = Number(event.target.value);
});

document.getElementById('resetButton').addEventListener('click', () => {
  targetRotX = -.035;
  targetRotY = 0;
  zoomTarget = 11.4;
  depthScale = 1;
  burstScale = 1;
  document.getElementById('depthRange').value = '1';
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const config = variants[currentVariant];

  root.rotation.x += (targetRotX - root.rotation.x) * .055;
  root.rotation.y += (targetRotY - root.rotation.y) * .055;

  if (autoMotion && !dragging) {
    root.rotation.z = Math.sin(t * .43) * config.spring * (currentVariant === 'modern' ? .055 : .10);
    root.position.z = Math.sin(t * .72) * config.float * depthScale;
  } else {
    root.rotation.z *= .92;
  }

  animatedMeshes.forEach((mesh, index) => {
    if (!autoMotion || dragging) {
      mesh.position.z *= .90;
      return;
    }
    const strength =
      currentVariant === 'original' ? .002 :
      currentVariant === 'modern' ? config.float * .72 :
      config.float;
    mesh.position.z = Math.sin(t * (1.05 + config.spring) + mesh.userData.floatPhase) * strength * depthScale;
    if (currentVariant === 'n64') {
      mesh.rotation.z = Math.sin(t * 1.35 + index * .72) * .006;
    } else {
      mesh.rotation.z *= .88;
    }
  });

  camera.position.z += (zoomTarget - camera.position.z) * .08;

  burstScale += (1 - burstScale) * .09;
  const scale = baseScale * burstScale;
  root.scale.setScalar(scale);

  for (let i = burstParticles.length - 1; i >= 0; i--) {
    const particle = burstParticles[i];
    particle.position.add(particle.userData.v);
    particle.userData.v.multiplyScalar(.984);
    particle.userData.life -= .018;
    particle.material.opacity = Math.max(0, particle.userData.life);
    particle.scale.setScalar(.72 + particle.userData.life * .58);

    if (particle.userData.life <= 0) {
      scene.remove(particle);
      particle.geometry.dispose();
      particle.material.dispose();
      burstParticles.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}

animate();