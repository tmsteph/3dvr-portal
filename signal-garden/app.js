import {
  advancePlayer,
  collectNearbyNodes,
  computeGardenGrade,
  createGardenNodes,
} from './game-state.js';

const canvas = document.querySelector('#gardenCanvas');
const context = canvas.getContext('2d');
const overlay = document.querySelector('[data-overlay]');
const startButton = document.querySelector('[data-start]');
const overlayCopy = document.querySelector('[data-overlay-copy]');
const scoreElement = document.querySelector('[data-score]');
const sparksElement = document.querySelector('[data-sparks]');
const timeElement = document.querySelector('[data-time]');
const gradeElement = document.querySelector('[data-grade]');
const controlButtons = [...document.querySelectorAll('.signal-controls button')];

const input = {
  up: false,
  right: false,
  down: false,
  left: false,
  boost: false,
};

const game = {
  status: 'idle',
  width: 1,
  height: 1,
  startedAt: 0,
  elapsed: 0,
  score: 0,
  collected: 0,
  combo: 0,
  lastCollectTime: -Infinity,
  nodes: [],
  trails: [],
  player: {
    x: 0,
    y: 0,
    radius: 14,
    speed: 235,
  },
  pointerTarget: null,
};

const duration = 60;
let lastFrame = performance.now();

function resizeCanvas() {
  const pixelRatio = window.devicePixelRatio || 1;
  game.width = window.innerWidth;
  game.height = window.innerHeight;
  canvas.width = Math.round(game.width * pixelRatio);
  canvas.height = Math.round(game.height * pixelRatio);
  canvas.style.width = `${game.width}px`;
  canvas.style.height = `${game.height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  if (game.status === 'idle') {
    resetGame();
  } else {
    game.player.x = Math.min(game.player.x, game.width - game.player.radius);
    game.player.y = Math.min(game.player.y, game.height - game.player.radius);
  }
}

function resetGame() {
  const seed = Math.floor(Date.now() / 1000) % 100000;
  game.elapsed = 0;
  game.score = 0;
  game.collected = 0;
  game.combo = 0;
  game.lastCollectTime = -Infinity;
  game.trails = [];
  game.pointerTarget = null;
  game.player = {
    x: game.width / 2,
    y: game.height / 2,
    radius: 14,
    speed: Math.min(275, Math.max(210, game.width * 0.16)),
  };
  game.nodes = createGardenNodes({
    count: game.width < 680 ? 15 : 22,
    width: game.width,
    height: game.height,
    margin: game.width < 680 ? 68 : 96,
    seed,
  });
  updateHud();
}

function startGame() {
  resetGame();
  game.status = 'running';
  game.startedAt = performance.now();
  overlay.hidden = true;
  lastFrame = performance.now();
}

function finishGame() {
  game.status = 'complete';
  overlay.hidden = false;
  const grade = computeGardenGrade(game.score, game.collected, game.nodes.length);
  overlayCopy.textContent = `${grade} field. Score ${game.score}. ${game.collected}/${game.nodes.length} sparks.`;
  startButton.textContent = 'Again';
}

function updateHud() {
  scoreElement.textContent = String(game.score);
  sparksElement.textContent = `${game.collected}/${game.nodes.length}`;
  timeElement.textContent = String(Math.max(0, Math.ceil(duration - game.elapsed)));
  gradeElement.textContent = computeGardenGrade(game.score, game.collected, game.nodes.length);
}

function updatePointerInput(deltaSeconds) {
  if (!game.pointerTarget) return;

  const dx = game.pointerTarget.x - game.player.x;
  const dy = game.pointerTarget.y - game.player.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 4) return;

  const speed = game.player.speed * (input.boost ? 1.55 : 1) * deltaSeconds;
  const step = Math.min(distance, speed);
  game.player.x += (dx / distance) * step;
  game.player.y += (dy / distance) * step;
}

function updateGame(deltaSeconds, now) {
  if (game.status !== 'running') return;

  game.elapsed = (now - game.startedAt) / 1000;
  if (game.pointerTarget) {
    updatePointerInput(deltaSeconds);
  } else {
    game.player = advancePlayer(game.player, input, deltaSeconds, {
      width: game.width,
      height: game.height,
    });
  }

  const collection = collectNearbyNodes(game.player, game.nodes, {
    collectionRadius: input.boost ? 34 : 27,
    time: game.elapsed,
    comboWindow: 1.35,
    lastCollectTime: game.lastCollectTime,
    combo: game.combo,
  });

  if (collection.collected > 0) {
    const collectedNodes = collection.nodes.filter((node, index) => !node.active && game.nodes[index].active);
    collectedNodes.forEach((node) => {
      game.trails.push({
        x: node.x,
        y: node.y,
        age: 0,
        life: 1.2,
      });
    });
    game.nodes = collection.nodes;
    game.score += collection.score;
    game.collected += collection.collected;
    game.combo = collection.combo;
    game.lastCollectTime = collection.lastCollectTime;
  }

  game.trails = game.trails
    .map((trail) => ({ ...trail, age: trail.age + deltaSeconds }))
    .filter((trail) => trail.age < trail.life);

  updateHud();

  if (game.elapsed >= duration || game.collected >= game.nodes.length) {
    finishGame();
  }
}

function drawBackground(now) {
  const pulse = Math.sin(now * 0.0004) * 0.5 + 0.5;
  const gradient = context.createLinearGradient(0, 0, game.width, game.height);
  gradient.addColorStop(0, '#07101a');
  gradient.addColorStop(0.46, '#102a2f');
  gradient.addColorStop(1, '#281a2a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, game.width, game.height);

  context.save();
  context.globalAlpha = 0.14 + pulse * 0.05;
  context.strokeStyle = '#b7f0d0';
  context.lineWidth = 1;
  const spacing = game.width < 680 ? 44 : 58;
  const offset = (now * 0.012) % spacing;
  for (let x = -spacing + offset; x < game.width + spacing; x += spacing) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + game.height * 0.24, game.height);
    context.stroke();
  }
  for (let y = -spacing + offset; y < game.height + spacing; y += spacing) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(game.width, y - game.width * 0.16);
    context.stroke();
  }
  context.restore();
}

function drawConnections() {
  const collected = game.nodes.filter((node) => !node.active);
  if (collected.length < 2) return;

  context.save();
  context.strokeStyle = 'rgba(214, 243, 109, 0.42)';
  context.lineWidth = 2;
  context.beginPath();
  collected.forEach((node, index) => {
    if (index === 0) {
      context.moveTo(node.x, node.y);
    } else {
      context.lineTo(node.x, node.y);
    }
  });
  context.stroke();
  context.restore();
}

function drawNodes(now) {
  game.nodes.forEach((node) => {
    const wave = Math.sin(now * 0.003 * node.pulse + node.x * 0.02) * 0.5 + 0.5;
    const radius = node.radius + wave * 4;

    context.save();
    context.globalAlpha = node.active ? 1 : 0.24;
    context.beginPath();
    context.fillStyle = node.active ? '#d6f36d' : '#a6c7ba';
    context.shadowBlur = node.active ? 24 : 8;
    context.shadowColor = node.active ? '#d6f36d' : '#8bb6ad';
    context.arc(node.x, node.y, radius, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = node.active ? 0.22 : 0.08;
    context.beginPath();
    context.arc(node.x, node.y, radius * 2.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
}

function drawTrails() {
  game.trails.forEach((trail) => {
    const progress = trail.age / trail.life;
    context.save();
    context.globalAlpha = 1 - progress;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(trail.x, trail.y, 18 + progress * 52, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  });
}

function drawPlayer(now) {
  const pulse = Math.sin(now * 0.008) * 0.5 + 0.5;
  context.save();
  context.translate(game.player.x, game.player.y);
  context.rotate(now * 0.002);
  context.shadowBlur = input.boost ? 34 : 22;
  context.shadowColor = input.boost ? '#f2a65a' : '#68e8ff';
  context.fillStyle = input.boost ? '#f2a65a' : '#68e8ff';
  context.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6;
    const radius = i % 2 === 0 ? game.player.radius + 7 + pulse * 3 : game.player.radius - 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.restore();
}

function draw(now) {
  drawBackground(now);
  drawConnections();
  drawNodes(now);
  drawTrails();
  drawPlayer(now);
}

function frame(now) {
  const deltaSeconds = Math.min(0.04, (now - lastFrame) / 1000);
  lastFrame = now;
  updateGame(deltaSeconds, now);
  draw(now);
  requestAnimationFrame(frame);
}

function setDirection(direction, active) {
  input[direction] = active;
  document.querySelector(`[data-dir="${direction}"]`)?.setAttribute('data-active', String(active));
}

function bindControls() {
  const keyMap = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
  };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      input.boost = true;
      document.querySelector('[data-boost]')?.setAttribute('data-active', 'true');
      event.preventDefault();
      return;
    }
    const direction = keyMap[event.code];
    if (direction) {
      game.pointerTarget = null;
      setDirection(direction, true);
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      input.boost = false;
      document.querySelector('[data-boost]')?.setAttribute('data-active', 'false');
      return;
    }
    const direction = keyMap[event.code];
    if (direction) {
      setDirection(direction, false);
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (game.status !== 'running') return;
    canvas.setPointerCapture(event.pointerId);
    game.pointerTarget = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener('pointermove', (event) => {
    if (game.status !== 'running' || !game.pointerTarget) return;
    game.pointerTarget = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener('pointerup', () => {
    game.pointerTarget = null;
  });

  controlButtons.forEach((button) => {
    const direction = button.dataset.dir;
    const isBoost = Object.hasOwn(button.dataset, 'boost');
    const setActive = (active) => {
      if (direction) setDirection(direction, active);
      if (isBoost) {
        input.boost = active;
        button.setAttribute('data-active', String(active));
      }
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      game.pointerTarget = null;
      setActive(true);
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointerup', () => setActive(false));
    button.addEventListener('pointercancel', () => setActive(false));
    button.addEventListener('pointerleave', () => setActive(false));
  });

  startButton.addEventListener('click', startGame);
  window.addEventListener('resize', resizeCanvas);
}

resizeCanvas();
bindControls();
requestAnimationFrame(frame);
