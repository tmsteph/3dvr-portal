import { createInputController } from './input.js';
import { createUI } from './ui.js';
import {
  addFuel,
  applyDamage,
  clamp,
  computeForwardSpeed,
  computeProgress,
  consumeFuel,
  createTrackPoint,
  generateSpawnPoints,
} from './game-state.js';

const THREE = globalThis.THREE;

const GAME_PHASES = {
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  WON: 'won',
  LOST: 'lost',
};

const LEVEL = {
  groundLevel: 1,
  winDistance: 340,
  maxAltitude: 54,
  safeZoneEnd: 60,
  trackCollectibles: 48,
  hazardCount: 28,
  fuelCount: 10,
  boostCount: 12,
  finalRewardBonus: 120,
};

const TRACK = {
  startZ: 10,
  length: LEVEL.winDistance - 8,
  amplitude: 10.5,
  waves: 6,
  baseY: 2.4,
  ySwing: 2.3,
  climb: 34,
  platformCount: 30,
  platformWidth: 10,
  platformDepth: 16,
  platformThickness: 1.35,
  wallOffsetX: 15.5,
};

const MOVEMENT = {
  rotationSpeed: 2.4,
  cruiseSpeed: 0,
  baseMoveSpeed: 15,
  maxMoveSpeedBonus: 9,
  strafeSpeed: 11.5,
  joystickTurnMix: 0.85,
  joystickStrafeMix: 1,
  backwardSpeedFactor: 0.58,
  jetpackAcceleration: 48,
  gravity: -31,
  maxRiseSpeed: 24,
  maxFallSpeed: 28,
  cameraLerp: 0.12,
  cameraHeightOffset: 5.4,
  cameraDistance: 13,
  playBoundsX: 24,
};

const RESOURCE = {
  maxFuel: 100,
  maxShield: 100,
  idleFuelDrain: 0,
  thrustFuelDrain: 0,
  fuelPickupAmount: 28,
  boostDurationSeconds: 4.5,
  boostMultiplier: 1.45,
  hazardDamage: 34,
  hitScorePenalty: 8,
  pickupScore: 10,
  fuelPickupScore: 5,
  boostPickupScore: 15,
  damageCooldownSeconds: 0.8,
};

const COLLISION = {
  collectible: 3.2,
  hazard: 3.6,
  fuel: 3.8,
  boost: 4.2,
  playerRadiusX: 0.75,
  playerRadiusZ: 0.75,
  playerHeight: 2.1,
  landingGrace: 0.35,
};

const textureCache = new Map();

function createLabelTexture(text, options = {}) {
  const {
    startColor = '#ffca6f',
    endColor = '#ff8942',
    strokeColor = '#04203a',
    textColor = '#ffffff',
    size = 256,
    font = 'bold 54px Trebuchet MS',
  } = options;

  const cacheKey = `${text}:${startColor}:${endColor}:${strokeColor}:${textColor}:${font}:${size}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  context.fillStyle = 'rgba(255, 255, 255, 0.12)';
  context.beginPath();
  context.arc(size * 0.27, size * 0.25, size * 0.2, 0, Math.PI * 2);
  context.fill();

  context.lineWidth = 6;
  context.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  context.strokeRect(7, 7, size - 14, size - 14);

  context.font = font;
  context.fillStyle = textColor;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeStyle = strokeColor;
  context.lineWidth = 7;
  context.strokeText(text, size / 2, size / 2);
  context.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);
  return texture;
}

function createLabelSprite(text, options = {}) {
  const texture = createLabelTexture(text, options);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Sprite(material);
}

function createCollectible() {
  const orb = createLabelSprite('3DVR', {
    startColor: '#ffd673',
    endColor: '#ff8f3f',
    strokeColor: '#102033',
  });
  orb.scale.set(4.1, 4.1, 1);
  orb.userData.kind = 'collectible';
  orb.userData.baseScale = 4.1;
  orb.userData.scalePulse = 0.12;
  orb.userData.scoreValue = RESOURCE.pickupScore;
  orb.userData.pickupRadius = COLLISION.collectible;
  return orb;
}

function createFinalCollectible() {
  const reward = createLabelSprite('MEGA', {
    startColor: '#fff2a3',
    endColor: '#ff923f',
    strokeColor: '#4d2e14',
    font: 'bold 66px Trebuchet MS',
  });
  reward.scale.set(6.8, 6.8, 1);
  reward.userData.kind = 'collectible';
  reward.userData.baseScale = 6.8;
  reward.userData.scalePulse = 0.34;
  reward.userData.scoreValue = LEVEL.finalRewardBonus;
  reward.userData.isFinalReward = true;
  reward.userData.pickupRadius = COLLISION.collectible + 1.3;
  return reward;
}

function createHazard() {
  const hazard = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({
      color: 0x4a0606,
      emissive: 0xab120f,
      roughness: 0.24,
      metalness: 0.4,
    })
  );
  hazard.add(core);

  const spikeGeometry = new THREE.ConeGeometry(0.22, 1.15, 8);
  const spikeMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3f2f,
    emissive: 0x7a0800,
    roughness: 0.16,
    metalness: 0.58,
  });
  const spikeDirections = [
    new THREE.Vector3(1, 0.3, 0),
    new THREE.Vector3(-1, 0.2, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0.25, 1),
    new THREE.Vector3(0, -0.15, -1),
    new THREE.Vector3(0.7, 0.45, 0.7),
    new THREE.Vector3(-0.7, 0.4, 0.7),
    new THREE.Vector3(0.7, -0.35, -0.7),
    new THREE.Vector3(-0.7, -0.3, -0.7),
  ];
  const up = new THREE.Vector3(0, 1, 0);

  spikeDirections.forEach(direction => {
    const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
    const normal = direction.clone().normalize();
    spike.position.copy(normal.clone().multiplyScalar(1.05));
    spike.quaternion.setFromUnitVectors(up, normal);
    hazard.add(spike);
  });

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 14, 14),
    new THREE.MeshBasicMaterial({
      color: 0xff412d,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    })
  );
  hazard.add(aura);

  const warning = createLabelSprite('DMG', {
    startColor: '#ff9f4e',
    endColor: '#f33a2a',
    strokeColor: '#290605',
    font: 'bold 40px Trebuchet MS',
  });
  warning.scale.set(2.1, 2.1, 1);
  warning.position.y = 2.2;
  hazard.add(warning);

  hazard.userData.kind = 'hazard';
  hazard.userData.aura = aura;
  return hazard;
}

function createFuelCell() {
  const group = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 2.2, 14),
    new THREE.MeshStandardMaterial({
      color: 0x5db6ff,
      emissive: 0x184f86,
      roughness: 0.4,
      metalness: 0.25,
    })
  );
  group.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.18, 10, 20),
    new THREE.MeshStandardMaterial({
      color: 0x9ce4ff,
      emissive: 0x2b7aa3,
      roughness: 0.2,
      metalness: 0.4,
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const label = createLabelSprite('FUEL', {
    startColor: '#64d7ff',
    endColor: '#57b1ff',
    strokeColor: '#0d2f4a',
    font: 'bold 48px Trebuchet MS',
  });
  label.scale.set(2.2, 2.2, 1);
  label.position.y = 2;
  group.add(label);

  group.userData.kind = 'fuel';
  return group;
}

function createBoostRing() {
  const group = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.45, 0.3, 14, 30),
    new THREE.MeshStandardMaterial({
      color: 0xffd58a,
      emissive: 0x9a6223,
      roughness: 0.3,
      metalness: 0.24,
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.08, 8, 18),
    new THREE.MeshBasicMaterial({
      color: 0xfff1c9,
      transparent: true,
      opacity: 0.8,
    })
  );
  inner.rotation.x = Math.PI / 2;
  group.add(inner);

  const label = createLabelSprite('BOOST', {
    startColor: '#ffe39d',
    endColor: '#ffb347',
    strokeColor: '#5f3a14',
    font: 'bold 40px Trebuchet MS',
  });
  label.scale.set(2.3, 2.3, 1);
  label.position.y = 2;
  group.add(label);

  group.userData.kind = 'boost';
  return group;
}

function addJetpackFlame(target) {
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.7, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa53b, transparent: true, opacity: 0.85 })
  );
  flame.position.set(0, -0.95, -0.2);
  flame.rotation.x = Math.PI;
  flame.visible = false;
  flame.name = 'jetpack-flame';
  target.add(flame);

  const glow = new THREE.PointLight(0xff9838, 1.4, 7);
  glow.position.set(0, -1.2, -0.2);
  glow.visible = false;
  glow.name = 'jetpack-glow';
  target.add(glow);
}

function addPlayerBranding(target) {
  const badge = createLabelSprite('3dvr.tech', {
    startColor: '#73dafd',
    endColor: '#2f9ec6',
    strokeColor: '#0a1f31',
    font: 'bold 42px Trebuchet MS',
  });
  badge.scale.set(2.7, 2.7, 1);
  badge.position.set(0, 2.2, 0);
  badge.name = 'player-branding';
  target.add(badge);
}

function createFallbackPlayer() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 1.6, 16),
    new THREE.MeshStandardMaterial({
      color: 0xff7f59,
      emissive: 0x45180b,
      roughness: 0.35,
      metalness: 0.2,
    })
  );
  group.add(body);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xff9c76,
      emissive: 0x5f2412,
      roughness: 0.45,
      metalness: 0.12,
    })
  );
  helmet.position.set(0, 0.95, 0);
  group.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x88d9ff,
      emissive: 0x28506d,
      roughness: 0.1,
      metalness: 0.3,
    })
  );
  visor.position.set(0, 0.45, 0.43);
  group.add(visor);

  return group;
}

function createPulseEffect(position, color = 0xffffff) {
  const effect = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.95, 36),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    })
  );
  effect.position.copy(position);
  effect.rotation.x = Math.PI / 2;
  effect.userData.duration = 0.42;
  effect.userData.age = 0;
  return effect;
}

function createRoutePoint(index, totalPoints, options = {}) {
  return createTrackPoint(index, totalPoints, {
    startZ: TRACK.startZ,
    length: TRACK.length,
    amplitude: TRACK.amplitude,
    waves: TRACK.waves,
    baseY: TRACK.baseY,
    ySwing: TRACK.ySwing,
    climb: TRACK.climb,
    ...options,
  });
}

class JetpackGame {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1300);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.clock = new THREE.Clock();

    this.player = null;
    this.playerVelocity = new THREE.Vector3(0, 0, 0);
    this.cameraLookTarget = new THREE.Vector3(0, 2, 40);

    this.collectibles = [];
    this.hazards = [];
    this.fuelCells = [];
    this.boostRings = [];
    this.hitEffects = [];
    this.solidMeshes = [];
    this.solidColliders = [];

    this.elapsedSeconds = 0;
    this.lastDamageAt = -Infinity;
    this.phase = GAME_PHASES.LOADING;

    this.score = 0;
    this.shield = RESOURCE.maxShield;
    this.fuel = RESOURCE.maxFuel;
    this.boostUntil = 0;

    this.ui = createUI();
    this.input = createInputController({
      onPauseToggle: () => this.togglePause(),
    });

    this.animate = this.animate.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);
  }

  async init() {
    this.setupRenderer();
    this.setupScene();
    this.createGround();
    this.createEnvironment();
    this.createTrackStructures();
    this.createFinishGate();

    this.input.attach();
    this.ui.initMenuToggle();
    this.ui.bindOverlayAction(() => this.onOverlayAction());
    this.ui.setPauseButtonLabel(false);
    this.ui.updateHUD(this.getHudSnapshot());

    window.addEventListener('resize', this.onWindowResize);

    await this.loadPlayer();
    this.ui.hideLoading();
    this.resetRunState();
    this.startRun();

    this.clock.getDelta();
    this.animate();
  }

  setupRenderer() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(this.renderer.domElement);
  }

  setupScene() {
    this.scene.background = new THREE.Color(0x8ac0f4);
    this.scene.fog = new THREE.Fog(0x8ac0f4, 70, 520);

    this.camera.position.set(0, 6, -11);

    const hemiLight = new THREE.HemisphereLight(0xd9efff, 0x1f2f27, 0.92);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(24, 36, 12);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8fd5ff, 0.42);
    fillLight.position.set(-22, 12, -28);
    this.scene.add(fillLight);
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(950, 950),
      new THREE.MeshStandardMaterial({
        color: 0x2f6d36,
        roughness: 0.9,
        metalness: 0.02,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);
  }

  createEnvironment() {
    const skylineGroup = new THREE.Group();

    const rngPoints = generateSpawnPoints({
      count: 90,
      startZ: 18,
      spacing: 5.2,
      seed: 612,
      xSpread: 140,
      baseY: 0,
      yJitter: 0,
      zJitter: 2,
    });

    rngPoints.forEach((point, index) => {
      const height = 8 + (index % 7) * 2.6;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, height, 4.4),
        new THREE.MeshStandardMaterial({
          color: index % 2 === 0 ? 0x3f6788 : 0x2f4f6e,
          roughness: 0.7,
          metalness: 0.1,
        })
      );
      const sideBias = index % 2 === 0 ? -1 : 1;
      block.position.set(point.x + sideBias * 38, height / 2, point.z + 18);
      skylineGroup.add(block);
    });

    this.scene.add(skylineGroup);
  }

  addSolidBox(options = {}) {
    const {
      width = 4,
      height = 4,
      depth = 4,
      x = 0,
      y = height / 2,
      z = 0,
      color = 0x2f4f6e,
      emissive = 0x122030,
      roughness = 0.66,
      metalness = 0.18,
    } = options;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        roughness,
        metalness,
      })
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.solidMeshes.push(mesh);

    this.solidColliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: y - height / 2,
      maxY: y + height / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
    });

    return mesh;
  }

  createTrackStructures() {
    this.solidMeshes.forEach(mesh => this.scene.remove(mesh));
    this.solidMeshes.length = 0;
    this.solidColliders.length = 0;

    const sideWallDepth = LEVEL.winDistance + 34;
    const sideWallCenterZ = TRACK.startZ + sideWallDepth / 2 - 8;
    this.addSolidBox({
      width: 1.8,
      height: 18,
      depth: sideWallDepth,
      x: -TRACK.wallOffsetX,
      y: 9,
      z: sideWallCenterZ,
      color: 0x355670,
      emissive: 0x102236,
    });
    this.addSolidBox({
      width: 1.8,
      height: 18,
      depth: sideWallDepth,
      x: TRACK.wallOffsetX,
      y: 9,
      z: sideWallCenterZ,
      color: 0x355670,
      emissive: 0x102236,
    });

    const launchPadDepth = 34;
    this.addSolidBox({
      width: 12.2,
      height: 1.2,
      depth: launchPadDepth,
      x: 0,
      y: LEVEL.groundLevel - 0.6,
      z: TRACK.startZ - 6 + launchPadDepth / 2,
      color: 0x476f8f,
      emissive: 0x173247,
      roughness: 0.58,
      metalness: 0.24,
    });

    for (let index = 0; index < TRACK.platformCount; index += 1) {
      const point = createRoutePoint(index, TRACK.platformCount);
      const platformTopY = Math.max(LEVEL.groundLevel + 0.1, point.y - 1.1);
      const platformCenterY = platformTopY - TRACK.platformThickness / 2;

      this.addSolidBox({
        width: TRACK.platformWidth,
        height: TRACK.platformThickness,
        depth: TRACK.platformDepth,
        x: point.x,
        y: platformCenterY,
        z: point.z,
        color: index % 2 === 0 ? 0x54839d : 0x4a7793,
        emissive: 0x1a3547,
        roughness: 0.54,
        metalness: 0.26,
      });

      if (index % 3 === 1) {
        const sideSign = index % 2 === 0 ? 1 : -1;
        const perchX = point.x + sideSign * (TRACK.platformWidth * 0.58);
        const perchZ = point.z + 2;
        const perchTop = Math.min(LEVEL.maxAltitude - 2.4, platformTopY + 4.4 + (index % 4) * 0.7);

        this.addSolidBox({
          width: 2.6,
          height: perchTop,
          depth: 2.6,
          x: perchX,
          y: perchTop / 2,
          z: perchZ,
          color: 0x315168,
          emissive: 0x121f2d,
          roughness: 0.62,
          metalness: 0.22,
        });

        this.addSolidBox({
          width: 4,
          height: 1,
          depth: 4,
          x: perchX,
          y: perchTop + 0.5,
          z: perchZ,
          color: 0x5a86a1,
          emissive: 0x203746,
          roughness: 0.52,
          metalness: 0.26,
        });
      }
    }
  }

  createFinishGate() {
    const gate = new THREE.Group();

    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdba4,
      emissive: 0x5f4623,
      roughness: 0.35,
      metalness: 0.2,
    });

    const leftPost = new THREE.Mesh(new THREE.BoxGeometry(1.8, 11.5, 1.8), postMaterial);
    leftPost.position.set(-6.5, 5.8, LEVEL.winDistance + 8);
    gate.add(leftPost);

    const rightPost = new THREE.Mesh(new THREE.BoxGeometry(1.8, 11.5, 1.8), postMaterial);
    rightPost.position.set(6.5, 5.8, LEVEL.winDistance + 8);
    gate.add(rightPost);

    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(15.6, 1.7, 1.8), postMaterial);
    topBeam.position.set(0, 11.4, LEVEL.winDistance + 8);
    gate.add(topBeam);

    const finishLabel = createLabelSprite('FINISH', {
      startColor: '#fdd58f',
      endColor: '#ff9352',
      strokeColor: '#4e2f15',
      font: 'bold 58px Trebuchet MS',
    });
    finishLabel.position.set(0, 11.4, LEVEL.winDistance + 9.1);
    finishLabel.scale.set(5.2, 2.3, 1);
    gate.add(finishLabel);

    this.scene.add(gate);
  }

  async loadPlayer() {
    if (!THREE || typeof THREE.GLTFLoader !== 'function') {
      this.player = createFallbackPlayer();
      this.player.scale.set(0.9, 0.9, 0.9);
      this.player.position.set(0, LEVEL.groundLevel, 0);
      addJetpackFlame(this.player);
      addPlayerBranding(this.player);
      this.scene.add(this.player);
      return;
    }

    const loader = new THREE.GLTFLoader();

    await new Promise(resolve => {
      loader.load(
        'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
        gltf => {
          this.player = gltf.scene;
          this.player.scale.set(0.52, 0.52, 0.52);
          this.player.position.set(0, LEVEL.groundLevel, 0);
          this.player.rotation.y = 0;
          addJetpackFlame(this.player);
          addPlayerBranding(this.player);
          this.scene.add(this.player);
          resolve();
        },
        undefined,
        error => {
          console.error('Jetpack model failed to load, using fallback.', error);
          this.player = createFallbackPlayer();
          this.player.scale.set(0.9, 0.9, 0.9);
          this.player.position.set(0, LEVEL.groundLevel, 0);
          addJetpackFlame(this.player);
          addPlayerBranding(this.player);
          this.scene.add(this.player);
          resolve();
        }
      );
    });
  }

  rebuildRunObjects() {
    // Run entities are regenerated from deterministic helpers so reset behavior is reproducible.
    this.clearRunObjects();
    this.createCollectibles();
    this.createHazards();
    this.createFuelCells();
    this.createBoostRings();
  }

  clearRunObjects() {
    const groups = [
      this.collectibles,
      this.hazards,
      this.fuelCells,
      this.boostRings,
      this.hitEffects,
    ];

    groups.forEach(group => {
      while (group.length > 0) {
        const object = group.pop();
        this.scene.remove(object);
      }
    });
  }

  createCollectibles() {
    for (let index = 0; index < LEVEL.trackCollectibles; index += 1) {
      const point = createRoutePoint(index, LEVEL.trackCollectibles);

      const collectible = createCollectible();
      collectible.position.set(point.x, point.y + 1.05, point.z);
      collectible.userData.phase = index * 0.31;
      this.scene.add(collectible);
      this.collectibles.push(collectible);
    }

    const rewardPoint = createRoutePoint(LEVEL.trackCollectibles - 1, LEVEL.trackCollectibles, {
      startZ: TRACK.startZ + 8,
      length: TRACK.length - 16,
    });
    const finalCollectible = createFinalCollectible();
    finalCollectible.position.set(
      rewardPoint.x,
      Math.min(LEVEL.maxAltitude - 1.7, rewardPoint.y + 3.9),
      LEVEL.winDistance - 6
    );
    finalCollectible.userData.phase = 1.2;
    this.scene.add(finalCollectible);
    this.collectibles.push(finalCollectible);
  }

  createHazards() {
    const points = generateSpawnPoints({
      count: LEVEL.hazardCount,
      startZ: LEVEL.safeZoneEnd + 8,
      spacing: 10.2,
      seed: 5312,
      xSpread: 6,
      baseY: 0,
      yJitter: 0,
      zJitter: 1.8,
    });

    points.forEach((point, index) => {
      const routePoint = createRoutePoint(index, LEVEL.hazardCount, {
        startZ: LEVEL.safeZoneEnd + 8,
        length: LEVEL.winDistance - LEVEL.safeZoneEnd - 22,
        climb: TRACK.climb - 8,
      });
      const hazard = createHazard();
      const laneOffset = point.x + Math.sin(index * 1.1) * 2.6;
      const hazardX = clamp(routePoint.x + laneOffset, -TRACK.wallOffsetX + 2.3, TRACK.wallOffsetX - 2.3);
      const hazardY = Math.max(LEVEL.groundLevel + 0.6, routePoint.y + Math.cos(index * 0.9) * 1.15);
      const hazardZ = routePoint.z + point.z - (LEVEL.safeZoneEnd + 8) - index * 10.2;
      hazard.position.set(hazardX, hazardY, hazardZ);
      hazard.scale.setScalar(point.scale);
      hazard.userData.spin = 0.65 + index * 0.016;
      hazard.userData.wobble = 0.65 + (index % 4) * 0.11;
      hazard.userData.baseY = hazardY;
      this.scene.add(hazard);
      this.hazards.push(hazard);
    });
  }

  createFuelCells() {
    for (let index = 0; index < LEVEL.fuelCount; index += 1) {
      const point = createRoutePoint(index, LEVEL.fuelCount, {
        startZ: LEVEL.safeZoneEnd + 14,
        length: LEVEL.winDistance - LEVEL.safeZoneEnd - 36,
        climb: TRACK.climb - 6,
      });
      const fuelCell = createFuelCell();
      const laneSide = index % 2 === 0 ? -1 : 1;
      fuelCell.position.set(
        clamp(point.x + laneSide * 3.8, -TRACK.wallOffsetX + 2.8, TRACK.wallOffsetX - 2.8),
        point.y + 1.1,
        point.z + (index % 3) * 2.2
      );
      fuelCell.scale.setScalar(1.02 + (index % 3) * 0.12);
      fuelCell.userData.baseY = point.y + 1.1;
      fuelCell.userData.phase = index * 0.38;
      this.scene.add(fuelCell);
      this.fuelCells.push(fuelCell);
    }
  }

  createBoostRings() {
    for (let index = 0; index < LEVEL.boostCount; index += 1) {
      const point = createRoutePoint(index, LEVEL.boostCount, {
        startZ: LEVEL.safeZoneEnd + 18,
        length: LEVEL.winDistance - LEVEL.safeZoneEnd - 28,
        climb: TRACK.climb - 3,
      });
      const ring = createBoostRing();
      ring.position.set(point.x, point.y + 2.2, point.z + Math.sin(index * 0.7) * 2.8);
      ring.scale.setScalar(1.03 + (index % 3) * 0.07);
      ring.userData.baseY = point.y + 2.2;
      ring.userData.phase = index * 0.47;
      this.scene.add(ring);
      this.boostRings.push(ring);
    }
  }

  resetRunState() {
    this.score = 0;
    this.shield = RESOURCE.maxShield;
    this.fuel = RESOURCE.maxFuel;
    this.boostUntil = 0;
    this.elapsedSeconds = 0;
    this.lastDamageAt = -Infinity;
    this.playerVelocity.set(0, 0, 0);

    if (this.player) {
      this.player.position.set(0, LEVEL.groundLevel, 0);
      this.player.rotation.set(0, 0, 0);
      const flame = this.player.getObjectByName('jetpack-flame');
      const glow = this.player.getObjectByName('jetpack-glow');
      if (flame) {
        flame.visible = false;
      }
      if (glow) {
        glow.visible = false;
      }
    }

    this.input.clear();
    this.rebuildRunObjects();
    this.ui.updateHUD(this.getHudSnapshot());
  }

  startRun() {
    this.phase = GAME_PHASES.PLAYING;
    this.ui.hideOverlay();
    this.ui.setPauseButtonLabel(false);
    this.clock.getDelta();
  }

  togglePause() {
    if (this.phase === GAME_PHASES.PLAYING) {
      this.phase = GAME_PHASES.PAUSED;
      this.input.clear();
      this.ui.setPauseButtonLabel(true);
      this.ui.showOverlay({
        title: 'Run Paused',
        message: 'Take your time. Tap resume when you are ready.',
        buttonLabel: 'Resume Run',
      });
      return;
    }

    if (this.phase === GAME_PHASES.PAUSED) {
      this.phase = GAME_PHASES.PLAYING;
      this.ui.setPauseButtonLabel(false);
      this.ui.hideOverlay();
      this.clock.getDelta();
    }
  }

  onOverlayAction() {
    if (this.phase === GAME_PHASES.PAUSED) {
      this.togglePause();
      return;
    }

    if (this.phase === GAME_PHASES.WON || this.phase === GAME_PHASES.LOST) {
      this.resetRunState();
      this.startRun();
    }
  }

  getBoostSecondsRemaining() {
    return Math.max(0, this.boostUntil - this.elapsedSeconds);
  }

  getBoostMultiplier() {
    return this.getBoostSecondsRemaining() > 0 ? RESOURCE.boostMultiplier : 1;
  }

  getHudSnapshot() {
    const playerZ = this.player ? this.player.position.z : 0;
    const progress = computeProgress(playerZ, LEVEL.winDistance);
    return {
      score: this.score,
      shield: this.shield,
      fuel: this.fuel,
      progress,
      boostSeconds: this.getBoostSecondsRemaining(),
    };
  }

  updatePlayer(deltaSeconds) {
    if (!this.player) {
      return;
    }

    const previousPosition = this.player.position.clone();

    const keyboardTurnInput = (this.input.state.right ? 1 : 0) - (this.input.state.left ? 1 : 0);
    const turnIntent = clamp(
      keyboardTurnInput + this.input.state.moveX * MOVEMENT.joystickTurnMix,
      -1,
      1
    );
    if (Math.abs(turnIntent) > 0.001) {
      this.player.rotation.y += turnIntent * MOVEMENT.rotationSpeed * deltaSeconds;
    }

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(this.player.quaternion);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(this.player.quaternion);
    right.y = 0;
    right.normalize();

    const progress = computeProgress(this.player.position.z, LEVEL.winDistance);
    const scaledForwardSpeed =
      computeForwardSpeed(MOVEMENT.baseMoveSpeed, MOVEMENT.maxMoveSpeedBonus, progress) *
      this.getBoostMultiplier();

    const keyboardForwardInput = (this.input.state.forward ? 1 : 0) - (this.input.state.backward ? 1 : 0);
    const forwardInput = clamp(keyboardForwardInput + this.input.state.moveY, -1, 1);
    const forwardSpeedContribution =
      forwardInput >= 0
        ? forwardInput * scaledForwardSpeed
        : forwardInput * scaledForwardSpeed * MOVEMENT.backwardSpeedFactor;
    const moveAmount = MOVEMENT.cruiseSpeed * deltaSeconds + forwardSpeedContribution * deltaSeconds;
    this.player.position.addScaledVector(forward, moveAmount);

    const keyboardStrafeInput = (this.input.state.strafeRight ? 1 : 0) - (this.input.state.strafeLeft ? 1 : 0);
    const strafeInput = clamp(
      keyboardStrafeInput + this.input.state.moveX * MOVEMENT.joystickStrafeMix,
      -1,
      1
    );
    const strafeAmount = strafeInput * MOVEMENT.strafeSpeed * this.getBoostMultiplier() * deltaSeconds;
    this.player.position.addScaledVector(right, strafeAmount);

    const canThrust = this.fuel > 0.05;
    const thrusting = this.input.state.thrust && canThrust;

    this.fuel = consumeFuel(this.fuel, deltaSeconds, {
      isThrusting: thrusting,
      idleDrain: RESOURCE.idleFuelDrain,
      thrustDrain: RESOURCE.thrustFuelDrain,
      maxFuel: RESOURCE.maxFuel,
    });

    if (thrusting) {
      this.playerVelocity.y += MOVEMENT.jetpackAcceleration * deltaSeconds;
    }

    this.playerVelocity.y += MOVEMENT.gravity * deltaSeconds;
    this.playerVelocity.y = clamp(this.playerVelocity.y, -MOVEMENT.maxFallSpeed, MOVEMENT.maxRiseSpeed);

    this.player.position.y += this.playerVelocity.y * deltaSeconds;
    this.resolveSolidCollisions(previousPosition);

    this.player.position.x = clamp(this.player.position.x, -MOVEMENT.playBoundsX, MOVEMENT.playBoundsX);
    this.player.position.z = Math.max(0, this.player.position.z);

    if (this.player.position.y < LEVEL.groundLevel) {
      this.player.position.y = LEVEL.groundLevel;
      this.playerVelocity.y = 0;
    }

    if (this.player.position.y > LEVEL.maxAltitude) {
      this.player.position.y = LEVEL.maxAltitude;
      this.playerVelocity.y = Math.min(this.playerVelocity.y, 2);
    }

    const flame = this.player.getObjectByName('jetpack-flame');
    const glow = this.player.getObjectByName('jetpack-glow');
    if (flame) {
      flame.visible = thrusting;
      if (thrusting) {
        const pulse = 0.88 + Math.sin(this.elapsedSeconds * 30) * 0.14;
        flame.scale.set(pulse, pulse, pulse);
      }
    }
    if (glow) {
      glow.visible = thrusting;
      if (thrusting) {
        glow.intensity = 1.3 + Math.sin(this.elapsedSeconds * 26) * 0.35;
      }
    }

    const backward = forward.clone().multiplyScalar(-MOVEMENT.cameraDistance);
    const desiredCameraPosition = new THREE.Vector3().copy(this.player.position);
    desiredCameraPosition.add(backward);
    desiredCameraPosition.y += MOVEMENT.cameraHeightOffset;

    this.camera.position.lerp(desiredCameraPosition, MOVEMENT.cameraLerp);
    this.cameraLookTarget.copy(this.player.position);
    this.cameraLookTarget.addScaledVector(forward, 8);
    this.cameraLookTarget.y += 1.8;
    this.camera.lookAt(this.cameraLookTarget);
  }

  resolveSolidCollisions(previousPosition) {
    if (!this.player || this.solidColliders.length === 0) {
      return;
    }

    const position = this.player.position;
    const radiusX = COLLISION.playerRadiusX;
    const radiusZ = COLLISION.playerRadiusZ;

    this.solidColliders.forEach(collider => {
      const intersectsX = position.x + radiusX > collider.minX && position.x - radiusX < collider.maxX;
      const intersectsZ = position.z + radiusZ > collider.minZ && position.z - radiusZ < collider.maxZ;
      const intersectsY =
        position.y + COLLISION.playerHeight > collider.minY && position.y < collider.maxY;
      if (!intersectsX || !intersectsZ || !intersectsY) {
        return;
      }

      const wasAboveTop = previousPosition.y >= collider.maxY - COLLISION.landingGrace;
      const wasOverPlatform =
        previousPosition.x + radiusX > collider.minX &&
        previousPosition.x - radiusX < collider.maxX &&
        previousPosition.z + radiusZ > collider.minZ &&
        previousPosition.z - radiusZ < collider.maxZ;
      if (this.playerVelocity.y <= 0 && wasAboveTop && wasOverPlatform) {
        position.y = collider.maxY;
        this.playerVelocity.y = 0;
        return;
      }

      const cameFromBelow =
        previousPosition.y + COLLISION.playerHeight <= collider.minY && this.playerVelocity.y > 0;
      if (cameFromBelow) {
        position.y = collider.minY - COLLISION.playerHeight - 0.01;
        this.playerVelocity.y = 0;
        return;
      }

      const pushLeft = Math.abs(collider.minX - (position.x + radiusX));
      const pushRight = Math.abs(collider.maxX - (position.x - radiusX));
      const pushFront = Math.abs(collider.minZ - (position.z + radiusZ));
      const pushBack = Math.abs(collider.maxZ - (position.z - radiusZ));
      const minPush = Math.min(pushLeft, pushRight, pushFront, pushBack);

      if (minPush === pushLeft) {
        position.x = collider.minX - radiusX;
      } else if (minPush === pushRight) {
        position.x = collider.maxX + radiusX;
      } else if (minPush === pushFront) {
        position.z = collider.minZ - radiusZ;
      } else {
        position.z = collider.maxZ + radiusZ;
      }
    });
  }

  updateWorld(deltaSeconds) {
    this.collectibles.forEach((collectible, index) => {
      collectible.position.y += Math.sin(this.elapsedSeconds * 2.6 + collectible.userData.phase) * 0.002;
      collectible.material.rotation += deltaSeconds * 0.45;
      const baseScale = collectible.userData.baseScale ?? 3.9;
      const scalePulse = collectible.userData.scalePulse ?? 0.12;
      collectible.scale.setScalar(baseScale + Math.sin(this.elapsedSeconds * 5 + index) * scalePulse);
    });

    this.hazards.forEach(hazard => {
      hazard.rotation.x += deltaSeconds * hazard.userData.spin;
      hazard.rotation.y += deltaSeconds * (hazard.userData.spin * 1.3);
      hazard.position.y = hazard.userData.baseY + Math.sin(this.elapsedSeconds * hazard.userData.wobble) * 0.15;
      if (hazard.userData.aura) {
        hazard.userData.aura.material.opacity = 0.12 + Math.sin(this.elapsedSeconds * 8) * 0.06;
      }
    });

    this.fuelCells.forEach(cell => {
      cell.rotation.y += deltaSeconds * 1.4;
      cell.position.y = cell.userData.baseY + Math.sin(this.elapsedSeconds * 2.8 + cell.userData.phase) * 0.36;
    });

    this.boostRings.forEach(ring => {
      ring.rotation.z += deltaSeconds * 1.25;
      ring.rotation.x += deltaSeconds * 0.32;
      ring.position.y = ring.userData.baseY + Math.sin(this.elapsedSeconds * 2 + ring.userData.phase) * 0.48;
    });
  }

  createHitPulse(position, color) {
    const effect = createPulseEffect(position, color);
    this.scene.add(effect);
    this.hitEffects.push(effect);
  }

  updateHitEffects(deltaSeconds) {
    for (let index = this.hitEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.hitEffects[index];
      effect.userData.age += deltaSeconds;
      const progress = effect.userData.age / effect.userData.duration;
      if (progress >= 1) {
        this.scene.remove(effect);
        this.hitEffects.splice(index, 1);
        continue;
      }

      const scale = 1 + progress * 2.2;
      effect.scale.setScalar(scale);
      effect.material.opacity = 1 - progress;
    }
  }

  collectIfNear(objects, threshold, onCollect) {
    if (!this.player) {
      return;
    }

    for (let index = objects.length - 1; index >= 0; index -= 1) {
      const object = objects[index];
      const objectThreshold = object.userData.pickupRadius ?? threshold;
      if (this.player.position.distanceTo(object.position) <= objectThreshold) {
        onCollect(object, index);
      }
    }
  }

  checkCollisions() {
    this.collectIfNear(this.collectibles, COLLISION.collectible, (collectible, index) => {
      const pulseColor = collectible.userData.isFinalReward ? 0xffd35b : 0xfff2c6;
      this.createHitPulse(collectible.position, pulseColor);
      this.scene.remove(collectible);
      this.collectibles.splice(index, 1);
      this.score += collectible.userData.scoreValue ?? RESOURCE.pickupScore;
    });

    this.collectIfNear(this.fuelCells, COLLISION.fuel, (fuelCell, index) => {
      this.createHitPulse(fuelCell.position, 0x84dcff);
      this.scene.remove(fuelCell);
      this.fuelCells.splice(index, 1);
      this.fuel = addFuel(this.fuel, RESOURCE.fuelPickupAmount, RESOURCE.maxFuel);
      this.score += RESOURCE.fuelPickupScore;
    });

    this.collectIfNear(this.boostRings, COLLISION.boost, (ring, index) => {
      this.createHitPulse(ring.position, 0xffd086);
      this.scene.remove(ring);
      this.boostRings.splice(index, 1);
      this.boostUntil = Math.max(this.boostUntil, this.elapsedSeconds + RESOURCE.boostDurationSeconds);
      this.score += RESOURCE.boostPickupScore;
    });

    this.collectIfNear(this.hazards, COLLISION.hazard, (hazard, index) => {
      const sinceLastHit = this.elapsedSeconds - this.lastDamageAt;
      if (sinceLastHit < RESOURCE.damageCooldownSeconds) {
        return;
      }

      this.lastDamageAt = this.elapsedSeconds;
      this.createHitPulse(hazard.position, 0xff7d66);
      this.scene.remove(hazard);
      this.hazards.splice(index, 1);

      this.shield = applyDamage(this.shield, RESOURCE.hazardDamage);
      this.score = Math.max(0, this.score - RESOURCE.hitScorePenalty);
    });
  }

  checkRunEnd() {
    const progress = computeProgress(this.player.position.z, LEVEL.winDistance);

    if (this.shield <= 0 && this.phase === GAME_PHASES.PLAYING) {
      this.phase = GAME_PHASES.LOST;
      this.input.clear();
      this.ui.setPauseButtonLabel(false);
      this.ui.showOverlay({
        title: 'Shield Collapse',
        message: `Score ${Math.round(this.score)}. Fly cleaner and chain boosts to stay ahead of hazards.`,
        buttonLabel: 'Retry Run',
      });
      return;
    }

    if (progress >= 1 && this.phase === GAME_PHASES.PLAYING) {
      const completionBonus = Math.round(this.fuel * 0.7 + this.shield * 0.5);
      this.score += completionBonus;
      this.phase = GAME_PHASES.WON;
      this.input.clear();
      this.ui.setPauseButtonLabel(false);
      this.ui.showOverlay({
        title: 'Skyline Route Cleared',
        message: `Final score ${Math.round(this.score)} with ${completionBonus} finish bonus. Keep climbing.`,
        buttonLabel: 'Run Again',
      });
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const deltaSeconds = Math.min(this.clock.getDelta(), 0.05);

    if (this.phase === GAME_PHASES.PLAYING) {
      this.elapsedSeconds += deltaSeconds;
      this.updatePlayer(deltaSeconds);
      this.updateWorld(deltaSeconds);
      this.checkCollisions();
      this.checkRunEnd();
    }

    this.updateHitEffects(deltaSeconds);
    this.ui.updateHUD(this.getHudSnapshot());
    this.renderer.render(this.scene, this.camera);
  }
}

async function bootstrap() {
  if (!THREE) {
    throw new Error('Three.js failed to load.');
  }

  const game = new JetpackGame();
  await game.init();
}

bootstrap().catch(error => {
  console.error('Jetpack boot failed:', error);

  const loading = document.getElementById('loading');
  if (loading) {
    loading.textContent = 'Unable to load Jetpack Corridor. Refresh to retry.';
  }

  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const message = document.getElementById('overlay-message');
  const action = document.getElementById('overlay-action');

  if (title) {
    title.textContent = 'Load Error';
  }
  if (message) {
    message.textContent = 'Three.js assets could not be initialized. Check network and reload.';
  }
  if (action) {
    action.textContent = 'Reload';
    action.style.display = 'inline-flex';
    action.addEventListener('click', () => window.location.reload(), { once: true });
  }
  if (overlay) {
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
  }
});
