import { randomSequence, mandelbulbDistance } from './model.js';

const canvas = document.getElementById('universe');
const context = canvas.getContext('2d');
const power = document.getElementById('power');
const zoom = document.getElementById('zoom');
const timeline = document.getElementById('time');
const run = document.getElementById('run');
const status = document.getElementById('status');
const params = new URLSearchParams(location.search);
const pointers = new Map();
let points = [];
let yaw = readNumber('yaw', 0.4, -Math.PI * 2, Math.PI * 2);
let pitch = readNumber('pitch', 0.2, -Math.PI / 2, Math.PI / 2);
let progress = readNumber('progress', 1, 0, 1);
let running = false;
let previousTime = null;
let frame = 0;
let generation = 0;
let width = 600;
let height = 400;
const initialPower = readNumber('power', 8, 4, 10);
power.value = String([4, 6, 8, 10].includes(initialPower) ? initialPower : 8);
zoom.value = String(readNumber('zoom', 1, 0.6, 5));

function readNumber(key, fallback, minimum, maximum) {
  if (!params.has(key)) return fallback;
  const value = Number(params.get(key));
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function updateLabels() {
  document.getElementById('power-value').value = power.value;
  document.getElementById('zoom-value').value = `${Number(zoom.value).toFixed(1)}×`;
  timeline.value = String(Math.round(progress * 100));
  document.getElementById('time-value').value = `${Math.round(progress * 100)}%`;
}

async function generate() {
  const ticket = ++generation;
  stop();
  run.disabled = true;
  status.textContent = 'Preparing the fractal…';
  const random = randomSequence();
  const next = [];
  const exponent = Number(power.value);
  for (let batch = 0; batch < 30; batch += 1) {
    for (let sample = 0; sample < 2500; sample += 1) {
      const x = (random() * 2 - 1) * 1.3;
      const y = (random() * 2 - 1) * 1.3;
      const z = (random() * 2 - 1) * 1.3;
      const radius = Math.hypot(x, y, z);
      if (radius > 1.5) continue;
      const distance = mandelbulbDistance(x, y, z, exponent);
      if (distance > 0.001 && distance < 0.023) next.push([x, y, z, radius]);
    }
    // Yield between batches so touch controls and paint remain responsive.
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (ticket !== generation) return;
  }
  points = next;
  run.disabled = false;
  updateLabels();
  draw();
  status.textContent = 'Ready · Drag to explore, or run the pulse.';
}

function draw() {
  context.clearRect(0, 0, width, height);
  const scale = Math.min(width, height) * 0.8 * Number(zoom.value);
  const radius = progress * 1.6;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const projected = [];
  for (const point of points) {
    if (point[3] > radius) continue;
    const x = point[0] * cy + point[2] * sy;
    const depth = -point[0] * sy + point[2] * cy;
    const y = point[1] * cp - depth * sp;
    const z = point[1] * sp + depth * cp;
    const perspective = 1 / (3 - z * 0.6);
    projected.push([width / 2 + x * scale * perspective, height / 2 + y * scale * perspective, z, point[3]]);
  }
  projected.sort((a, b) => a[2] - b[2]);
  for (const point of projected) {
    const edge = progress < 1 && Math.abs(point[3] - radius) < 0.1;
    context.fillStyle = edge ? '#fff1c9' : '#85f0de';
    context.globalAlpha = Math.max(0.15, Math.min(1, 0.25 + 0.65 * (point[2] + 1.5) / 3));
    const size = Math.max(1, 1.25 * Number(zoom.value));
    context.fillRect(point[0], point[1], size, size);
  }
  context.globalAlpha = 1;
  if (progress < 1) {
    context.strokeStyle = '#e7bd80';
    context.globalAlpha = 0.55;
    context.beginPath();
    context.arc(width / 2, height / 2, radius * scale / 3, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = '#fff1c9';
    context.beginPath();
    context.arc(width / 2, height / 2, Math.max(1.5, 9 * (1 - progress)), 0, Math.PI * 2);
    context.fill();
  }
}

function stop() {
  running = false;
  cancelAnimationFrame(frame);
  previousTime = null;
  run.textContent = 'Run pulse';
}

function tick(now) {
  if (!running) return;
  if (previousTime !== null) progress = Math.min(1, progress + Math.min(now - previousTime, 100) / 6500);
  previousTime = now;
  updateLabels();
  draw();
  if (progress < 1) frame = requestAnimationFrame(tick);
  else {
    stop();
    status.textContent = 'Pulse complete · The light revealed predefined fractal geometry.';
  }
}

run.addEventListener('click', () => {
  if (running) {
    stop();
    run.textContent = 'Resume pulse';
    status.textContent = 'Paused · Scrub the timeline or explore the scene.';
    return;
  }
  if (progress >= 1) progress = 0;
  running = true;
  previousTime = null;
  run.textContent = 'Pause pulse';
  status.textContent = 'Pulse expanding · Visual experiment, no matter or gravity simulation.';
  frame = requestAnimationFrame(tick);
});
power.addEventListener('change', generate);
zoom.addEventListener('input', () => { updateLabels(); draw(); });
timeline.addEventListener('input', () => {
  stop();
  progress = Number(timeline.value) / 100;
  updateLabels();
  draw();
});
document.getElementById('reset').addEventListener('click', () => {
  yaw = 0.4;
  pitch = 0.2;
  zoom.value = '1';
  updateLabels();
  draw();
});
document.getElementById('share').addEventListener('click', async () => {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ power: power.value, zoom: zoom.value, yaw, pitch, progress })) {
    url.searchParams.set(key, String(value));
  }
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url.href);
    status.textContent = 'Scene link copied · Includes formula, view, zoom, and pulse progress.';
  } catch {
    status.textContent = 'Scene saved in the address bar · Copy that URL to share.';
  }
});

canvas.addEventListener('pointerdown', event => {
  pointers.set(event.pointerId, [event.clientX, event.clientY]);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const next = [event.clientX, event.clientY];
  if (pointers.size === 2) {
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)[1];
    const oldDistance = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
    const newDistance = Math.hypot(next[0] - other[0], next[1] - other[1]);
    if (oldDistance > 0) zoom.value = String(Math.max(0.6, Math.min(5, Number(zoom.value) * newDistance / oldDistance)));
  } else {
    yaw = Math.atan2(Math.sin(yaw + (next[0] - previous[0]) * 0.008), Math.cos(yaw + (next[0] - previous[0]) * 0.008));
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + (next[1] - previous[1]) * 0.008));
  }
  pointers.set(event.pointerId, next);
  updateLabels();
  draw();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, event => pointers.delete(event.pointerId));
}
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  zoom.value = String(Math.max(0.6, Math.min(5, Number(zoom.value) * Math.exp(-event.deltaY * 0.001))));
  updateLabels();
  draw();
}, { passive: false });
canvas.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  yaw += event.key === 'ArrowLeft' ? -0.1 : event.key === 'ArrowRight' ? 0.1 : 0;
  pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + (event.key === 'ArrowUp' ? -0.1 : event.key === 'ArrowDown' ? 0.1 : 0)));
  draw();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) {
    stop();
    run.textContent = 'Resume pulse';
    status.textContent = 'Pulse paused while the page was away.';
  }
});
new ResizeObserver(() => {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}).observe(canvas);
updateLabels();
generate();
