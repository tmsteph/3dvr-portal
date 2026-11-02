const SETTINGS_KEY = 'squatTimer.settings.v1';
const STATS_KEY = 'squatTimer.stats.v1';
const RING_CIRCUMFERENCE = 628.3;

const QUOTES = [
  'Strong legs carry long days. Start with ten.',
  'You sat for this set. Now stand for it.',
  'Ten squats. Two minutes. A different afternoon.',
  'The chair will wait. Your knees are asking nicely.',
  'Small hinge, big signal: I take care of this body.',
  'Future you, at hour nine, says thanks for this one.',
  'Smooth beats fast. Breathe out on the way up.',
  'Nobody in the room knows you just got stronger.',
  'One set is a promise kept. Keep the streak honest.',
  'Stand tall between sets. Crown up, shoulders down.',
  'Ten is small on purpose. Small is how it sticks.',
  'Your legs worked all day holding still. Let them work for real.',
  'Halfway through the shift is exactly when this counts most.',
  'Done is better than perfect. Count it and sit back down proud.'
];

const els = {
  time: document.querySelector('#timerTime'),
  state: document.querySelector('#timerState'),
  next: document.querySelector('#timerNext'),
  ring: document.querySelector('#ringProgress'),
  startPause: document.querySelector('#startPauseButton'),
  reset: document.querySelector('#resetButton'),
  setNow: document.querySelector('#setNowButton'),
  interval: document.querySelector('#intervalSelect'),
  reps: document.querySelector('#repsSelect'),
  sound: document.querySelector('#soundToggle'),
  vibrate: document.querySelector('#vibrateToggle'),
  notifyButton: document.querySelector('#notifyButton'),
  notifyStatus: document.querySelector('#notifyStatus'),
  panel: document.querySelector('#squatPanel'),
  repCount: document.querySelector('#repCount'),
  repTarget: document.querySelector('#repTarget'),
  repDots: document.querySelector('#repDots'),
  repButton: document.querySelector('#repButton'),
  squatNote: document.querySelector('#squatNote'),
  squatTitle: document.querySelector('#squatTitle'),
  log: document.querySelector('#logButton'),
  skip: document.querySelector('#skipButton'),
  statToday: document.querySelector('#statToday'),
  statTodaySquats: document.querySelector('#statTodaySquats'),
  statStreak: document.querySelector('#statStreak'),
  statTotal: document.querySelector('#statTotal'),
  statTotalSquats: document.querySelector('#statTotalSquats'),
  lastDone: document.querySelector('#lastDone'),
  quote: document.querySelector('#quoteText')
};

const fastMode = new URLSearchParams(window.location.search).get('fast') === '1';

function loadJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function saveJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage off: the timer still works for this session.
  }
}

const settings = loadJson(SETTINGS_KEY, { intervalMin: 45, reps: 10, sound: true, vibrate: true });
const stats = loadJson(STATS_KEY, { days: {}, totalSets: 0, totalSquats: 0, lastSetAt: null });

let totalMs = intervalMs();
let remainingMs = totalMs;
let endAt = null;
let tickId = null;
let running = false;
let inSet = false;
let currentReps = 0;
let wakeLock = null;
let audioContext = null;

function intervalMs() {
  return fastMode ? 10 * 1000 : settings.intervalMin * 60 * 1000;
}

function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function render() {
  els.time.textContent = formatTime(remainingMs);
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0;
  els.ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
  if (inSet) {
    els.state.textContent = 'Squat time';
    els.next.textContent = 'timer waits for your legs';
  } else if (running) {
    els.state.textContent = 'Seated work';
    els.next.textContent = 'until squat time';
  } else if (remainingMs < totalMs) {
    els.state.textContent = 'Paused';
    els.next.textContent = 'until squat time';
  } else {
    els.state.textContent = 'Ready when you are';
    els.next.textContent = 'until squat time';
  }
  els.startPause.textContent = running ? 'Pause' : (remainingMs < totalMs && !inSet ? 'Resume' : 'Start');
  els.startPause.disabled = inSet;
  els.reset.disabled = inSet;
  els.setNow.disabled = inSet;
  document.title = running || inSet ? `${formatTime(remainingMs)} · Squat Timer` : 'Squat Timer | 3DVR Portal';
}

function tick() {
  remainingMs = Math.max(0, endAt - Date.now());
  render();
  if (remainingMs <= 0) {
    stopTicking();
    startSet();
  }
}

function startTicking() {
  endAt = Date.now() + remainingMs;
  running = true;
  tickId = window.setInterval(tick, 200);
  requestWakeLock();
  render();
}

function stopTicking() {
  running = false;
  if (tickId) window.clearInterval(tickId);
  tickId = null;
  releaseWakeLock();
  render();
}

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  try {
    wakeLock?.release();
  } catch {
    // Nothing to release.
  }
  wakeLock = null;
}

function chime() {
  if (!settings.sound) return;
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    [523.25, 783.99].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.0001, now + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.22, now + index * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.18 + 0.5);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now + index * 0.18);
      oscillator.stop(now + index * 0.18 + 0.55);
    });
  } catch {
    // Sound is a bonus, never a blocker.
  }
}

function buzz() {
  if (settings.vibrate && navigator.vibrate) {
    navigator.vibrate([180, 90, 180]);
  }
}

function notify() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification('Squat time', {
      body: `${settings.reps} squats. Stand up, you have got this.`,
      tag: 'squat-timer-set'
    });
  } catch {
    // Some browsers require a service worker for notifications; the on-screen alarm still fires.
  }
}

function pickQuote() {
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  els.quote.textContent = quote;
  return quote;
}

function renderStats() {
  const today = stats.days[dayKey()] || { sets: 0, squats: 0 };
  els.statToday.textContent = `${today.sets} ${today.sets === 1 ? 'set' : 'sets'}`;
  els.statTodaySquats.textContent = `${today.squats} squats`;
  const streak = currentStreak();
  els.statStreak.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;
  els.statTotal.textContent = `${stats.totalSets} ${stats.totalSets === 1 ? 'set' : 'sets'}`;
  els.statTotalSquats.textContent = `${stats.totalSquats} squats`;
  if (stats.lastSetAt) {
    const when = new Date(stats.lastSetAt);
    els.lastDone.hidden = false;
    els.lastDone.textContent = `Last set logged ${when.toLocaleDateString()} at ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  }
}

function currentStreak() {
  let streak = 0;
  const cursor = new Date();
  if (!stats.days[dayKey(cursor)]?.sets) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (stats.days[dayKey(cursor)]?.sets) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderReps() {
  els.repCount.textContent = String(currentReps);
  els.repTarget.textContent = `/ ${settings.reps}`;
  els.repDots.innerHTML = '';
  for (let index = 0; index < settings.reps; index += 1) {
    const dot = document.createElement('i');
    if (index < currentReps) dot.className = 'is-done';
    els.repDots.append(dot);
  }
  if (currentReps >= settings.reps) {
    els.squatTitle.textContent = 'That is the set. Nicely done.';
    els.squatNote.textContent = 'Log it, sit back down, and let the timer start the next round.';
    els.log.textContent = 'Log set and restart timer';
  } else if (currentReps > 0) {
    els.squatNote.textContent = `${settings.reps - currentReps} to go. Smooth beats fast.`;
  }
}

function startSet() {
  inSet = true;
  currentReps = 0;
  els.panel.hidden = false;
  els.squatTitle.textContent = `Stand up. ${settings.reps === 10 ? 'Ten' : settings.reps} good ones.`;
  els.squatNote.textContent = 'Chair away, feet flat, hips back. Smooth beats fast.';
  els.log.textContent = 'Log set and restart timer';
  pickQuote();
  renderReps();
  render();
  chime();
  buzz();
  notify();
  els.panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function endSet(logIt) {
  if (logIt && currentReps > 0) {
    const key = dayKey();
    const today = stats.days[key] || { sets: 0, squats: 0 };
    today.sets += 1;
    today.squats += currentReps;
    stats.days[key] = today;
    stats.totalSets += 1;
    stats.totalSquats += currentReps;
    stats.lastSetAt = new Date().toISOString();
    saveJson(STATS_KEY, stats);
    renderStats();
  }
  inSet = false;
  els.panel.hidden = true;
  totalMs = intervalMs();
  remainingMs = totalMs;
  startTicking();
}

function applySettings() {
  settings.intervalMin = Number(els.interval.value) || 45;
  settings.reps = Number(els.reps.value) || 10;
  settings.sound = els.sound.checked;
  settings.vibrate = els.vibrate.checked;
  saveJson(SETTINGS_KEY, settings);
  if (!running && !inSet) {
    totalMs = intervalMs();
    remainingMs = totalMs;
  }
  render();
}

function init() {
  els.interval.value = String(settings.intervalMin);
  els.reps.value = String(settings.reps);
  els.sound.checked = settings.sound;
  els.vibrate.checked = settings.vibrate;
  totalMs = intervalMs();
  remainingMs = totalMs;
  pickQuote();
  renderStats();
  render();
  updateNotifyStatus();
}

function updateNotifyStatus() {
  if (!('Notification' in window)) {
    els.notifyStatus.textContent = 'This browser does not support notifications. The on-screen alarm still fires.';
    els.notifyButton.disabled = true;
    return;
  }
  if (Notification.permission === 'granted') {
    els.notifyStatus.textContent = 'On. You will get a nudge even on another tab.';
    els.notifyButton.disabled = true;
    els.notifyButton.textContent = 'Notifications on';
  } else if (Notification.permission === 'denied') {
    els.notifyStatus.textContent = 'Blocked in browser settings. The on-screen alarm still fires.';
  } else {
    els.notifyStatus.textContent = 'Off. The timer still rings on this screen without them.';
  }
}

els.startPause.addEventListener('click', () => {
  if (inSet) return;
  if (running) {
    remainingMs = Math.max(0, endAt - Date.now());
    stopTicking();
  } else {
    if (remainingMs <= 0) remainingMs = totalMs;
    startTicking();
  }
  render();
});

els.reset.addEventListener('click', () => {
  stopTicking();
  inSet = false;
  els.panel.hidden = true;
  totalMs = intervalMs();
  remainingMs = totalMs;
  render();
});

els.setNow.addEventListener('click', () => {
  if (inSet) return;
  stopTicking();
  startSet();
});

[els.interval, els.reps, els.sound, els.vibrate].forEach(control => {
  control.addEventListener('change', applySettings);
});

els.repButton.addEventListener('click', () => {
  if (currentReps < settings.reps) {
    currentReps += 1;
    if (settings.vibrate && navigator.vibrate) navigator.vibrate(12);
    renderReps();
  }
});

els.log.addEventListener('click', () => endSet(true));
els.skip.addEventListener('click', () => endSet(false));

els.notifyButton.addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  try {
    await Notification.requestPermission();
  } catch {
    // Status line below reflects the outcome either way.
  }
  updateNotifyStatus();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && running) {
    tick();
  }
});

init();
