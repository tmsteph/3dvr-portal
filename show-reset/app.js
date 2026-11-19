const GIRL_ASSETS = '../3dvr-girl/assets/';
const SQUAT_INTERVAL_MS = 45 * 60 * 1000;

const ACTIVITIES = [
  {
    id: 'breath-reset',
    group: 'seated',
    groupLabel: 'Seated · Breath',
    title: 'Breath Reset',
    kind: 'timer',
    seconds: 45,
    media: { video: 'meditation-breathing-loop', image: 'meditation-courtyard.jpg', label: 'Breathing loop' },
    instruction: 'Sit tall. Breathe in for four, out for six. Shoulders drop a little more with every exhale.',
    caption: 'Slow breath, soft shoulders.'
  },
  {
    id: 'neck-side-stretch',
    group: 'seated',
    groupLabel: 'Seated · Neck',
    title: 'Neck Side Stretch',
    kind: 'timer',
    sides: ['Left side', 'Right side'],
    perSide: 20,
    media: { image: 'meditation-courtyard.jpg', label: 'Courtyard portrait' },
    instruction: 'Ear toward shoulder, opposite hand reaching gently toward the floor. Easy range, no pulling.',
    caption: 'Long neck, relaxed jaw.'
  },
  {
    id: 'neck-rotation',
    group: 'seated',
    groupLabel: 'Seated · Neck',
    title: 'Neck Rotation',
    kind: 'timer',
    sides: ['Left side', 'Right side'],
    perSide: 15,
    media: { image: 'courtyard-profile.jpg', label: 'Profile portrait' },
    instruction: 'Turn your head slowly and look over your shoulder. Keep the movement small and smooth.',
    caption: 'Slow turns, easy breathing.'
  },
  {
    id: 'shoulder-rolls',
    group: 'seated',
    groupLabel: 'Seated · Shoulders',
    title: 'Shoulder Rolls',
    kind: 'timer',
    seconds: 30,
    media: { image: 'over-shoulder.jpg', label: 'Over the shoulder' },
    instruction: 'Roll both shoulders up, back, and down in big slow circles. Reverse direction halfway.',
    caption: 'Melt the shoulder tension.'
  },
  {
    id: 'spinal-wave',
    group: 'seated',
    groupLabel: 'Seated · Spine',
    title: 'Spinal Wave',
    kind: 'timer',
    seconds: 45,
    media: { video: 'courtyard-flow-loop', image: 'courtyard-warrior.jpg', label: 'Courtyard flow loop' },
    instruction: 'Rock gently forward and back through your spine, like a wave. Follow your breath.',
    caption: 'The spine loves small motion.'
  },
  {
    id: 'seated-twist',
    group: 'seated',
    groupLabel: 'Seated · Spine',
    title: 'Seated Twist',
    kind: 'timer',
    sides: ['Left side', 'Right side'],
    perSide: 20,
    media: { image: 'downward-flow.jpg', label: 'Flowing pose' },
    instruction: 'One hand on the opposite knee, other hand behind you. Sit taller as you twist. Breathe into it.',
    caption: 'Tall spine, gentle twist.'
  },
  {
    id: 'figure-four',
    group: 'seated',
    groupLabel: 'Seated · Hips',
    title: 'Figure-Four',
    kind: 'timer',
    sides: ['Left side', 'Right side'],
    perSide: 25,
    media: { image: 'meditation-seat.png', label: 'Seated pose' },
    instruction: 'Ankle over opposite knee, sit tall, and lean in slightly until the outer hip opens up.',
    caption: 'Hips unlock, back thanks you.'
  },
  {
    id: 'glute-clenches',
    group: 'glutes',
    groupLabel: 'Seated · Glutes',
    title: 'Butt Clenches',
    kind: 'paced',
    reps: 10,
    phases: [
      { label: 'Squeeze', seconds: 4 },
      { label: 'Release', seconds: 2 }
    ],
    media: { image: 'courtyard-stand.jpg', label: 'Standing tall' },
    instruction: 'Squeeze your glutes hard, then let go completely. Nobody can see it. Perfect during a show.',
    caption: 'Invisible, and it works.'
  },
  {
    id: 'wrist-forearm',
    group: 'hands',
    groupLabel: 'Seated · Hands',
    title: 'Wrist & Forearm',
    kind: 'timer',
    seconds: 35,
    media: { image: 'courtyard-crouch.png', label: 'Grounded pose' },
    instruction: 'Prayer press, then flip and press the backs of your hands. Shake everything loose at the end.',
    caption: 'For the hands that run the show.'
  },
  {
    id: 'eye-break',
    group: 'eyes',
    groupLabel: 'Anywhere · Eyes',
    title: 'Eye Break',
    kind: 'timer',
    seconds: 25,
    media: { image: 'garden-muse.jpg', label: 'Garden view' },
    instruction: 'Look as far away as you can and hold your gaze there. Distance resets tired eyes. Blink slowly.',
    caption: '20-20-20: far away, twenty seconds.'
  },
  {
    id: 'calf-raises',
    group: 'standing',
    groupLabel: 'Standing · Legs',
    title: 'Stand + Calf Raises',
    kind: 'paced',
    reps: 12,
    phases: [
      { label: 'Rise', seconds: 2 },
      { label: 'Lower', seconds: 2 }
    ],
    media: { image: 'balance-tree.jpg', label: 'Balance pose' },
    instruction: 'Stand up, hold the chair if you want it, and rise onto your toes. Slow up, slow down.',
    caption: 'Blood moving, legs awake.'
  },
  {
    id: 'hip-flexor',
    group: 'standing',
    groupLabel: 'Standing · Hips',
    title: 'Hip Flexor Stretch',
    kind: 'timer',
    sides: ['Left side', 'Right side'],
    perSide: 20,
    media: { image: 'courtyard-warrior.jpg', label: 'Warrior pose' },
    instruction: 'One foot back, tuck your tailbone, and shift forward until the front of the back hip stretches.',
    caption: 'Undo the chair shape.'
  },
  {
    id: 'walk-break',
    group: 'walk',
    groupLabel: 'Walk · Reset',
    title: 'Walk Break',
    kind: 'timer',
    seconds: 120,
    media: { image: 'festival-dance.jpg', label: 'Out and moving' },
    instruction: 'Walk. Water if you need it. Daylight if you can get it. Come back when the timer ends.',
    caption: 'Two minutes of walking beats none.'
  }
];

const SQUAT_STEP = {
  id: 'squats',
  group: 'reminder',
  groupLabel: 'Reminder · Legs',
  title: '10 Squats',
  kind: 'paced',
  reps: 10,
  phases: [
    { label: 'Squat', seconds: 3 },
    { label: 'Stand tall', seconds: 1 }
  ],
  media: { image: 'courtyard-warrior.jpg', label: 'Warrior pose' },
  instruction: 'Feet shoulder width. Sit back, stand tall. Ten honest squats, then the loop rolls on.',
  caption: 'Strong legs, clear head.',
  isSquat: true
};

function stepSeconds(activity) {
  if (activity.kind === 'paced') {
    return activity.reps * activity.phases.reduce((sum, phase) => sum + phase.seconds, 0);
  }
  if (activity.sides) return activity.perSide;
  return activity.seconds;
}

function buildRotation(prefs = {}) {
  const includeStanding = prefs.includeStanding !== false;
  const steps = [];
  for (const activity of ACTIVITIES) {
    if (!includeStanding && (activity.group === 'standing' || activity.group === 'walk')) continue;
    if (activity.sides) {
      for (const side of activity.sides) {
        steps.push({ ...activity, side, totalSeconds: stepSeconds(activity) });
      }
    } else {
      steps.push({ ...activity, side: null, totalSeconds: stepSeconds(activity) });
    }
  }
  return steps;
}

const api = { ACTIVITIES, SQUAT_STEP, SQUAT_INTERVAL_MS, stepSeconds, buildRotation };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.ShowReset = api;
if (typeof globalThis !== 'undefined') globalThis.ShowReset = api;

if (typeof document !== 'undefined') {
  const PREFS_KEY = 'showReset.prefs.v1';
  const SQUAT_KEY = 'showReset.squat.v1';
  const STATS_KEY = 'showReset.stats.v1';

  const defaultPrefs = { soundOn: false, reduceMotion: false, includeStanding: true };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
    } catch (error) {
      return { ...fallback };
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* storage is best effort */
    }
  }

  const prefs = loadJSON(PREFS_KEY, defaultPrefs);
  const todayKey = new Date().toDateString();
  const stats = loadJSON(STATS_KEY, { day: todayKey, moves: 0, squats: 0, rounds: 0 });
  if (stats.day !== todayKey) {
    stats.day = todayKey;
    stats.moves = 0;
    stats.squats = 0;
    stats.rounds = 0;
  }
  const squatState = loadJSON(SQUAT_KEY, { nextAt: 0 });
  if (!squatState.nextAt) {
    squatState.nextAt = Date.now() + SQUAT_INTERVAL_MS;
    saveJSON(SQUAT_KEY, squatState);
  }

  const els = {};
  let rotation = buildRotation(prefs);
  let rotationIndex = 0;
  let current = null;
  let stepStartedAt = 0;
  let deadline = 0;
  let paused = false;
  let pausedRemainingMs = 0;
  let squatsPending = false;
  let lastPhaseKey = '';
  let audioCtx = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function fmtClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function chime() {
    if (!prefs.soundOn) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      audioCtx = audioCtx || new Ctor();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const start = audioCtx.currentTime;
      [523.25, 783.99].forEach((frequency, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const at = start + i * 0.18;
        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.1, at + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(at);
        osc.stop(at + 0.55);
      });
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (error) {
      /* sound is optional */
    }
  }

  function setMedia(step) {
    const media = step.media;
    const useVideo = Boolean(media.video) && !prefs.reduceMotion;
    els.guideVideo.hidden = !useVideo;
    els.guideImage.hidden = useVideo;
    if (useVideo) {
      const mp4 = `${GIRL_ASSETS}${media.video}.mp4`;
      if (els.guideVideo.dataset.src !== mp4) {
        els.guideVideo.dataset.src = mp4;
        els.guideVideo.poster = `${GIRL_ASSETS}${media.image}`;
        els.guideVideo.innerHTML = '';
        const sourceMp4 = document.createElement('source');
        sourceMp4.src = mp4;
        sourceMp4.type = 'video/mp4';
        const sourceWebm = document.createElement('source');
        sourceWebm.src = `${GIRL_ASSETS}${media.video}.webm`;
        sourceWebm.type = 'video/webm';
        els.guideVideo.append(sourceMp4, sourceWebm);
        els.guideVideo.load();
      }
      const playPromise = els.guideVideo.play();
      if (playPromise) playPromise.catch(() => {});
    } else {
      els.guideVideo.pause();
      els.guideImage.src = `${GIRL_ASSETS}${media.image}`;
    }
    els.guideLabel.textContent = media.label;
    els.visualCaption.textContent = step.caption;
  }

  function startStep(step) {
    current = step;
    stepStartedAt = Date.now();
    deadline = stepStartedAt + step.totalSeconds * 1000;
    paused = false;
    lastPhaseKey = '';
    els.pauseButton.textContent = 'Pause';
    setMedia(step);
    els.stepGroup.textContent = step.groupLabel;
    els.stepTitle.textContent = step.title;
    els.stepInstruction.textContent = step.instruction;
    els.sideBanner.hidden = !step.side;
    if (step.side) els.sideBanner.textContent = step.side;
    if (step.isSquat) {
      els.stepCount.textContent = 'Squat reminder';
    } else {
      els.stepCount.textContent = `Move ${rotationIndex} of ${rotation.length}`;
    }
    const next = rotation[rotationIndex % rotation.length];
    els.upNext.textContent = step.isSquat ? 'Then the loop rolls on' : `Up next: ${next.title}`;
    renderTimer(step.totalSeconds * 1000);
  }

  function completeCurrent() {
    stats.moves += 1;
    if (current.isSquat) stats.squats += current.reps;
    saveJSON(STATS_KEY, stats);
    renderTally();
  }

  function advance() {
    completeCurrent();
    chime();
    if (!current.isSquat) {
      rotationIndex += 1;
      if (rotationIndex > rotation.length) {
        rotationIndex = 1;
        stats.rounds += 1;
        saveJSON(STATS_KEY, stats);
        renderTally();
      }
    }
    if (squatsPending) {
      squatsPending = false;
      squatState.nextAt = Date.now() + SQUAT_INTERVAL_MS;
      saveJSON(SQUAT_KEY, squatState);
      startStep({ ...SQUAT_STEP, totalSeconds: stepSeconds(SQUAT_STEP) });
      return;
    }
    startStep(rotation[(rotationIndex - 1) % rotation.length]);
  }

  function goBack() {
    if (!current) return;
    const elapsed = Date.now() - stepStartedAt;
    if (!current.isSquat && elapsed < 3000 && rotationIndex > 1) {
      rotationIndex -= 1;
    }
    if (current.isSquat) {
      startStep(rotation[(rotationIndex - 1 + rotation.length) % rotation.length]);
      return;
    }
    startStep(rotation[(rotationIndex - 1) % rotation.length]);
  }

  function togglePause() {
    if (!current) return;
    if (paused) {
      paused = false;
      deadline = Date.now() + pausedRemainingMs;
      stepStartedAt = Date.now() - (current.totalSeconds * 1000 - pausedRemainingMs);
      els.pauseButton.textContent = 'Pause';
    } else {
      paused = true;
      pausedRemainingMs = Math.max(0, deadline - Date.now());
      els.pauseButton.textContent = 'Resume';
      renderTimer(pausedRemainingMs);
    }
  }

  function phaseInfo(step, elapsedSeconds) {
    const cycle = step.phases.reduce((sum, phase) => sum + phase.seconds, 0);
    const rep = Math.min(step.reps, Math.floor(elapsedSeconds / cycle) + 1);
    let offset = elapsedSeconds % cycle;
    let phase = step.phases[step.phases.length - 1];
    let phaseLeft = 0;
    for (const candidate of step.phases) {
      if (offset < candidate.seconds) {
        phase = candidate;
        phaseLeft = candidate.seconds - offset;
        break;
      }
      offset -= candidate.seconds;
    }
    return { rep, phase, phaseLeft };
  }

  function renderTimer(remainingMs) {
    if (!current) return;
    const totalMs = current.totalSeconds * 1000;
    const fraction = Math.max(0, Math.min(1, remainingMs / totalMs));
    els.timerRing.style.setProperty('--timer-progress', String(fraction));
    els.timerRing.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    if (current.kind === 'paced') {
      const elapsed = (totalMs - remainingMs) / 1000;
      const info = phaseInfo(current, elapsed);
      els.timerPrimary.textContent = info.phase.label;
      els.timerSecondary.textContent = `Rep ${info.rep} of ${current.reps} · ${Math.max(1, Math.ceil(info.phaseLeft))}s`;
      const phaseKey = `${info.rep}-${info.phase.label}`;
      if (phaseKey !== lastPhaseKey) {
        lastPhaseKey = phaseKey;
        els.timerPrimary.classList.remove('phase-pop');
        void els.timerPrimary.offsetWidth;
        els.timerPrimary.classList.add('phase-pop');
      }
    } else {
      els.timerPrimary.textContent = fmtClock(remainingMs);
      els.timerSecondary.textContent = current.side || current.caption;
    }
    const stepFraction = 1 - fraction;
    const overall = current.isSquat
      ? stepFraction
      : ((rotationIndex - 1 + stepFraction) / rotation.length) * 100;
    els.progressBar.style.width = `${Math.max(0, Math.min(100, overall))}%`;
  }

  function renderSquatChip() {
    const remaining = squatState.nextAt - Date.now();
    if (current && current.isSquat) {
      els.squatChip.textContent = 'Squats now';
    } else if (remaining <= 0) {
      els.squatChip.textContent = 'Squats up next';
    } else {
      els.squatChip.textContent = `10 squats in ${fmtClock(remaining)}`;
    }
  }

  function renderTally() {
    els.tally.textContent = `Today: ${stats.moves} moves · ${stats.squats} squats · ${stats.rounds} full rounds`;
  }

  function tick() {
    renderSquatChip();
    if (!current || paused) return;
    if (Date.now() >= squatState.nextAt && !current.isSquat) squatsPending = true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      advance();
    } else {
      renderTimer(remaining);
    }
  }

  function applyPrefs() {
    document.body.classList.toggle('reduce-motion', prefs.reduceMotion);
    document.querySelectorAll('[data-pref]').forEach((input) => {
      input.checked = Boolean(prefs[input.dataset.pref]);
    });
    saveJSON(PREFS_KEY, prefs);
  }

  function rebuildRotation() {
    const currentId = current ? current.id : null;
    rotation = buildRotation(prefs);
    const found = rotation.findIndex((step) => step.id === currentId);
    rotationIndex = found >= 0 ? found + 1 : 1;
    if (current && !current.isSquat) {
      const next = rotation[rotationIndex % rotation.length];
      els.upNext.textContent = `Up next: ${next.title}`;
      els.stepCount.textContent = `Move ${rotationIndex} of ${rotation.length}`;
    }
  }

  function init() {
    els.guideVideo = $('[data-guide-video]');
    els.guideImage = $('[data-guide-image]');
    els.guideLabel = $('[data-guide-label]');
    els.visualCaption = $('[data-visual-caption]');
    els.stepGroup = $('[data-step-group]');
    els.stepTitle = $('[data-step-title]');
    els.stepInstruction = $('[data-step-instruction]');
    els.stepCount = $('[data-step-count]');
    els.sideBanner = $('[data-side-banner]');
    els.timerRing = $('[data-timer-ring]');
    els.timerPrimary = $('[data-timer-primary]');
    els.timerSecondary = $('[data-timer-secondary]');
    els.progressBar = $('[data-routine-progress]');
    els.upNext = $('[data-up-next]');
    els.squatChip = $('[data-squat-chip]');
    els.tally = $('[data-tally]');
    els.pauseButton = $('[data-action="pause"]');

    document.querySelectorAll('[data-pref]').forEach((input) => {
      input.addEventListener('change', () => {
        prefs[input.dataset.pref] = input.checked;
        applyPrefs();
        if (input.dataset.pref === 'includeStanding') rebuildRotation();
        if (input.dataset.pref === 'reduceMotion' && current) setMedia(current);
        if (input.dataset.pref === 'soundOn' && input.checked) chime();
      });
    });

    $('[data-action="next"]').addEventListener('click', advance);
    $('[data-action="back"]').addEventListener('click', goBack);
    els.pauseButton.addEventListener('click', togglePause);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick();
    });

    applyPrefs();
    renderTally();
    rotationIndex = 1;
    startStep(rotation[0]);
    setInterval(tick, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
