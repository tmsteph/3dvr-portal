const canvas = document.querySelector('#skyCanvas');
const ctx = canvas.getContext('2d');
const slider = document.querySelector('#timeSlider');
const sliderTime = document.querySelector('#sliderTime');
const sceneMood = document.querySelector('#sceneMood');
const daylightStatus = document.querySelector('#daylightStatus');
const daylightCopy = document.querySelector('#daylightCopy');
const sun = document.querySelector('#sun');
const moon = document.querySelector('#moon');
const sceneCard = document.querySelector('.scene-card');
const fullscreenButton = document.querySelector('#fullscreenButton');
const ambientModes = [['Still air', 'A quiet sky for focused work.'], ['Soft breeze', 'A little movement to loosen the room.'], ['Night watch', 'Dim the room and let your attention settle.']];
const stars = Array.from({ length: 80 }, (_, i) => ({
  x: (i * 97) % 1000 / 1000,
  y: (i * 53) % 550 / 550,
  radius: 0.3 + ((i * 17) % 11) / 10,
}));
let mode = 0;
let live = true;
let customMinutes = 0;
let resetTimer;

const pad = n => String(n).padStart(2, '0');
const clock = m => {
  m = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), min = m % 60;
  return `${pad((h % 12) || 12)}:${pad(min)} ${h < 12 ? 'AM' : 'PM'}`;
};
const phase = m => {
  if (m < 330 || m >= 1260) return ['Night sky', 'Rest your eyes in the dark.'];
  if (m < 420) return ['First light', 'The day is arriving slowly.'];
  if (m < 630) return ['Morning', 'A clean beginning, even indoors.'];
  if (m < 930) return ['High daylight', 'Open, bright, and wide.'];
  if (m < 1110) return ['Golden hour', 'Warm light for the last stretch.'];
  return ['Blue hour', 'The world is turning quiet.'];
};
function resize() {
  const d = devicePixelRatio || 1, r = canvas.getBoundingClientRect();
  canvas.width = r.width * d;
  canvas.height = r.height * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
function paint(m) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const day = daylight(m);
  const top = `hsl(${205 - day * 18} ${40 + day * 25}% ${18 + day * 55}%)`;
  const bottom = `hsl(${195 - day * 18} ${30 + day * 38}% ${18 + day * 48}%)`;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Stars belong to the dark sky: they fade out continuously as daylight rises.
  const starAlpha = Math.pow(1 - day, 1.7) * 0.78;
  ctx.globalAlpha = starAlpha;
  ctx.fillStyle = '#fff';
  for (const star of stars) {
    ctx.beginPath();
    ctx.arc(star.x * w, star.y * h * 0.55, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const horizon = h * .77;
  ctx.fillStyle = day > .1 ? '#24483d' : '#101d2b';
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 40) ctx.lineTo(x, horizon - 20 - Math.sin(x / 95) * 20 - (x % 120));
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.fillStyle = day > .1 ? '#17352f' : '#0c1821';
  for (let x = -20; x < w + 40; x += 55) {
    const ht = 28 + (x * 13 % 65);
    ctx.beginPath();
    ctx.moveTo(x, horizon + 22);
    ctx.lineTo(x + 22, horizon - ht);
    ctx.lineTo(x + 44, horizon + 22);
    ctx.fill();
  }
  ctx.globalAlpha = .22;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse((i * 280 + 80 + (m / 5)) % (w + 260) - 130, h * (.26 + i * .08), 115, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function daylight(m) {
  return Math.max(0, Math.sin((m - 360) / 900 * Math.PI));
}
function update(m) {
  customMinutes = m;
  slider.value = m;
  sliderTime.textContent = clock(m);
  const [mood, copy] = phase(m);
  sceneMood.textContent = mood;
  daylightStatus.textContent = m < 360 || m > 1200 ? 'The stars are out' : `${Math.round(daylight(m) * 100)}% daylight`;
  daylightCopy.textContent = copy;
  const angle = (m - 360) / 900 * Math.PI;
  const x = 50 + Math.cos(angle) * 42, y = 51 - Math.sin(angle) * 40;
  sun.style.left = `${x}%`;
  sun.style.top = `${y}%`;
  sun.style.opacity = m > 330 && m < 1260 ? '1' : '0';
  moon.style.left = `${50 + Math.cos(angle + Math.PI) * 42}%`;
  moon.style.top = `${51 - Math.sin(angle + Math.PI) * 40}%`;
  moon.style.opacity = m <= 330 || m >= 1260 ? '1' : '0';
  paint(m);
}
function tick() {
  const now = new Date();
  document.querySelector('#timeLabel').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  document.querySelector('#dateLabel').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  if (live) update(now.getHours() * 60 + now.getMinutes());
  requestAnimationFrame(tick);
}
slider.addEventListener('input', e => { live = false; update(Number(e.target.value)); });
document.querySelector('#liveButton').addEventListener('click', () => { live = true; document.querySelector('#liveButton').textContent = 'Following live time'; });
document.querySelectorAll('[data-time]').forEach(b => b.addEventListener('click', () => { live = false; update(Number(b.dataset.time)); }));
fullscreenButton.addEventListener('click', async () => { if (document.fullscreenElement) { await document.exitFullscreen(); return; } if (sceneCard.requestFullscreen) await sceneCard.requestFullscreen(); });
document.addEventListener('fullscreenchange', () => { const active = document.fullscreenElement === sceneCard; fullscreenButton.textContent = active ? 'Exit full screen' : '⛶ Full screen'; fullscreenButton.setAttribute('aria-pressed', String(active)); setTimeout(() => { resize(); update(customMinutes); }, 50); });
document.querySelector('#ambientButton').addEventListener('click', () => { mode = (mode + 1) % ambientModes.length; document.querySelector('#ambientLabel').textContent = ambientModes[mode][0]; document.querySelector('#ambientCopy').textContent = ambientModes[mode][1]; document.body.dataset.ambient = mode; });
document.querySelector('#resetButton').addEventListener('click', () => { clearInterval(resetTimer); let left = 20; document.querySelector('#resetStatus').textContent = `Look at the horizon. ${left}s`; resetTimer = setInterval(() => { left -= 1; document.querySelector('#resetStatus').textContent = left ? `Look at the horizon. ${left}s` : 'Reset complete — welcome back.'; if (!left) clearInterval(resetTimer); }, 1000); });
window.addEventListener('resize', () => { resize(); update(customMinutes); });
resize();
tick();
