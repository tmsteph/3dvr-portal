import * as THREE from './vendor/three.module.js';

const STAGE_MESSAGES = [
  'Start with one honest thought.',
  'You found a thing to change.',
  'Give your win a clear shape.',
  'A tiny plan makes it playable.',
  'Make your first move today.',
  'Look! Your effort leaves a mark.',
  'Every try teaches you something.',
  'You made a path. Keep it going!'
];

export function createGame(canvas) {
  if (!canvas || !window.WebGLRenderingContext) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return null;
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 3.2, 7);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xfff8df, 0x286360, 2.4));
  const sun = new THREE.DirectionalLight(0xffe7a0, 3);
  sun.position.set(-3, 6, 4);
  scene.add(sun);

  const world = new THREE.Group();
  world.rotation.x = -0.12;
  scene.add(world);
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(2.45, 2.8, 0.48, 32),
    new THREE.MeshStandardMaterial({ color: 0x71b59b, roughness: 0.95 })
  );
  island.position.y = -0.7;
  world.add(island);
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(2.18, 2.35, 0.12, 32),
    new THREE.MeshStandardMaterial({ color: 0xb7d38c, roughness: 1 })
  );
  soil.position.y = -0.42;
  world.add(soil);

  const sprouts = new THREE.Group();
  world.add(sprouts);
  const landmarks = [];
  const colors = [0xf3c94b, 0xdb765b, 0x166b68, 0x8fbd77, 0xf5a9a0, 0x6d8ed0, 0xf0a34e, 0x7d63a8];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const distance = 1.45 + (index % 2) * 0.35;
    const group = new THREE.Group();
    group.position.set(Math.cos(angle) * distance, -0.35, Math.sin(angle) * distance);
    group.scale.setScalar(0.001);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.48, 8), new THREE.MeshStandardMaterial({ color: 0x397d5c }));
    stem.position.y = 0.24;
    group.add(stem);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.24 + (index % 3) * 0.035, 12, 8), new THREE.MeshStandardMaterial({ color: colors[index] }));
    crown.position.y = 0.62;
    group.add(crown);
    sprouts.add(group);
    landmarks.push(group);
  }
  const token = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0x8a6216, emissiveIntensity: 0.5 }));
  token.position.set(0, 0.2, 0);
  world.add(token);

  let progress = 0;
  let targetProgress = 0;
  let frame = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const render = () => {
    frame = window.requestAnimationFrame(render);
    progress += (targetProgress - progress) * 0.08;
    landmarks.forEach((landmark, index) => {
      const amount = THREE.MathUtils.clamp(progress * landmarks.length - index, 0, 1);
      landmark.scale.setScalar(0.001 + amount * 0.999);
      landmark.rotation.y += 0.003 * amount;
    });
    token.position.y = 0.2 + Math.sin(Date.now() * 0.002) * 0.08;
    world.rotation.z = Math.sin(Date.now() * 0.0004) * 0.025;
    renderer.render(scene, camera);
  };
  resize();
  window.addEventListener('resize', resize);
  render();
  return {
    update({ stageIndex = 0, completedActions = 0, hasResult = false } = {}) {
      const score = Math.min(8, stageIndex + (completedActions > 0 ? 1 : 0) + (hasResult ? 1 : 0));
      targetProgress = score / 8;
      const level = Math.max(1, Math.ceil(score / 2));
      const levelEl = document.querySelector('[data-game-level]');
      const messageEl = document.querySelector('[data-game-message]');
      if (levelEl) levelEl.textContent = `Level ${level}`;
      if (messageEl) messageEl.textContent = STAGE_MESSAGES[Math.min(stageIndex, STAGE_MESSAGES.length - 1)];
    },
    destroy() { window.cancelAnimationFrame(frame); window.removeEventListener('resize', resize); renderer.dispose(); }
  };
}
