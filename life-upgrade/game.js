import * as THREE from './vendor/three.module.js';

const STAGE_MESSAGES = [
  'Fly to the first island. Start with one honest thought.',
  'Nice flying. Pick one thing you can change.',
  'You found the next island. Give your win a clear shape.',
  'Build your path with three tiny steps.',
  'Land here, then do one small thing today.',
  'Look for the proof. Small changes count.',
  'Every try teaches you something.',
  'You made a path. Keep it going!'
];

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'forward', KeyW: 'forward',
  Space: 'fly'
};

function makeButtonControl(button, control, state) {
  if (!button) return () => {};
  let tapTimer;
  let releaseTimer;
  const on = (event) => {
    event.preventDefault();
    window.clearTimeout(tapTimer);
    window.clearTimeout(releaseTimer);
    state[control] = true;
    button.classList.add('is-held');
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch {
      // Some browsers do not expose an active pointer for scripted taps.
    }
  };
  const off = (event) => {
    event.preventDefault();
    window.clearTimeout(tapTimer);
    window.clearTimeout(releaseTimer);
    state[control] = false;
    button.classList.remove('is-held');
  };
  const tap = (event) => {
    // Some mobile browsers and automation drivers report a tap as a
    // detail-0 click. Treat every click as a short press so keyboard, touch,
    // and pointer activation all use the same movement path.
    window.clearTimeout(tapTimer);
    window.clearTimeout(releaseTimer);
    // A few mobile/WebKit and automation pointer sequences deliver
    // lostpointercapture after click. Activate on the next task so that late
    // pointer cleanup cannot cancel a legitimate tap.
    tapTimer = window.setTimeout(() => {
      state[control] = true;
      button.classList.add('is-held');
    }, 0);
    releaseTimer = window.setTimeout(() => {
      state[control] = false;
      button.classList.remove('is-held');
    }, control === 'fly' ? 550 : 1000);
  };
  button.addEventListener('pointerdown', on);
  button.addEventListener('pointerup', off);
  button.addEventListener('pointercancel', off);
  button.addEventListener('lostpointercapture', off);
  button.addEventListener('click', tap);
  return () => {
    button.removeEventListener('pointerdown', on);
    button.removeEventListener('pointerup', off);
    button.removeEventListener('pointercancel', off);
    button.removeEventListener('lostpointercapture', off);
    button.removeEventListener('click', tap);
    window.clearTimeout(tapTimer);
    window.clearTimeout(releaseTimer);
  };
}

export function createGame(canvas, { onLand = () => {} } = {}) {
  if (!canvas || !window.WebGLRenderingContext) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true });
  } catch {
    return null;
  }

  const shell = canvas.closest('.game-world');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071426);
  scene.fog = new THREE.Fog(0x071426, 22, 110);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 150);
  camera.position.set(0, 3.4, 8);
  camera.lookAt(0, 1, -12);
  scene.add(new THREE.HemisphereLight(0x9be8ff, 0x101c37, 2.2));
  const sun = new THREE.DirectionalLight(0xffd57a, 2.8);
  sun.position.set(-4, 8, 5);
  scene.add(sun);

  const world = new THREE.Group();
  scene.add(world);
  const starMaterial = new THREE.MeshBasicMaterial({ color: 0x83e8ff });
  for (let index = 0; index < 90; index += 1) {
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.035 + (index % 3) * 0.018, 6, 6), starMaterial);
    star.position.set(((index * 37) % 30) - 15, ((index * 19) % 12) - 3, -index * 2 - 10);
    world.add(star);
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 150),
    new THREE.MeshStandardMaterial({ color: 0x102c3b, roughness: 0.85, metalness: 0.08 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.4, -66);
  world.add(floor);

  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.62, 5, 10), new THREE.MeshStandardMaterial({ color: 0xfff2d0, roughness: 0.4 }));
  body.position.y = 0.2;
  player.add(body);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0x4de1ff, emissive: 0x155c73, emissiveIntensity: 1.4 }));
  visor.position.set(0, 0.42, -0.2);
  player.add(visor);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffa53b }));
  flame.rotation.x = Math.PI;
  flame.position.y = -0.35;
  player.add(flame);
  world.add(player);

  const gates = [];
  for (let index = 0; index < 8; index += 1) {
    const gate = new THREE.Group();
    gate.position.set(0, 1.1, -16 - index * 14);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 10, 32), new THREE.MeshStandardMaterial({ color: 0xd6f36d, emissive: 0x415f18, emissiveIntensity: 1.2 }));
    gate.add(ring);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc857 }));
    gate.add(core);
    world.add(gate);
    gates.push(gate);
  }

  const state = { left: false, right: false, forward: false, fly: false };
  const cleanup = [];
  Object.entries(KEYS).forEach(([key, control]) => {
    const down = (event) => { if (event.code === key) { event.preventDefault(); state[control] = true; } };
    const up = (event) => { if (event.code === key) { event.preventDefault(); state[control] = false; } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    cleanup.push(() => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); });
  });
  shell?.querySelectorAll('[data-game-control]').forEach((button) => {
    cleanup.push(makeButtonControl(button, button.dataset.gameControl, state));
  });
  const landButton = shell?.querySelector('[data-game-land]');
  const questionCard = shell?.querySelector('[data-game-question]');
  const flightControls = shell?.querySelector('.flight-controls');
  // The first animation frame runs before app.js supplies the current stage
  // distance. Keep landing locked until that distance has been reached.
  if (landButton) {
    landButton.disabled = true;
    landButton.textContent = 'Fly to answer';
  }
  const land = () => {
    if (landButton?.disabled) return;
    if (questionCard) questionCard.hidden = false;
    flightControls?.classList.add('is-landed');
    onLand();
  };
  landButton?.addEventListener('click', land);
  cleanup.push(() => landButton?.removeEventListener('click', land));

  let stageIndex = 0;
  let distance = 0;
  let targetDistance = 3;
  let frame = 0;
  let last = performance.now();
  let arrived = false;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  };
  const render = (now) => {
    frame = window.requestAnimationFrame(render);
    const delta = Math.min(0.04, (now - last) / 1000);
    last = now;
    const speed = state.fly ? 1.7 : state.forward ? 1.2 : 0;
    distance = Math.min(targetDistance, distance + speed * delta);
    player.position.x += ((state.right ? 1 : 0) - (state.left ? 1 : 0)) * delta * 3;
    player.position.x = THREE.MathUtils.clamp(player.position.x, -2.3, 2.3);
    player.position.y += ((state.fly ? 1 : 0) - (state.forward && !state.fly ? 0.35 : 0)) * delta * 2;
    player.position.y = THREE.MathUtils.clamp(player.position.y, -0.5, 2.8);
    player.rotation.z = -player.position.x * 0.12;
    flame.visible = state.fly;
    world.position.z = distance;
    player.position.z = 3;
    const gate = gates[stageIndex];
    if (gate) gate.rotation.z += delta * 0.6;
    camera.position.x += (player.position.x * 0.22 - camera.position.x) * 0.08;
    camera.position.y += (player.position.y + 2.8 - camera.position.y) * 0.08;
    camera.lookAt(camera.position.x * 0.45, 1.1, -12 + distance * 0.03);
    const ready = distance >= targetDistance - 0.02;
    if (ready && !arrived) {
      arrived = true;
      if (landButton) { landButton.disabled = false; landButton.textContent = 'Land to answer'; }
    }
    renderer.render(scene, camera);
  };
  resize();
  window.addEventListener('resize', resize);
  render(performance.now());

  return {
    update({ stageIndex: nextStage = 0, completedActions = 0, hasResult = false, answered = false, prompt = '', support = '' } = {}) {
      if (nextStage !== stageIndex) {
        stageIndex = nextStage;
        distance = 0;
        arrived = false;
        if (questionCard) questionCard.hidden = true;
        flightControls?.classList.remove('is-landed');
        if (landButton) { landButton.disabled = true; landButton.textContent = 'Fly to answer'; }
      }
      targetDistance = Math.max(2.5, Math.min(12, 3 + nextStage * 1.1 + completedActions * 0.5 + (hasResult ? 0.8 : 0)));
      const level = Math.max(1, Math.ceil((nextStage + completedActions + (hasResult ? 1 : 0)) / 2));
      const levelEl = shell?.querySelector('[data-game-level]');
      const messageEl = shell?.querySelector('[data-game-message]');
      if (levelEl) levelEl.textContent = `Level ${level}`;
      if (messageEl) messageEl.textContent = STAGE_MESSAGES[Math.min(nextStage, STAGE_MESSAGES.length - 1)];
      const promptEl = shell?.querySelector('[data-game-question-prompt]');
      const supportEl = shell?.querySelector('[data-game-question-support]');
      const stateEl = shell?.querySelector('[data-game-question-state]');
      if (promptEl) promptEl.textContent = prompt;
      if (supportEl) supportEl.textContent = support;
      if (stateEl && arrived) stateEl.textContent = answered ? '⭐ Nice! Save your answer to unlock the next flight.' : 'You reached the gate.';
      if (landButton && !arrived) landButton.textContent = `Fly ${Math.round((distance / targetDistance) * 100)}%`;
    },
    setAnswered(answered) {
      const stateEl = shell?.querySelector('[data-game-question-state]');
      if (stateEl && arrived) stateEl.textContent = answered ? '⭐ Nice! Save your answer to unlock the next flight.' : 'You reached the gate.';
    },
    destroy() {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      cleanup.forEach((remove) => remove());
      renderer.dispose();
    }
  };
}
