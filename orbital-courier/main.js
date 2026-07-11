const THREE = globalThis.THREE;

const PLANET_RADIUS = 32;
const SURFACE_OFFSET = 1.35;
const RUN_LENGTH_SECONDS = 150;
const PICKUP_RADIUS = 3.2;
const DROPOFF_RADIUS = 3.4;
const DETAIL_SCALE = PLANET_RADIUS / 18;

const locations = [
  { name: 'Olive Market', lat: 34, lon: -18 },
  { name: 'Harbor Steps', lat: 12, lon: 58 },
  { name: 'Sun Kiln', lat: -18, lon: 132 },
  { name: 'North Garden', lat: 53, lon: 96 },
  { name: 'Blue Gate', lat: -42, lon: -82 },
  { name: 'Terrace Loop', lat: 8, lon: -138 },
  { name: 'Hill Studio', lat: 61, lon: -146 },
  { name: 'Dune Station', lat: -9, lon: 12 },
  { name: 'Glass Orchard', lat: 28, lon: -104 },
  { name: 'Relay Shrine', lat: -55, lon: 28 },
  { name: 'Copper Pier', lat: -32, lon: 168 },
  { name: 'Cloud Mill', lat: 46, lon: -62 },
].map((location) => ({
  ...location,
  normal: normalFromLatLon(location.lat, location.lon),
}));

const signalLines = [
  'Market ping',
  'Harbor wave',
  'Studio ready',
  'Terrace bell',
  'Garden hello',
  'Blue Gate sync',
  'Dune check',
  'Kiln route',
];

const state = {
  phase: 'ready',
  deliveries: 0,
  carrying: false,
  timeLeft: RUN_LENGTH_SECONDS,
  route: null,
  routeIndex: 0,
  boostTime: 0,
  pulseCooldown: 0,
  lastTime: 0,
};

const input = {
  x: 0,
  y: 0,
  keys: new Set(),
  pointerId: null,
  touchVector: { x: 0, y: 0 },
};

const dom = {
  canvas: document.getElementById('game-canvas'),
  deliveries: document.getElementById('deliveries-count'),
  time: document.getElementById('time-left'),
  load: document.getElementById('load-state'),
  routeText: document.getElementById('route-text'),
  targetArrow: document.getElementById('target-arrow'),
  targetDistance: document.getElementById('target-distance'),
  instruction: document.getElementById('instruction-text'),
  start: document.getElementById('start-button'),
  introStart: document.getElementById('intro-start-button'),
  pause: document.getElementById('pause-button'),
  reset: document.getElementById('reset-button'),
  boost: document.getElementById('boost-button'),
  intro: document.getElementById('intro-panel'),
  touchPad: document.querySelector('[data-touch-pad]'),
  touchNub: document.querySelector('[data-touch-nub]'),
  menuToggle: document.getElementById('menu-toggle'),
  gameNav: document.getElementById('game-nav'),
  signals: [
    document.getElementById('signal-one'),
    document.getElementById('signal-two'),
    document.getElementById('signal-three'),
  ],
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xf0dfbd, 0.006);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 320);
let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas: dom.canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
} catch (error) {
  renderer = createCanvasFallbackRenderer(dom.canvas);
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xf0dfbd);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;

const tempNormal = new THREE.Vector3(0.2, 0.94, 0.28).normalize();
const player = createCourier();
const planet = createPlanet();
const markerGroup = new THREE.Group();
const villageGroup = new THREE.Group();
const orbitGroup = new THREE.Group();
const pickupMarker = createBeacon(0x2f6f56, 'pickup');
const dropoffMarker = createBeacon(0xd7a640, 'dropoff');
const tempVector = new THREE.Vector3();
const tempEast = new THREE.Vector3();
const tempNorth = new THREE.Vector3();
const tempMove = new THREE.Vector3();
const tempTarget = new THREE.Vector3();
const heading = new THREE.Vector3(1, 0, 0);

scene.add(planet, markerGroup, villageGroup, orbitGroup, player.group);
markerGroup.add(pickupMarker, dropoffMarker);
createVillages();
createOrbitSignals();
setupLights();
spawnRoute();
placePlayer(tempNormal);
updateHud();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalFromLatLon(lat, lon) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize();
}

function createPlanet() {
  const group = new THREE.Group();
  const planetGeometry = new THREE.SphereGeometry(PLANET_RADIUS, 96, 64);
  const planetMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9904e,
    roughness: 0.9,
    metalness: 0.02,
  });
  const sphere = new THREE.Mesh(planetGeometry, planetMaterial);
  group.add(sphere);

  const seaMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a9ca1,
    roughness: 0.6,
    metalness: 0.03,
    transparent: true,
    opacity: 0.9,
  });
  [
    { lat: 18, lon: -42, scale: [4.8, 0.1, 2.9] },
    { lat: -24, lon: 58, scale: [5.8, 0.1, 2.6] },
    { lat: 43, lon: 142, scale: [3.7, 0.1, 2.2] },
    { lat: -48, lon: -132, scale: [4.2, 0.1, 2.3] },
    { lat: 2, lon: -168, scale: [3.9, 0.1, 1.8] },
    { lat: 58, lon: 8, scale: [3.2, 0.1, 1.9] },
  ].forEach((patch) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 36), seaMaterial);
    mesh.scale.set(...patch.scale);
    placeSurfaceObject(mesh, normalFromLatLon(patch.lat, patch.lon), 0.04, 'z');
    group.add(mesh);
  });

  const pathMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5e5b5,
    roughness: 0.92,
    metalness: 0,
  });
  for (let index = 0; index < 16; index += 1) {
    const lon = index * 23 - 172;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 4.2), pathMaterial);
    mesh.rotation.y = index * 0.4;
    placeSurfaceObject(mesh, normalFromLatLon(index % 2 ? 14 : -8, lon), 0.06);
    group.add(mesh);
  }

  return group;
}

function createCourier() {
  const group = new THREE.Group();
  const tunic = new THREE.MeshStandardMaterial({ color: 0xfff4d2, roughness: 0.46, metalness: 0.04 });
  const satchel = new THREE.MeshStandardMaterial({ color: 0xbd6146, roughness: 0.58, metalness: 0.02 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x4a9ca1,
    emissive: 0x4a9ca1,
    emissiveIntensity: 0.48,
    roughness: 0.38,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.86, 18), tunic);
  body.position.y = 0.58;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), tunic);
  head.position.y = 1.19;
  group.add(head);

  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.18), satchel);
  bag.position.set(0.31, 0.61, 0.08);
  group.add(bag);

  const signal = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), glow);
  signal.position.set(-0.24, 1.38, 0);
  group.add(signal);

  group.scale.setScalar(1.05);
  return {
    group,
    normal: tempNormal.clone(),
    speed: 13.2,
  };
}

function createBeacon(color, mode) {
  const group = new THREE.Group();
  group.userData.mode = mode;

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.46,
    roughness: 0.3,
  });
  const paleMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff8e8,
    roughness: 0.62,
  });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 16), paleMaterial);
  pole.position.y = 0.58;
  group.add(pole);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), material);
  lamp.position.y = 1.22;
  group.add(lamp);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.025, 10, 48), material);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);

  group.scale.setScalar(1.18);
  return group;
}

function createVillages() {
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xbd6146, roughness: 0.66 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffedc7, roughness: 0.74 });

  locations.forEach((location, index) => {
    const house = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.34, 0.48), wallMaterial);
    base.position.y = 0.22;
    house.add(base);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.43, 0.34, 4), roofMaterial);
    roof.position.y = 0.58;
    roof.rotation.y = Math.PI / 4;
    house.add(roof);

    house.scale.setScalar((index % 3 === 0 ? 1.08 : 0.92) * DETAIL_SCALE);
    placeSurfaceObject(house, location.normal, 0.08);
    villageGroup.add(house);
  });
}

function createOrbitSignals() {
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7a640,
    emissive: 0xd7a640,
    emissiveIntensity: 0.28,
    roughness: 0.32,
  });
  const mossMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f6f56,
    emissive: 0x2f6f56,
    emissiveIntensity: 0.22,
    roughness: 0.42,
  });

  for (let index = 0; index < 18; index += 1) {
    const pip = new THREE.Mesh(new THREE.SphereGeometry(index % 4 === 0 ? 0.18 : 0.12, 14, 10), index % 2 ? goldMaterial : mossMaterial);
    const angle = index / 18 * Math.PI * 2;
    pip.position.set(
      Math.cos(angle) * (PLANET_RADIUS + 10),
      Math.sin(index * 1.7) * 4.2,
      Math.sin(angle) * (PLANET_RADIUS + 10),
    );
    orbitGroup.add(pip);
  }
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xfff2ce, 0x49746e, 0.92));

  const sun = new THREE.DirectionalLight(0xfff7dc, 1.18);
  sun.position.set(26, 34, 18);
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x8ec7be, 0.72);
  rim.position.set(-30, 12, -20);
  scene.add(rim);
}

function placeSurfaceObject(object, normal, offset = 0, alignAxis = 'y') {
  object.position.copy(normal).multiplyScalar(PLANET_RADIUS + offset);
  const sourceAxis = alignAxis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  object.quaternion.setFromUnitVectors(sourceAxis, normal);
}

function placePlayer(normal) {
  player.normal.copy(normal).normalize();
  player.group.position.copy(player.normal).multiplyScalar(PLANET_RADIUS + SURFACE_OFFSET);
  player.group.up.copy(player.normal);
  player.group.lookAt(player.group.position.clone().add(heading));
}

function spawnRoute() {
  const pickup = locations[state.routeIndex % locations.length];
  let dropoff = locations[(state.routeIndex * 3 + 4) % locations.length];

  if (pickup === dropoff) {
    dropoff = locations[(state.routeIndex + 1) % locations.length];
  }

  state.route = { pickup, dropoff };
  state.carrying = false;
  placeSurfaceObject(pickupMarker, pickup.normal, 0.08);
  placeSurfaceObject(dropoffMarker, dropoff.normal, 0.08);
  pickupMarker.visible = true;
  dropoffMarker.visible = false;
  updateSignals();
  updateHud();
}

function updateSignals() {
  dom.signals.forEach((element, index) => {
    element.textContent = signalLines[(state.routeIndex + index) % signalLines.length];
  });
}

function startRun() {
  if (state.phase === 'playing') {
    return;
  }

  if (state.phase === 'complete') {
    resetRun();
  }

  state.phase = 'playing';
  dom.intro.hidden = true;
  dom.start.textContent = 'Running';
  dom.pause.textContent = 'Pause';
  dom.instruction.textContent = state.carrying ? 'Parcel onboard. Find the gold drop-off beacon.' : 'Find the green pickup beacon.';
}

function pauseRun() {
  if (state.phase === 'playing') {
    state.phase = 'paused';
    dom.pause.textContent = 'Resume';
    dom.instruction.textContent = 'Paused. Resume when ready.';
    return;
  }

  if (state.phase === 'paused') {
    startRun();
  }
}

function resetRun() {
  state.phase = 'ready';
  state.deliveries = 0;
  state.timeLeft = RUN_LENGTH_SECONDS;
  state.routeIndex = 0;
  state.boostTime = 0;
  state.pulseCooldown = 0;
  dom.intro.hidden = false;
  dom.intro.querySelector('h2').textContent = 'Carry signal parcels across the open planet before the route window closes.';
  dom.intro.querySelector('p').textContent = 'Move with WASD, arrows, or the touch stick. Get close to the green pickup beacon, then carry the parcel to the gold drop-off beacon.';
  dom.introStart.textContent = 'Start Route';
  dom.start.textContent = 'Start Route';
  dom.pause.textContent = 'Pause';
  dom.instruction.textContent = 'Start a route, then steer toward the glowing pickup.';
  placePlayer(new THREE.Vector3(0.2, 0.94, 0.28).normalize());
  spawnRoute();
  updateHud();
}

function completeRun() {
  state.phase = 'complete';
  dom.intro.hidden = false;
  dom.intro.querySelector('h2').textContent = `Route window complete: ${state.deliveries} deliveries logged.`;
  dom.intro.querySelector('p').textContent = 'Reset or start again to roll a new neighborhood run.';
  dom.introStart.textContent = 'Run Again';
  dom.start.textContent = 'Start Route';
  dom.pause.textContent = 'Pause';
  dom.instruction.textContent = 'Run complete. Start again for another delivery window.';
}

function updateHud() {
  dom.deliveries.textContent = String(state.deliveries);
  dom.time.textContent = formatTime(state.timeLeft);
  dom.load.textContent = state.carrying ? 'Parcel' : 'Empty';

  if (!state.route) {
    return;
  }

  const action = state.carrying ? 'Drop off at' : 'Pick up at';
  const target = state.carrying ? state.route.dropoff.name : state.route.pickup.name;
  const other = state.carrying ? state.route.pickup.name : state.route.dropoff.name;
  dom.routeText.textContent = `${action} ${target}. Route pair: ${state.route.pickup.name} to ${state.route.dropoff.name}.`;
  updateRouteGuide();
  dom.instruction.textContent = state.carrying
    ? `Parcel from ${other} onboard. Head to the gold beacon.`
    : `Head to the green beacon at ${target}.`;
}

function getRouteTarget() {
  if (!state.route) {
    return null;
  }

  return state.carrying ? state.route.dropoff : state.route.pickup;
}

function updateRouteGuide() {
  const target = getRouteTarget();
  if (!target) {
    dom.targetDistance.textContent = 'Choose a route';
    dom.targetArrow.style.transform = 'rotate(0rad)';
    return;
  }

  const distance = surfaceDistance(player.normal, target.normal);
  tempTarget.copy(target.normal).addScaledVector(player.normal, -target.normal.dot(player.normal));

  if (tempTarget.lengthSq() > 0.0001) {
    tempTarget.normalize();
    const worldUp = Math.abs(player.normal.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    tempEast.crossVectors(worldUp, player.normal).normalize();
    tempNorth.crossVectors(player.normal, tempEast).normalize();
    const angle = Math.atan2(tempTarget.dot(tempEast), tempTarget.dot(tempNorth));
    dom.targetArrow.style.transform = `rotate(${angle}rad)`;
  }

  dom.targetDistance.textContent = distance < 4
    ? 'Beacon in range'
    : `${Math.round(distance)}m to ${target.name}`;
}

function formatTime(value) {
  const safe = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updatePlayer(delta) {
  const move = getMoveVector();
  const worldUp = Math.abs(player.normal.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  tempEast.crossVectors(worldUp, player.normal).normalize();
  tempNorth.crossVectors(player.normal, tempEast).normalize();
  tempMove.set(0, 0, 0)
    .addScaledVector(tempEast, move.x)
    .addScaledVector(tempNorth, move.y);

  const length = tempMove.length();
  if (length > 0.001) {
    tempMove.normalize();
    heading.copy(tempMove);
    const speed = player.speed * (state.boostTime > 0 ? 1.55 : 1);
    player.normal.addScaledVector(tempMove, delta * speed / PLANET_RADIUS).normalize();
  }

  placePlayer(player.normal);
}

function getMoveVector() {
  const keyboardX = Number(input.keys.has('ArrowRight') || input.keys.has('KeyD')) - Number(input.keys.has('ArrowLeft') || input.keys.has('KeyA'));
  const keyboardY = Number(input.keys.has('ArrowUp') || input.keys.has('KeyW')) - Number(input.keys.has('ArrowDown') || input.keys.has('KeyS'));
  const x = clamp(keyboardX + input.touchVector.x, -1, 1);
  const y = clamp(keyboardY - input.touchVector.y, -1, 1);
  const magnitude = Math.hypot(x, y);

  if (magnitude > 1) {
    return { x: x / magnitude, y: y / magnitude };
  }

  return { x, y };
}

function updateRouteProgress() {
  if (!state.route || state.phase !== 'playing') {
    return;
  }

  if (!state.carrying) {
    const pickupDistance = surfaceDistance(player.normal, state.route.pickup.normal);
    if (pickupDistance < PICKUP_RADIUS) {
      state.carrying = true;
      pickupMarker.visible = false;
      dropoffMarker.visible = true;
      dom.instruction.textContent = 'Parcel loaded. Follow the gold beacon to deliver.';
      updateHud();
    }
    return;
  }

  const dropoffDistance = surfaceDistance(player.normal, state.route.dropoff.normal);
  if (dropoffDistance < DROPOFF_RADIUS) {
    state.deliveries += 1;
    state.routeIndex += 1;
    state.timeLeft = Math.min(RUN_LENGTH_SECONDS, state.timeLeft + 12);
    dom.instruction.textContent = 'Delivered. A new route is live.';
    spawnRoute();
    updateHud();
  }
}

function surfaceDistance(a, b) {
  return Math.acos(clamp(a.dot(b), -1, 1)) * PLANET_RADIUS;
}

function updateMarkers(time) {
  const pickupScale = 1 + Math.sin(time * 4.2) * 0.08;
  const dropoffScale = 1 + Math.sin(time * 3.4 + 1.2) * 0.08;
  pickupMarker.scale.setScalar(pickupScale);
  dropoffMarker.scale.setScalar(dropoffScale);
  pickupMarker.rotation.y += 0.018;
  dropoffMarker.rotation.y -= 0.016;
}

function updateCamera(delta) {
  const cameraNormal = player.normal.clone().multiplyScalar(PLANET_RADIUS + 82);
  const cameraBack = heading.clone().multiplyScalar(-24);
  const targetPosition = cameraNormal.add(cameraBack).add(player.normal.clone().multiplyScalar(5));
  const lookTarget = player.group.position.clone().add(heading.clone().multiplyScalar(7));
  camera.position.lerp(targetPosition, 1 - Math.pow(0.001, delta));
  camera.lookAt(lookTarget);
}

function updateRun(delta) {
  if (state.phase !== 'playing') {
    return;
  }

  state.timeLeft -= delta;
  state.boostTime = Math.max(0, state.boostTime - delta);
  state.pulseCooldown = Math.max(0, state.pulseCooldown - delta);

  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    updateHud();
    completeRun();
    return;
  }

  updatePlayer(delta);
  updateRouteProgress();
  updateHud();
}

function pulseBoost() {
  if (state.phase !== 'playing' || state.pulseCooldown > 0) {
    return;
  }

  state.boostTime = 1.15;
  state.pulseCooldown = 2.2;
  dom.instruction.textContent = 'Pulse active.';
}

function animate(time = 0) {
  requestAnimationFrame(animate);
  const now = time * 0.001;
  const delta = clamp(now - state.lastTime, 0, 0.045);
  state.lastTime = now;

  planet.rotation.y += delta * 0.035;
  orbitGroup.rotation.y += delta * 0.22;
  updateMarkers(now);
  updateRun(delta);
  updateCamera(delta || 0.016);
  renderer.render(scene, camera);
}

function attachInput() {
  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }

    if (event.code === 'Space') {
      pulseBoost();
      return;
    }

    if (event.code === 'Enter') {
      startRun();
      return;
    }

    input.keys.add(event.code);
  });

  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
  });

  dom.touchPad.addEventListener('pointerdown', (event) => {
    input.pointerId = event.pointerId;
    dom.touchPad.setPointerCapture(event.pointerId);
    updateTouchVector(event);
  });

  dom.touchPad.addEventListener('pointermove', (event) => {
    if (event.pointerId === input.pointerId) {
      updateTouchVector(event);
    }
  });

  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => {
    dom.touchPad.addEventListener(eventName, () => {
      input.pointerId = null;
      input.touchVector.x = 0;
      input.touchVector.y = 0;
      dom.touchNub.style.transform = 'translate(-50%, -50%)';
    });
  });

  window.addEventListener('resize', resize);
  dom.start.addEventListener('click', startRun);
  dom.introStart.addEventListener('click', startRun);
  dom.pause.addEventListener('click', pauseRun);
  dom.reset.addEventListener('click', resetRun);
  dom.boost.addEventListener('click', pulseBoost);
  dom.menuToggle.addEventListener('click', () => {
    const isOpen = dom.gameNav.classList.toggle('is-open');
    dom.menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

function updateTouchVector(event) {
  const rect = dom.touchPad.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = rect.width * 0.38;
  const x = clamp((event.clientX - centerX) / radius, -1, 1);
  const y = clamp((event.clientY - centerY) / radius, -1, 1);
  const magnitude = Math.hypot(x, y);
  const safeX = magnitude > 1 ? x / magnitude : x;
  const safeY = magnitude > 1 ? y / magnitude : y;

  input.touchVector.x = safeX;
  input.touchVector.y = safeY;
  dom.touchNub.style.transform = `translate(calc(-50% + ${safeX * radius}px), calc(-50% + ${safeY * radius}px))`;
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function createCanvasFallbackRenderer(canvas) {
  const context = canvas.getContext('2d');
  canvas.dataset.webglFallback = 'true';

  return {
    domElement: canvas,
    setPixelRatio() {},
    setClearColor() {},
    setSize(width, height) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.8);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    render() {
      drawFallback(context, canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    },
  };
}

function drawFallback(context, width, height) {
  const time = performance.now() * 0.001;
  context.clearRect(0, 0, width, height);
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#94c7bd');
  sky.addColorStop(0.58, '#f0dfbd');
  sky.addColorStop(1, '#c97955');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const radius = Math.min(width, height) * 0.3;
  const cx = width * 0.5;
  const cy = height * 0.55;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fillStyle = '#d8b56f';
  context.fill();

  context.fillStyle = '#4a9ca1';
  context.beginPath();
  context.ellipse(cx - radius * 0.25, cy - radius * 0.1, radius * 0.26, radius * 0.11, 0.4, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(cx + radius * 0.3, cy + radius * 0.2, radius * 0.32, radius * 0.12, -0.2, 0, Math.PI * 2);
  context.fill();

  const playerAngle = time * 0.8;
  context.fillStyle = '#fff4d2';
  context.beginPath();
  context.arc(cx + Math.cos(playerAngle) * radius * 0.7, cy + Math.sin(playerAngle) * radius * 0.32, 9, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#2f6f56';
  context.beginPath();
  context.arc(cx - radius * 0.5, cy - radius * 0.18, 8, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#d7a640';
  context.beginPath();
  context.arc(cx + radius * 0.48, cy + radius * 0.12, 8, 0, Math.PI * 2);
  context.fill();
}

attachInput();
animate();

window.OrbitalCourier = {
  getState: () => ({
    phase: state.phase,
    deliveries: state.deliveries,
    carrying: state.carrying,
    route: state.route ? {
      pickup: state.route.pickup.name,
      dropoff: state.route.dropoff.name,
    } : null,
  }),
  startRun,
  resetRun,
};
