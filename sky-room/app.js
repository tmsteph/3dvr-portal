const canvas = document.querySelector('#skyCanvas');
const ctx = canvas.getContext('2d');
const slider = document.querySelector('#timeSlider');
const sliderTime = document.querySelector('#sliderTime');
const sceneMood = document.querySelector('#sceneMood');
const sceneLocation = document.querySelector('#sceneLocation');
const sceneDetails = document.querySelector('#sceneDetails');
const daylightStatus = document.querySelector('#daylightStatus');
const daylightCopy = document.querySelector('#daylightCopy');
const sun = document.querySelector('#sun');
const moon = document.querySelector('#moon');
const sceneCard = document.querySelector('.scene-card');
const fullscreenButton = document.querySelector('#fullscreenButton');
const locationButton = document.querySelector('#locationButton');
const biomeSelect = document.querySelector('#biomeSelect');
const ambientModes = [['Still air', 'A quiet sky for focused work.'], ['Soft breeze', 'A little movement to loosen the room.'], ['Night watch', 'Dim the room and let your attention settle.']];
// A small bright-star catalog. RA is hours, declination is degrees. The
// horizontal projection below makes these move with the observer's sky.
const starCatalog = [
  ['Sirius', 6.752, -16.72, 1.5], ['Canopus', 6.399, -52.70, 1.2], ['Arcturus', 14.261, 19.18, 1.35],
  ['Vega', 18.615, 38.78, 1.25], ['Capella', 5.278, 45.99, 1.2], ['Rigel', 5.242, -8.20, 1.15],
  ['Procyon', 7.655, 5.23, 1.15], ['Betelgeuse', 5.919, 7.41, 1.1], ['Achernar', 1.629, -57.24, 1.1],
  ['Altair', 19.846, 8.87, 1.1], ['Aldebaran', 4.599, 16.51, 1.05], ['Antares', 16.49, -26.43, 1.05],
  ['Spica', 13.42, -11.16, 1], ['Pollux', 7.755, 28.03, .95], ['Fomalhaut', 22.961, -29.62, .95],
  ['Deneb', 20.69, 45.28, .95], ['Regulus', 10.14, 11.97, .9], ['Castor', 7.577, 31.89, .85],
  ['Polaris', 2.53, 89.26, .85], ['Bellatrix', 5.419, 6.35, .8], ['Alnilam', 5.603, -1.20, .8],
  ['Alnitak', 5.679, -1.94, .8], ['Mintaka', 5.533, -0.30, .78], ['Mimosa', 12.795, -59.69, .85],
  ['Hadar', 14.064, -60.37, .85], ['Shaula', 17.56, -37.10, .8], ['Dubhe', 11.062, 61.75, .75],
  ['Merak', 11.031, 56.38, .72], ['Alioth', 12.9, 55.96, .7], ['Alkaid', 13.792, 49.31, .7],
  ['Denebola', 11.818, 14.57, .7], ['Kochab', 14.845, 74.16, .68], ['Markab', 23.079, 15.21, .68],
  ['Mirach', 1.162, 35.62, .65], ['Alpheratz', .139, 29.09, .65]
].map(([name, ra, dec, radius]) => ({ name, ra, dec: dec * Math.PI / 180, radius }));
const constellationLines = {
  Orion: [['Betelgeuse', 'Bellatrix'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'], ['Alnitak', 'Betelgeuse'], ['Betelgeuse', 'Alnilam'], ['Bellatrix', 'Rigel'], ['Rigel', 'Mintaka']],
  'Big Dipper': [['Dubhe', 'Merak'], ['Merak', 'Alioth'], ['Alioth', 'Alkaid']],
  'Summer Triangle': [['Vega', 'Deneb'], ['Deneb', 'Altair'], ['Altair', 'Vega']]
};
const stars = Array.from({ length: 110 }, (_, i) => ({ x: (i * 97) % 1000 / 1000, y: (i * 53) % 900 / 900, radius: 0.3 + ((i * 17) % 11) / 10 }));
const DEFAULT_LATITUDE = 32.72;
const DEFAULT_LONGITUDE = -117.16;
let mode = 0;
let live = true;
let customMinutes = 0;
let resetTimer;
let latitude = null;
let longitude = null;
let weather = null;
let sunriseMinutes = 360;
let sunsetMinutes = 1260;
let biome = 'Temperate woodland';
let biomeMode = 'auto';

const pad = n => String(n).padStart(2, '0');
const clock = m => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), min = m % 60; return `${pad((h % 12) || 12)}:${pad(min)} ${h < 12 ? 'AM' : 'PM'}`; };
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const minutesFromIso = iso => { const match = String(iso).match(/T(\d\d):(\d\d)/); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };
const dateForMinutes = m => { const date = new Date(); date.setHours(Math.floor(m / 60), m % 60, 0, 0); return date; };
const julianDay = date => date.getTime() / 86400000 + 2440587.5;
const moonAge = date => { const age = (julianDay(date) - 2451550.1) % 29.530588853; return (age + 29.530588853) % 29.530588853; };
const siderealHours = date => { const d = julianDay(date) - 2451545; return ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24; };
function projectStar(star, date, lat, lon, w, h) {
  const ha = (siderealHours(date) + lon / 15 - star.ra) * Math.PI / 12;
  const altitude = Math.asin(Math.sin(lat) * Math.sin(star.dec) + Math.cos(lat) * Math.cos(star.dec) * Math.cos(ha));
  if (altitude < -0.08) return null;
  const azimuth = Math.atan2(-Math.sin(ha), Math.tan(star.dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
  return { x: w * (.5 + azimuth / (Math.PI * 2)), y: h * (.72 - altitude / Math.PI * 1.25), radius: star.radius };
}
function moonPhaseLabel(age) { return age < 1.85 ? 'New moon' : age < 5.53 ? 'Waxing crescent' : age < 9.22 ? 'First quarter' : age < 12.91 ? 'Waxing gibbous' : age < 16.61 ? 'Full moon' : age < 20.30 ? 'Waning gibbous' : age < 23.99 ? 'Last quarter' : age < 27.68 ? 'Waning crescent' : 'New moon'; }
const seasonFor = (date = new Date(), lat = latitude) => {
  const month = date.getMonth();
  const northern = lat == null || lat >= 0;
  const north = month <= 1 || month === 11 ? 'Winter' : month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : month <= 10 ? 'Autumn' : 'Winter';
  const south = month <= 1 || month === 11 ? 'Summer' : month <= 4 ? 'Autumn' : month <= 7 ? 'Winter' : 'Spring';
  return northern ? north : south;
};
const seasonProfile = season => ({
  Spring: { forest: '#285446', trees: '#1f4036', accent: '#9ccf91' },
  Summer: { forest: '#24483d', trees: '#17352f', accent: '#b2d98e' },
  Autumn: { forest: '#4b4031', trees: '#302b25', accent: '#d8955f' },
  Winter: { forest: '#34484a', trees: '#263639', accent: '#c7d8d5' },
}[season] || { forest: '#24483d', trees: '#17352f', accent: '#b2d98e' });
const weatherLabel = code => code == null ? 'weather off' : code === 0 ? 'clear' : code <= 3 ? 'partly cloudy' : code <= 48 ? 'misty' : code <= 67 ? 'rain nearby' : code <= 77 ? 'snow nearby' : code <= 82 ? 'showers nearby' : 'stormy';
const isRainy = code => code >= 51 && code <= 82;
const biomeProfile = name => ({
  'Tropical forest': { forest: '#1d5948', trees: '#123c32', accent: '#8bd39c', animal: 'monkey' },
  'Desert': { forest: '#806246', trees: '#584838', accent: '#edc77e', animal: 'fox' },
  'Grassland': { forest: '#46613b', trees: '#304b32', accent: '#d6c879', animal: 'rabbit' },
  'Boreal forest': { forest: '#34484a', trees: '#263639', accent: '#c7d8d5', animal: 'deer' },
  'Tundra': { forest: '#506771', trees: '#354a52', accent: '#d5e8e7', animal: 'fox' },
}[name] || { forest: '#285446', trees: '#1f4036', accent: '#9ccf91', animal: 'deer' });
const biomeFor = (lat, currentWeather = weather) => {
  if (lat == null) return 'Temperate woodland';
  const absLat = Math.abs(lat);
  const temp = Number(currentWeather?.temperature);
  const cloud = Number(currentWeather?.cloud);
  if (absLat >= 66) return 'Tundra';
  if (absLat < 23.5 && (Number.isNaN(temp) || temp >= 68)) return 'Tropical forest';
  if (absLat >= 42 && !Number.isNaN(temp) && temp < 52) return 'Boreal forest';
  if (absLat >= 15 && absLat <= 38 && !Number.isNaN(temp) && temp >= 68 && (Number.isNaN(cloud) || cloud < 35)) return 'Desert';
  if (absLat >= 20 && absLat <= 55 && (currentWeather?.code == null || !isRainy(currentWeather.code))) return 'Grassland';
  return 'Temperate woodland';
};
function updateBiomeLabel() {
  sceneLocation.textContent = biomeMode === 'auto'
    ? (latitude == null ? 'Automatic region · location off' : `Local sky · ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`)
    : `Selected biome · ${biome}`;
}
const phase = m => {
  if (m < sunriseMinutes - 30 || m >= sunsetMinutes + 60) return ['Night sky', 'Rest your eyes in the dark.'];
  if (m < sunriseMinutes + 60) return ['First light', 'The day is arriving slowly.'];
  if (m < sunriseMinutes + 270) return ['Morning', 'A clean beginning, even indoors.'];
  if (m < sunsetMinutes - 150) return ['High daylight', 'Open, bright, and wide.'];
  if (m < sunsetMinutes - 30) return ['Golden hour', 'Warm light for the last stretch.'];
  return ['Blue hour', 'The world is turning quiet.'];
};
function resize() {
  const d = devicePixelRatio || 1, r = canvas.getBoundingClientRect();
  canvas.width = r.width * d; canvas.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
}
function daylight(m) {
  const span = Math.max(1, sunsetMinutes - sunriseMinutes);
  return clamp(Math.sin((m - sunriseMinutes) / span * Math.PI));
}
function twilightWarmth(m) {
  const sunrise = clamp(1 - Math.abs(m - (sunriseMinutes + 30)) / 105);
  const sunset = clamp(1 - Math.abs(m - (sunsetMinutes - 35)) / 165);
  return Math.max(sunrise, sunset);
}
function drawAnimal(x, y, scale, type, motion) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = '#17251f'; ctx.strokeStyle = '#17251f'; ctx.lineWidth = 2;
  const bob = Math.sin(motion * 2.2) * 1.5;
  if (type === 'deer') {
    ctx.beginPath(); ctx.ellipse(0, bob, 25, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(17, -5 + bob); ctx.lineTo(28, -19 + bob); ctx.lineTo(38, -21 + bob); ctx.lineTo(42, -13 + bob); ctx.lineTo(29, -8 + bob); ctx.fill();
    for (const leg of [-14, -3, 10, 18]) { ctx.beginPath(); ctx.moveTo(leg, 7 + bob); ctx.lineTo(leg - 2, 28); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(34, -18 + bob); ctx.lineTo(30, -31 + bob); ctx.moveTo(35, -19 + bob); ctx.lineTo(40, -31 + bob); ctx.stroke();
  } else if (type === 'rabbit') {
    ctx.beginPath(); ctx.ellipse(0, 4 + bob, 18, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(17, -4 + bob, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(14, -20 + bob, 4, 13, -.15, 0, Math.PI * 2); ctx.ellipse(22, -20 + bob, 4, 13, .15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-17, 1 + bob, 6, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'fox') {
    ctx.beginPath(); ctx.ellipse(0, 3 + bob, 25, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(20, 0 + bob); ctx.lineTo(37, -10 + bob); ctx.lineTo(32, 3 + bob); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-19, 0 + bob); ctx.quadraticCurveTo(-43, -17 + bob, -40, 11 + bob); ctx.quadraticCurveTo(-28, 4 + bob, -19, 7 + bob); ctx.fill();
    for (const leg of [-13, 5, 14]) { ctx.beginPath(); ctx.moveTo(leg, 9 + bob); ctx.lineTo(leg - 2, 25); ctx.stroke(); }
  } else if (type === 'monkey') {
    ctx.beginPath(); ctx.ellipse(0, 2 + bob, 14, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(16, -12 + bob, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(17, -13 + bob, 4, 0, Math.PI * 2); ctx.fill(); ctx.moveTo(-10, -6 + bob); ctx.quadraticCurveTo(-35, -25 + bob, -27, -43 + bob); ctx.stroke();
    for (const arm of [-9, 9]) { ctx.beginPath(); ctx.moveTo(arm, -1 + bob); ctx.lineTo(arm + (arm < 0 ? -10 : 10), 18); ctx.stroke(); }
  } else {
    ctx.beginPath(); ctx.arc(0, 1 + bob, 13, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(17, -8 + bob, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -18 + bob, 5, 0, Math.PI * 2); ctx.arc(23, -18 + bob, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-10, -5 + bob); ctx.quadraticCurveTo(-35, -28 + bob, -30, 5 + bob); ctx.stroke();
  }
  ctx.restore();
}
function drawWildlife(w, h, day, motion, season) {
  const profile = seasonProfile(season);
  if (day > .12) {
    ctx.strokeStyle = '#18232a'; ctx.lineWidth = 1.5; ctx.globalAlpha = .55;
    for (let i = 0; i < 4; i++) {
      const x = ((motion * (16 + i * 2) + i * 155) % (w + 180)) - 90;
      const y = h * (.25 + i * .07) + Math.sin(motion * 1.3 + i) * 7;
      ctx.beginPath(); ctx.arc(x, y, 7, Math.PI * 1.08, Math.PI * 1.92); ctx.arc(x + 13, y, 7, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    }
  }
  if (day > .02 && day < .42 && season !== 'Winter') {
    ctx.fillStyle = profile.accent;
    for (let i = 0; i < 5; i++) {
      const x = ((motion * (7 + i) + i * 121) % (w + 30)) - 15;
      const y = h * (.67 + (i % 3) * .035) + Math.sin(motion * 2 + i) * 9;
      ctx.globalAlpha = .35 + Math.sin(motion * 3 + i) * .15;
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (day > .08 && day < .9) {
    const animalProfile = biomeProfile(biome);
    const x = ((motion * 3.5 + 170) % (w + 240)) - 120;
    const y = h * .78;
    ctx.globalAlpha = .72;
    drawAnimal(x, y, Math.max(.55, Math.min(1, w / 900)), animalProfile.animal, motion);
  }
  ctx.globalAlpha = 1;
}
function drawCelestialSky(w, h, day, date) {
  const lat = (latitude ?? DEFAULT_LATITUDE) * Math.PI / 180, lon = longitude ?? DEFAULT_LONGITUDE;
  const opacity = Math.pow(1 - day, 1.7) * .82;
  ctx.globalAlpha = opacity; ctx.fillStyle = '#fff';
  for (const star of stars) { ctx.beginPath(); ctx.arc(star.x * w, star.y * h * .9, star.radius, 0, Math.PI * 2); ctx.fill(); }
  const projected = Object.fromEntries(starCatalog.map(star => [star.name, projectStar(star, date, lat, lon, w, h)]));
  for (const star of Object.values(projected)) if (star) { ctx.beginPath(); ctx.arc(star.x, star.y, star.radius + .45, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = opacity * .34; ctx.strokeStyle = '#b8d8ee'; ctx.lineWidth = 1;
  for (const lines of Object.values(constellationLines)) for (const [from, to] of lines) {
    const a = projected[from], b = projected[to]; if (!a || !b) continue;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawMoon(m, date) {
  const age = moonAge(date), illumination = (1 - Math.cos(age / 29.530588853 * Math.PI * 2)) / 2;
  const x = 50 + Math.cos((m - sunriseMinutes) / Math.max(1, sunsetMinutes - sunriseMinutes) * Math.PI + Math.PI) * 42;
  const y = 51 - Math.sin((m - sunriseMinutes) / Math.max(1, sunsetMinutes - sunriseMinutes) * Math.PI + Math.PI) * 40;
  moon.textContent = illumination < .08 ? '○' : illumination > .92 ? '●' : illumination < .5 ? '◐' : '◑';
  moon.title = `${moonPhaseLabel(age)} · ${Math.round(illumination * 100)}% illuminated`;
  moon.setAttribute('aria-label', moon.title); moon.style.left = `${x}%`; moon.style.top = `${y}%`; moon.style.opacity = '1';
}
function paint(m) {
  const w = canvas.clientWidth, h = canvas.clientHeight, day = daylight(m), warmth = twilightWarmth(m), season = seasonFor(), date = dateForMinutes(m);
  const profile = biomeProfile(biome), topHue = 205 - day * 18 + (18 - (205 - day * 18)) * warmth, bottomHue = 195 - day * 18 + (10 - (195 - day * 18)) * warmth;
  const top = `hsl(${topHue} ${40 + day * 25 + warmth * 28}% ${18 + day * 55 - warmth * 5}%)`, bottom = `hsl(${bottomHue} ${30 + day * 38 + warmth * 32}% ${18 + day * 48 - warmth * 4}%)`;
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (warmth > 0) { const glow = ctx.createRadialGradient(w * .52, h * .76, 0, w * .52, h * .76, h * .72); glow.addColorStop(0, `rgba(255, 105, 48, ${warmth * .34})`); glow.addColorStop(1, 'rgba(255, 105, 48, 0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h); }
  drawCelestialSky(w, h, day, date);
  const horizon = h * .77; ctx.fillStyle = profile.forest; ctx.beginPath(); ctx.moveTo(0, horizon); for (let x = 0; x <= w; x += 40) ctx.lineTo(x, horizon - 20 - Math.sin(x / 95) * 20 - (x % 120)); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  ctx.fillStyle = profile.trees; for (let x = -20; x < w + 40; x += 55) { const ht = 28 + (x * 13 % 65); ctx.beginPath(); ctx.moveTo(x, horizon + 22); ctx.lineTo(x + 22, horizon - ht); ctx.lineTo(x + 44, horizon + 22); ctx.fill(); }
  ctx.globalAlpha = .22; ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse((i * 280 + 80 + (performance.now() / 150)) % (w + 260) - 130, h * (.26 + i * .08), 115, 18, 0, 0, Math.PI * 2); ctx.fill(); }
  if (isRainy(weather?.code)) { ctx.globalAlpha = .16; ctx.strokeStyle = '#d9efff'; ctx.lineWidth = 1; for (let i = 0; i < 24; i++) { const x = (i * 73 + performance.now() / 8) % w; const y = (i * 31) % (h * .7); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 12); ctx.stroke(); } }
  ctx.globalAlpha = 1; drawWildlife(w, h, day, performance.now() / 1000, season);
}
function update(m) {
  customMinutes = m; slider.value = m; sliderTime.textContent = clock(m);
  const [mood, copy] = phase(m), season = seasonFor(); sceneMood.textContent = mood; daylightStatus.textContent = m < sunriseMinutes || m > sunsetMinutes ? 'The stars are out' : `${Math.round(daylight(m) * 100)}% daylight`; daylightCopy.textContent = copy;
  sceneDetails.textContent = `${season} · ${biome}${weather ? ` · ${weatherLabel(weather.code)} · ${Math.round(weather.temperature)}°F` : biomeMode === 'auto' ? ' · region adapts when location is on' : ' · manual scene'} · ${moonPhaseLabel(moonAge(dateForMinutes(m)))}`;
  const span = Math.max(1, sunsetMinutes - sunriseMinutes), angle = (m - sunriseMinutes) / span * Math.PI, x = 50 - Math.cos(angle) * 42, y = 51 - Math.sin(angle) * 40;
  sun.style.left = `${x}%`; sun.style.top = `${y}%`; sun.style.opacity = m >= sunriseMinutes - 30 && m <= sunsetMinutes + 30 ? '1' : '0'; drawMoon(m, dateForMinutes(m)); paint(m);
}
async function useLocalWeather() {
  if (!navigator.geolocation) { sceneDetails.textContent = 'Location unavailable · weather off'; return; }
  locationButton.disabled = true; locationButton.textContent = 'Finding your sky…';
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    try {
      latitude = coords.latitude; longitude = coords.longitude;
      const query = new URLSearchParams({ latitude, longitude, current: 'temperature_2m,weather_code,wind_speed_10m,cloud_cover', daily: 'sunrise,sunset', timezone: 'auto', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph' });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`); if (!response.ok) throw new Error('weather request failed');
      const data = await response.json(); weather = { code: data.current?.weather_code, temperature: data.current?.temperature_2m, wind: data.current?.wind_speed_10m, cloud: data.current?.cloud_cover }; if (biomeMode === 'auto') biome = biomeFor(latitude, weather);
      sunriseMinutes = minutesFromIso(data.daily?.sunrise?.[0]) ?? sunriseMinutes; sunsetMinutes = minutesFromIso(data.daily?.sunset?.[0]) ?? sunsetMinutes;
      updateBiomeLabel(); locationButton.textContent = 'Local weather on'; locationButton.disabled = false; update(customMinutes);
    } catch { sceneDetails.textContent = 'Weather unavailable · seasonal sky continues'; locationButton.textContent = 'Try local weather again'; locationButton.disabled = false; }
  }, () => { sceneDetails.textContent = 'Location declined · seasonal sky continues'; locationButton.textContent = 'Try local weather again'; locationButton.disabled = false; }, { enableHighAccuracy: false, maximumAge: 900000, timeout: 10000 });
}
function tick() { const now = new Date(); document.querySelector('#timeLabel').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); document.querySelector('#dateLabel').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); if (live) update(now.getHours() * 60 + now.getMinutes()); requestAnimationFrame(tick); }
slider.addEventListener('input', e => { live = false; update(Number(e.target.value)); }); document.querySelector('#liveButton').addEventListener('click', () => { live = true; document.querySelector('#liveButton').textContent = 'Following live time'; }); document.querySelectorAll('[data-time]').forEach(b => b.addEventListener('click', () => { live = false; update(Number(b.dataset.time)); })); locationButton.addEventListener('click', useLocalWeather);
biomeSelect.addEventListener('change', event => { biomeMode = event.target.value; biome = biomeMode === 'auto' ? biomeFor(latitude, weather) : biomeMode; updateBiomeLabel(); update(customMinutes); });
fullscreenButton.addEventListener('click', async () => { if (document.fullscreenElement) { await document.exitFullscreen(); return; } if (sceneCard.requestFullscreen) await sceneCard.requestFullscreen(); }); document.addEventListener('fullscreenchange', () => { const active = document.fullscreenElement === sceneCard; fullscreenButton.textContent = active ? 'Exit full screen' : '⛶ Full screen'; fullscreenButton.setAttribute('aria-pressed', String(active)); setTimeout(() => { resize(); update(customMinutes); }, 50); }); document.querySelector('#ambientButton').addEventListener('click', () => { mode = (mode + 1) % ambientModes.length; document.querySelector('#ambientLabel').textContent = ambientModes[mode][0]; document.querySelector('#ambientCopy').textContent = ambientModes[mode][1]; document.body.dataset.ambient = mode; }); document.querySelector('#resetButton').addEventListener('click', () => { clearInterval(resetTimer); let left = 20; document.querySelector('#resetStatus').textContent = `Look at the horizon. ${left}s`; resetTimer = setInterval(() => { left -= 1; document.querySelector('#resetStatus').textContent = left ? `Look at the horizon. ${left}s` : 'Reset complete — welcome back.'; if (!left) clearInterval(resetTimer); }, 1000); }); window.addEventListener('resize', () => { resize(); update(customMinutes); });
resize(); tick();
