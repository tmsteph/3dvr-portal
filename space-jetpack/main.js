import { createInputController } from '../jetpack/input.js';

const THREE = globalThis.THREE;

const WORLD = {
  bounds: 72,
  coinCount: 36,
  asteroidCount: 18,
  logoBlockHealth: 2,
};

const state = {
  phase: 'playing',
  score: 0,
  fuel: 100,
  coins: 0,
  asteroids: 0,
  logoBlocks: 0,
  logoDestroyed: 0,
  inputAttached: false,
  shootCooldown: 0,
  laserTimer: 0,
  lastTime: 0,
};

const controls = {
  up: false,
  down: false,
  left: false,
  right: false,
  forward: false,
  back: false,
  lookLeft: false,
  lookRight: false,
  lookUp: false,
  lookDown: false,
};

const dom = {
  loading: document.getElementById('loading'),
  overlay: document.getElementById('overlay'),
  overlayAction: document.getElementById('overlay-action'),
  score: document.getElementById('hud-score'),
  fuel: document.getElementById('hud-fuel'),
  fuelFill: document.getElementById('fuel-meter-fill'),
  coins: document.getElementById('hud-coins'),
  coinFill: document.getElementById('coin-meter-fill'),
  logo: document.getElementById('hud-logo'),
  asteroids: document.getElementById('hud-asteroids'),
  shoot: document.getElementById('shoot-btn'),
  menuToggle: document.getElementById('menu-toggle'),
  gameNav: document.getElementById('game-nav'),
};

const input = createInputController({
  onPauseToggle: () => {
    if (state.phase === 'playing') {
      state.phase = 'paused';
      dom.overlay.hidden = false;
      dom.overlayAction.textContent = 'Resume';
    } else if (state.phase === 'paused') {
      startGame();
    }
  },
});

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020713, 0.012);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);
let renderer;

try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (error) {
  renderer = createCanvasFallbackRenderer();
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x020713);
document.body.prepend(renderer.domElement);

const clock = new THREE.Clock();
const player = createPlayer();
const stars = createStarfield();
const logo = createDestructibleLogo();
const coins = createCoinTrails();
const asteroids = createAsteroids();
const lasers = [];
const tempVector = new THREE.Vector3();
const yawQuaternion = new THREE.Quaternion();

scene.add(stars, logo, player.group, coins.group, asteroids.group);
scene.add(new THREE.HemisphereLight(0x9eefff, 0x080918, 1.55));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(16, 30, 24);
scene.add(keyLight);

const logoLight = new THREE.PointLight(0x65f2ff, 3.2, 140);
logoLight.position.set(0, 10, 18);
scene.add(logoLight);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function createCanvasFallbackRenderer() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.dataset.webglFallback = 'true';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  return {
    domElement: canvas,
    setPixelRatio() {},
    setClearColor() {},
    setSize(width, height) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    render() {
      drawCanvasFallback(context, canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    },
  };
}

function drawCanvasFallback(context, width, height) {
  const time = performance.now() * 0.001;
  context.clearRect(0, 0, width, height);
  const sky = context.createRadialGradient(width * 0.5, height * 0.35, 1, width * 0.5, height * 0.5, Math.max(width, height) * 0.7);
  sky.addColorStop(0, '#123d78');
  sky.addColorStop(0.5, '#04142f');
  sky.addColorStop(1, '#01030a');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 120; index += 1) {
    const x = (Math.sin(index * 17.17) * 0.5 + 0.5) * width;
    const y = (Math.cos(index * 9.41) * 0.5 + 0.5) * height;
    context.fillStyle = index % 7 === 0 ? '#ffffff' : 'rgba(180, 230, 255, 0.7)';
    context.fillRect(x, y, index % 7 === 0 ? 2 : 1, index % 7 === 0 ? 2 : 1);
  }

  context.save();
  context.translate(width * 0.5, height * 0.45 + Math.sin(time) * 6);
  context.font = `900 ${Math.max(48, width * 0.09)}px Trebuchet MS, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = Math.max(4, width * 0.008);
  context.strokeStyle = 'rgba(101, 242, 255, 0.55)';
  context.fillStyle = 'rgba(245, 251, 255, 0.92)';
  context.shadowColor = 'rgba(101, 242, 255, 0.5)';
  context.shadowBlur = 24;
  context.strokeText('3dvr.tech', 0, 0);
  context.fillText('3dvr.tech', 0, 0);
  context.restore();

  for (let index = 0; index < 12; index += 1) {
    const angle = time * 0.5 + index * 0.52;
    const x = width * 0.5 + Math.cos(angle) * width * 0.28;
    const y = height * 0.52 + Math.sin(angle * 1.4) * height * 0.18;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fillStyle = '#ffd76a';
    context.shadowColor = 'rgba(255, 215, 106, 0.55)';
    context.shadowBlur = 14;
    context.fill();
  }

  context.shadowBlur = 0;
  context.fillStyle = 'rgba(245, 251, 255, 0.92)';
  context.beginPath();
  context.arc(width * 0.5, height * 0.72, 13, 0, Math.PI * 2);
  context.fill();
  context.fillRect(width * 0.5 - 8, height * 0.72 + 8, 16, 30);
}

function createPlayer() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.34, metalness: 0.28 });
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: 0x65f2ff,
    emissive: 0x24d7ff,
    emissiveIntensity: 0.8,
    roughness: 0.22,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.35, 18), bodyMaterial);
  group.add(body);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), bodyMaterial);
  helmet.position.set(0, 0.9, 0);
  group.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.12), glowMaterial);
  visor.position.set(0, 0.92, 0.42);
  group.add(visor);

  [-0.28, 0.28].forEach(x => {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.34), glowMaterial);
    pack.position.set(x, -0.06, -0.42);
    group.add(pack);
  });

  group.position.set(0, 5, 38);
  return {
    group,
    velocity: new THREE.Vector3(0, 0, 0),
  };
}

function createStarfield() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(1200 * 3);
  const colors = new Float32Array(1200 * 3);

  for (let index = 0; index < 1200; index += 1) {
    const radius = 90 + Math.random() * 420;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[index * 3 + 1] = Math.cos(phi) * radius;
    positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    colors[index * 3] = 0.6 + Math.random() * 0.4;
    colors[index * 3 + 1] = 0.75 + Math.random() * 0.25;
    colors[index * 3 + 2] = 1;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.9 })
  );
}

function createDestructibleLogo() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x65f2ff,
    emissive: 0x0b8ea4,
    emissiveIntensity: 0.32,
    roughness: 0.34,
    metalness: 0.44,
  });
  const damagedMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd76a,
    emissive: 0xff7d4b,
    emissiveIntensity: 0.62,
    roughness: 0.24,
    metalness: 0.32,
  });
  const geometry = new THREE.BoxGeometry(1.08, 1.08, 0.92);
  const patterns = {
    '3': ['111', '001', '111', '001', '111'],
    d: ['001', '001', '111', '101', '111'],
    v: ['101', '101', '101', '101', '010'],
    r: ['110', '101', '100', '100', '100'],
    '.': ['000', '000', '000', '000', '010'],
    t: ['010', '111', '010', '010', '011'],
    e: ['111', '100', '111', '100', '111'],
    c: ['111', '100', '100', '100', '111'],
    h: ['101', '101', '111', '101', '101'],
  };
  const word = '3dvr.tech';
  let offset = -23;

  [...word].forEach(letter => {
    const rows = patterns[letter];
    rows.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell !== '1') {
          return;
        }

        const cube = new THREE.Mesh(geometry, material.clone());
        cube.position.set(offset + x * 1.25, 7.4 - y * 1.25, -18);
        cube.userData.kind = 'logoBlock';
        cube.userData.health = WORLD.logoBlockHealth;
        cube.userData.fullHealth = WORLD.logoBlockHealth;
        cube.userData.damagedMaterial = damagedMaterial;
        cube.userData.basePosition = cube.position.clone();
        cube.userData.spin = new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4
        );
        group.add(cube);
      });
    });
    offset += letter === '.' ? 2.35 : 4.45;
  });

  state.logoBlocks = group.children.length;
  const logoBounds = new THREE.Box3().setFromObject(group);
  const logoCenter = logoBounds.getCenter(new THREE.Vector3());
  group.children.forEach(block => {
    block.position.x -= logoCenter.x;
    block.userData.basePosition.x -= logoCenter.x;
  });
  group.rotation.y = -0.08;
  return group;
}

function createCoinTrails() {
  const group = new THREE.Group();
  const coinMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd76a,
    emissive: 0xffaa2c,
    emissiveIntensity: 0.6,
    roughness: 0.22,
    metalness: 0.42,
  });
  const geometry = new THREE.TorusGeometry(0.54, 0.15, 8, 24);

  for (let index = 0; index < WORLD.coinCount; index += 1) {
    const lane = index % 3;
    const step = Math.floor(index / 3);
    const coin = new THREE.Mesh(geometry, coinMaterial);
    const angle = step * 0.52 + lane * 2.05;
    coin.position.set(Math.cos(angle) * (15 + lane * 5), 5 + Math.sin(step * 0.8) * 8, 24 - step * 5.4);
    coin.rotation.y = Math.PI / 2;
    coin.userData.kind = 'coin';
    coin.userData.phase = index * 0.42;
    group.add(coin);
  }

  return { group };
}

function createAsteroids() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x6b7280,
    roughness: 0.9,
    metalness: 0.08,
  });

  for (let index = 0; index < WORLD.asteroidCount; index += 1) {
    const asteroid = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + Math.random() * 1.2, 1), material.clone());
    asteroid.position.set((Math.random() - 0.5) * 78, -4 + Math.random() * 28, -56 + Math.random() * 110);
    asteroid.scale.setScalar(0.8 + Math.random() * 1.4);
    asteroid.userData.kind = 'asteroid';
    asteroid.userData.health = asteroid.scale.x > 1.5 ? 2 : 1;
    asteroid.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 2.2);
    asteroid.userData.spin = new THREE.Vector3(Math.random() * 0.8, Math.random() * 0.8, Math.random() * 0.8);
    group.add(asteroid);
  }

  return { group };
}

function startGame() {
  state.phase = 'playing';
  if (dom.overlay) {
    dom.overlay.hidden = true;
  }
  if (!state.inputAttached) {
    input.attach();
    state.inputAttached = true;
  }
}

function updateHud() {
  const logoHealth = state.logoBlocks ? Math.round(((state.logoBlocks - state.logoDestroyed) / state.logoBlocks) * 100) : 0;
  dom.score.textContent = String(state.score);
  dom.fuel.textContent = `${Math.round(state.fuel)}%`;
  dom.fuelFill.style.width = `${state.fuel}%`;
  dom.coins.textContent = `${state.coins}/${WORLD.coinCount}`;
  dom.coinFill.style.width = `${(state.coins / WORLD.coinCount) * 100}%`;
  dom.logo.textContent = `${logoHealth}%`;
  dom.asteroids.textContent = String(state.asteroids);
}

function shootLaser() {
  if (state.phase !== 'playing' || state.shootCooldown > 0) {
    return;
  }

  state.shootCooldown = 0.18;
  const origin = player.group.position.clone().add(new THREE.Vector3(1.1, 0.1, 0));
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(player.group.quaternion).normalize();
  const raycaster = new THREE.Raycaster(origin, direction, 0, 110);
  const targets = [...asteroids.group.children, ...logo.children].filter(target => target.visible);
  const hits = raycaster.intersectObjects(targets, false);

  const laser = createLaser(origin, direction, hits[0]?.distance || 46);
  scene.add(laser);
  lasers.push(laser);

  if (hits[0]) {
    damageTarget(hits[0].object);
  }
}

function createLaser(origin, direction, distance) {
  const geometry = new THREE.CylinderGeometry(0.045, 0.045, distance, 8);
  const material = new THREE.MeshBasicMaterial({ color: 0xff4d7d });
  const laser = new THREE.Mesh(geometry, material);
  laser.position.copy(origin.clone().add(direction.clone().multiplyScalar(distance / 2)));
  laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  laser.userData.life = 0.08;
  return laser;
}

function damageTarget(target) {
  target.userData.health -= 1;

  if (target.userData.kind === 'logoBlock' && target.userData.health === 1) {
    target.material = target.userData.damagedMaterial;
    state.score += 8;
    return;
  }

  if (target.userData.health > 0) {
    state.score += 12;
    return;
  }

  target.visible = false;
  if (target.userData.kind === 'asteroid') {
    state.asteroids += 1;
    state.score += 40;
  }
  if (target.userData.kind === 'logoBlock') {
    state.logoDestroyed += 1;
    state.score += 25;
  }
}

function updatePlayer(delta) {
  const vertical = Number(controls.up) - Number(controls.down);
  const strafe = Number(controls.right) - Number(controls.left);
  const depth = Number(controls.back) - Number(controls.forward);
  const pan = Number(controls.lookLeft) - Number(controls.lookRight);
  const pitch = Number(controls.lookUp) - Number(controls.lookDown);
  const hasMoveInput = Math.abs(vertical) > 0.01 || Math.abs(strafe) > 0.01 || Math.abs(depth) > 0.01;
  const speed = 19;

  player.group.rotation.y += pan * delta * 1.75;
  player.group.rotation.x = clamp(player.group.rotation.x + pitch * delta * 1.15, -0.7, 0.7);
  tempVector.set(strafe * speed, vertical * speed, depth * speed);
  tempVector.multiplyScalar(delta);
  yawQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.group.rotation.y);
  tempVector.applyQuaternion(yawQuaternion);
  if (hasMoveInput) {
    player.velocity.add(tempVector);
  }
  player.velocity.multiplyScalar(0.965);
  player.group.position.add(player.velocity.clone().multiplyScalar(delta * 5.8));
  player.group.position.x = clamp(player.group.position.x, -WORLD.bounds, WORLD.bounds);
  player.group.position.y = clamp(player.group.position.y, -16, WORLD.bounds);
  player.group.position.z = clamp(player.group.position.z, -WORLD.bounds, WORLD.bounds);
  state.fuel = clamp(state.fuel + (hasMoveInput ? -5 : 9) * delta, 0, 100);
}

function updateObjects(delta, elapsed) {
  stars.rotation.y += delta * 0.012;
  logo.rotation.y = Math.sin(elapsed * 0.18) * 0.12;

  logo.children.forEach(block => {
    if (!block.visible) {
      return;
    }
    block.position.y = block.userData.basePosition.y + Math.sin(elapsed * 1.4 + block.userData.basePosition.x) * 0.12;
  });

  coins.group.children.forEach(coin => {
    if (!coin.visible) {
      return;
    }
    coin.rotation.y = elapsed * 2.6 + coin.userData.phase;
    coin.position.y += Math.sin(elapsed * 2 + coin.userData.phase) * 0.003;

    if (coin.position.distanceTo(player.group.position) < 2.2) {
      coin.visible = false;
      state.coins += 1;
      state.score += 15;
      state.fuel = clamp(state.fuel + 5, 0, 100);
    }
  });

  asteroids.group.children.forEach(asteroid => {
    if (!asteroid.visible) {
      return;
    }
    asteroid.position.add(asteroid.userData.velocity.clone().multiplyScalar(delta));
    asteroid.rotation.x += asteroid.userData.spin.x * delta;
    asteroid.rotation.y += asteroid.userData.spin.y * delta;
    asteroid.rotation.z += asteroid.userData.spin.z * delta;

    ['x', 'y', 'z'].forEach(axis => {
      if (Math.abs(asteroid.position[axis]) > WORLD.bounds + 18) {
        asteroid.userData.velocity[axis] *= -1;
      }
    });

    if (asteroid.position.distanceTo(player.group.position) < 2.4) {
      asteroid.visible = false;
      state.fuel = clamp(state.fuel - 18, 0, 100);
      state.score = Math.max(0, state.score - 20);
    }
  });

  lasers.forEach(laser => {
    laser.userData.life -= delta;
    if (laser.userData.life <= 0) {
      laser.visible = false;
      scene.remove(laser);
    }
  });
}

function updateCamera() {
  const cameraOffset = new THREE.Vector3(0, 4.6, 19).applyQuaternion(player.group.quaternion);
  const lookAhead = new THREE.Vector3(0, 0.4, -34).applyQuaternion(player.group.quaternion);
  camera.position.lerp(player.group.position.clone().add(cameraOffset), 0.12);
  camera.lookAt(player.group.position.clone().add(lookAhead));
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  const elapsed = now * 0.001;

  if (state.phase === 'playing') {
    state.shootCooldown = Math.max(0, state.shootCooldown - delta);
    updatePlayer(delta);
    updateObjects(delta, elapsed);
    updateCamera();
    updateHud();
  } else {
    logo.rotation.y = Math.sin(elapsed * 0.24) * 0.14;
    camera.position.lerp(new THREE.Vector3(0, 12, 56), 0.08);
    camera.lookAt(logo.position);
  }

  renderer.render(scene, camera);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', event => {
  const keyMap = {
    KeyW: 'up',
    ArrowUp: 'up',
    KeyS: 'down',
    ArrowDown: 'down',
    KeyA: 'left',
    KeyD: 'right',
    KeyQ: 'back',
    KeyE: 'forward',
    KeyJ: 'lookLeft',
    KeyL: 'lookRight',
    KeyI: 'lookUp',
    KeyK: 'lookDown',
  };
  const control = keyMap[event.code];
  if (control) {
    event.preventDefault();
    controls[control] = true;
  }
  if (event.code === 'Enter' || event.code === 'KeyF') {
    event.preventDefault();
    shootLaser();
  }
});
window.addEventListener('keyup', event => {
  const keyMap = {
    KeyW: 'up',
    ArrowUp: 'up',
    KeyS: 'down',
    ArrowDown: 'down',
    KeyA: 'left',
    KeyD: 'right',
    KeyQ: 'back',
    KeyE: 'forward',
    KeyJ: 'lookLeft',
    KeyL: 'lookRight',
    KeyI: 'lookUp',
    KeyK: 'lookDown',
  };
  const control = keyMap[event.code];
  if (control) {
    event.preventDefault();
    controls[control] = false;
  }
});
document.querySelectorAll('[data-control], [data-look]').forEach(button => {
  const control = button.dataset.control || `look${button.dataset.look[0].toUpperCase()}${button.dataset.look.slice(1)}`;
  const setActive = event => {
    event.preventDefault();
    controls[control] = true;
    button.setPointerCapture?.(event.pointerId);
  };
  const clearActive = event => {
    event.preventDefault();
    controls[control] = false;
  };
  button.addEventListener('pointerdown', setActive);
  button.addEventListener('pointerup', clearActive);
  button.addEventListener('pointercancel', clearActive);
  button.addEventListener('lostpointercapture', clearActive);
});
if (dom.menuToggle && dom.gameNav) {
  dom.menuToggle.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('menu-open');
    dom.menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  dom.gameNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      document.body.classList.remove('menu-open');
      dom.menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}
renderer.domElement.addEventListener('pointerdown', shootLaser);
dom.shoot?.addEventListener('pointerdown', event => {
  event.preventDefault();
  shootLaser();
});
dom.overlayAction?.addEventListener('click', startGame);

document.body.classList.add('ready');
startGame();
updateHud();
resize();
requestAnimationFrame(animate);
