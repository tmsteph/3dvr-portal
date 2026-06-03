(() => {
  const STORAGE_KEY = 'seated-spine-reset-preferences';
  const COMPLETION_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const fullRoutine = [
    {
      id: 'crown-up',
      title: 'Crown Up Posture Reset',
      instruction: 'Sit toward the front of the chair. Feet flat. Imagine the crown of your head floating upward.',
      cue: '3 slow breaths',
      duration: 24,
      visual: 'crown',
      caption: 'Crown lifts while feet settle into the floor.'
    },
    {
      id: 'chin-tucks',
      title: 'Chin Tucks',
      instruction: 'Gently slide your chin straight back, like making a small double chin. Keep your eyes level.',
      cue: '5-10 reps',
      reps: 8,
      duration: 30,
      visual: 'chin',
      caption: 'Head glides straight back. Eyes stay level.'
    },
    {
      id: 'shoulder-blades',
      title: 'Shoulder Blade Squeezes',
      instruction: 'Keep shoulders low. Gently pull shoulder blades back and slightly down.',
      cue: '5-10 reps',
      reps: 8,
      duration: 30,
      visual: 'shoulders',
      caption: 'Shoulders stay low while the upper back wakes up.'
    },
    {
      id: 'neck-side-stretch',
      title: 'Neck Side Stretch',
      instruction: 'Let one ear drift toward the same-side shoulder. Keep both shoulders relaxed. Switch sides.',
      cue: '10-20 seconds each side',
      duration: 40,
      visual: 'side-stretch',
      caption: 'A small side bend is enough. No forcing.'
    },
    {
      id: 'neck-rotation',
      title: 'Neck Rotation',
      instruction: 'Slowly turn your head right, then left, only as far as comfortable.',
      cue: '5 each side',
      reps: 10,
      duration: 30,
      visual: 'rotation',
      caption: 'Rotate inside an easy range. Jaw and shoulders stay quiet.'
    },
    {
      id: 'chest-opener',
      title: 'Seated Chest Opener',
      instruction: 'Clasp hands behind your back or hold the chair. Open the chest gently.',
      cue: '15-30 seconds',
      duration: 32,
      visual: 'chest',
      caption: 'Collarbones widen while ribs stay soft.'
    },
    {
      id: 'spinal-wave',
      title: 'Seated Spinal Wave',
      instruction: 'Round your back slightly, then slowly lift your chest. Move like a seated cat-cow.',
      cue: '5-8 reps',
      reps: 6,
      duration: 32,
      visual: 'wave',
      caption: 'Round a little, then lift a little. Keep it smooth.'
    },
    {
      id: 'figure-four',
      title: 'Seated Figure-Four Hip Stretch',
      instruction: 'Cross one ankle over the opposite knee. Sit tall. Lean forward gently. Switch sides.',
      cue: '20-30 seconds each side',
      duration: 50,
      visual: 'figure-four',
      caption: 'Hip stretch stays gentle. Spine keeps length.'
    },
    {
      id: 'show-cue-reset',
      title: 'Invisible Show-Cue Reset',
      instruction: 'Exhale fully. Chin gently back. Shoulders down. Feet press into floor. Crown lifts.',
      cue: '1 calm breath',
      duration: 14,
      visual: 'breath',
      caption: 'Return to the room: upright, calm, and available.',
      closing: 'You are upright, calm, and available.'
    }
  ];

  const quickRoutine = [
    {
      id: 'quick-crown',
      title: 'Crown Up',
      instruction: 'Sit toward the front of the chair. Feet flat. Let the crown of your head float upward.',
      cue: '2 slow breaths',
      duration: 15,
      visual: 'crown',
      caption: 'Tall without stiffness.'
    },
    {
      id: 'quick-chin',
      title: 'Chin Tuck',
      instruction: 'Slide your chin straight back once or twice. Keep your eyes level.',
      cue: '5 reps',
      reps: 5,
      duration: 15,
      visual: 'chin',
      caption: 'Small glide. Neck stays long.'
    },
    {
      id: 'quick-shoulder',
      title: 'Shoulder Down/Back',
      instruction: 'Let shoulders drop. Pull shoulder blades back and slightly down.',
      cue: '5 reps',
      reps: 5,
      duration: 15,
      visual: 'shoulders',
      caption: 'Shoulders drop away from ears.'
    },
    {
      id: 'quick-breath',
      title: 'One Breath',
      instruction: 'Exhale fully. Feel both feet press into the floor.',
      cue: '1 calm breath',
      duration: 8,
      visual: 'breath',
      caption: 'Empty the breath and let the room come back into focus.'
    },
    {
      id: 'quick-close',
      title: 'Closing Message',
      instruction: 'Chin gently back. Shoulders down. Crown lifts.',
      cue: 'Available',
      duration: 7,
      visual: 'crown',
      caption: 'Ready for the next cue.',
      closing: 'You are upright, calm, and available.'
    }
  ];

  const screens = {
    landing: document.querySelector('[data-screen="landing"]'),
    routine: document.querySelector('[data-screen="routine"]')
  };
  const elements = {
    shell: document.querySelector('[data-app-shell]'),
    startButtons: [...document.querySelectorAll('[data-start-mode]')],
    prefInputs: [...document.querySelectorAll('[data-pref]')],
    lastCompleted: document.querySelector('[data-last-completed]'),
    modeLabel: document.querySelector('[data-mode-label]'),
    stepTitle: document.querySelector('[data-step-title]'),
    stepInstruction: document.querySelector('[data-step-instruction]'),
    stepCount: document.querySelector('[data-step-count]'),
    totalTime: document.querySelector('[data-total-time]'),
    routineProgress: document.querySelector('[data-routine-progress]'),
    timerRing: document.querySelector('[data-timer-ring]'),
    timerPrimary: document.querySelector('[data-timer-primary]'),
    timerSecondary: document.querySelector('[data-timer-secondary]'),
    closingMessage: document.querySelector('[data-closing-message]'),
    visualCaption: document.querySelector('[data-visual-caption]'),
    threeStage: document.querySelector('[data-three-stage]'),
    fallbackSymbol: document.querySelector('[data-fallback-symbol]'),
    controls: [...document.querySelectorAll('[data-action]')],
    pauseButton: document.querySelector('[data-action="pause"]')
  };

  const defaultPrefs = {
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    silentMode: true,
    preferredMode: 'full',
    lastCompletedDate: ''
  };

  let prefs = loadPreferences();
  let currentMode = prefs.preferredMode === 'quick' ? 'quick' : 'full';
  let routine = currentMode === 'quick' ? quickRoutine : fullRoutine;
  let currentIndex = 0;
  let remainingMs = routine[0].duration * 1000;
  let stepDurationMs = remainingMs;
  let running = false;
  let lastTick = 0;
  let timerId = null;
  let audioContext = null;
  let visualController = null;

  const portalBridge = {
    onPreferenceChange: null,
    onRoutineComplete: null
  };

  window.SeatedSpineReset = {
    setPortalBridge(bridge = {}) {
      portalBridge.onPreferenceChange = typeof bridge.onPreferenceChange === 'function'
        ? bridge.onPreferenceChange
        : null;
      portalBridge.onRoutineComplete = typeof bridge.onRoutineComplete === 'function'
        ? bridge.onRoutineComplete
        : null;
    },
    getState() {
      return {
        mode: currentMode,
        stepIndex: currentIndex,
        running,
        preferences: { ...prefs }
      };
    }
  };

  function loadPreferences() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        ...defaultPrefs,
        ...parsed,
        reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : defaultPrefs.reduceMotion,
        silentMode: typeof parsed.silentMode === 'boolean' ? parsed.silentMode : true
      };
    } catch (error) {
      console.warn('Unable to load Seated Spine Reset preferences', error);
      return { ...defaultPrefs };
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn('Unable to save Seated Spine Reset preferences', error);
    }
    if (portalBridge.onPreferenceChange) {
      portalBridge.onPreferenceChange({ ...prefs });
    }
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    if (!minutes) return `${remainder}s`;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  function formatRoutineLength(steps) {
    const total = steps.reduce((sum, step) => sum + step.duration, 0);
    if (total <= 75) return 'About 60 seconds';
    const rounded = Math.max(1, Math.round(total / 60));
    return `About ${rounded} minutes`;
  }

  function setScreen(name) {
    Object.entries(screens).forEach(([screenName, screen]) => {
      screen.classList.toggle('is-active', screenName === name);
    });
    window.requestAnimationFrame(() => {
      if (visualController) {
        visualController.resize();
      }
    });
  }

  function applyPreferences() {
    document.body.dataset.reduceMotion = prefs.reduceMotion ? 'true' : 'false';
    elements.prefInputs.forEach((input) => {
      const key = input.dataset.pref;
      input.checked = Boolean(prefs[key]);
    });
    if (prefs.lastCompletedDate && elements.lastCompleted) {
      const date = new Date(prefs.lastCompletedDate);
      elements.lastCompleted.hidden = false;
      elements.lastCompleted.textContent = Number.isNaN(date.getTime())
        ? `Last completed: ${prefs.lastCompletedDate}`
        : `Last completed: ${COMPLETION_DATE_FORMAT.format(date)}`;
    }
    if (visualController) {
      visualController.setReduceMotion(prefs.reduceMotion);
    }
  }

  function updatePauseButton() {
    elements.pauseButton.textContent = running ? 'Pause' : 'Continue';
  }

  function setCurrentStep(index, { resetTimer = true, cue = true } = {}) {
    currentIndex = Math.min(Math.max(index, 0), routine.length - 1);
    const step = routine[currentIndex];
    if (resetTimer) {
      stepDurationMs = step.duration * 1000;
      remainingMs = stepDurationMs;
      lastTick = performance.now();
    }

    elements.modeLabel.textContent = currentMode === 'quick' ? 'Quick Reset' : 'Full Routine';
    elements.stepTitle.textContent = step.title;
    elements.stepInstruction.textContent = step.instruction;
    elements.stepCount.textContent = `Step ${currentIndex + 1} of ${routine.length}`;
    elements.totalTime.textContent = formatRoutineLength(routine);
    elements.timerSecondary.textContent = step.cue;
    elements.closingMessage.hidden = !step.closing;
    if (step.closing) {
      elements.closingMessage.textContent = step.closing;
    }
    elements.visualCaption.textContent = step.caption;
    elements.fallbackSymbol.textContent = fallbackTextForStep(step.visual);
    if (elements.threeStage) {
      elements.threeStage.dataset.visual = step.visual;
    }

    if (visualController) {
      visualController.setStep(step.visual);
    }
    updateProgress();
    updatePauseButton();

    if (cue) {
      cueStepChange();
    }
  }

  function fallbackTextForStep(visual) {
    const labels = {
      crown: 'UP',
      chin: 'CHIN',
      shoulders: 'BACK',
      'side-stretch': 'SIDE',
      rotation: 'TURN',
      chest: 'OPEN',
      wave: 'WAVE',
      'figure-four': 'HIP',
      breath: 'BREATHE'
    };
    return labels[visual] || 'RESET';
  }

  function updateProgress() {
    const step = routine[currentIndex];
    const elapsed = Math.max(0, stepDurationMs - remainingMs);
    const stepRatio = stepDurationMs > 0 ? Math.min(1, elapsed / stepDurationMs) : 1;
    const remainingSeconds = remainingMs / 1000;
    const routineRatio = routine.length > 1
      ? (currentIndex + stepRatio) / routine.length
      : stepRatio;

    elements.timerRing.style.setProperty('--timer-progress', String(Math.max(0, 1 - stepRatio)));
    elements.timerRing.setAttribute('aria-valuenow', String(Math.round((1 - stepRatio) * 100)));
    elements.routineProgress.style.width = `${Math.min(100, Math.max(0, routineRatio * 100))}%`;

    if (step.reps) {
      const repsDone = Math.min(step.reps, Math.floor(stepRatio * step.reps));
      elements.timerPrimary.textContent = `${Math.max(0, step.reps - repsDone)} reps`;
      elements.timerSecondary.textContent = `${formatTime(remainingSeconds)} left`;
    } else if (/breath/i.test(step.cue)) {
      elements.timerPrimary.textContent = step.cue;
      elements.timerSecondary.textContent = formatTime(remainingSeconds);
    } else {
      elements.timerPrimary.textContent = formatTime(remainingSeconds);
      elements.timerSecondary.textContent = step.cue;
    }
  }

  function startRoutine(mode) {
    currentMode = mode === 'quick' ? 'quick' : 'full';
    prefs.preferredMode = currentMode;
    savePreferences();
    routine = currentMode === 'quick' ? quickRoutine : fullRoutine;
    setScreen('routine');
    running = true;
    setCurrentStep(0, { resetTimer: true, cue: false });
    startTimer();
    cueStepChange();
  }

  function startTimer() {
    stopTimer();
    lastTick = performance.now();
    timerId = window.setInterval(tick, 250);
    updatePauseButton();
  }

  function stopTimer() {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function tick() {
    if (!running) return;
    const now = performance.now();
    const delta = now - lastTick;
    lastTick = now;
    remainingMs = Math.max(0, remainingMs - delta);
    updateProgress();
    if (remainingMs <= 0) {
      goNext({ auto: true });
    }
  }

  function togglePause() {
    running = !running;
    lastTick = performance.now();
    updatePauseButton();
  }

  function goNext({ auto = false } = {}) {
    if (currentIndex >= routine.length - 1) {
      completeRoutine();
      return;
    }
    setCurrentStep(currentIndex + 1, { resetTimer: true, cue: true });
    if (auto) {
      lastTick = performance.now();
    }
  }

  function goBack() {
    setCurrentStep(currentIndex - 1, { resetTimer: true, cue: false });
    running = true;
    lastTick = performance.now();
    updatePauseButton();
  }

  function restartRoutine() {
    running = true;
    setCurrentStep(0, { resetTimer: true, cue: false });
    startTimer();
    cueStepChange();
  }

  function completeRoutine() {
    running = false;
    stopTimer();
    remainingMs = 0;
    updateProgress();
    updatePauseButton();
    prefs.lastCompletedDate = new Date().toISOString();
    savePreferences();
    applyPreferences();
    const summary = {
      mode: currentMode,
      completedAt: prefs.lastCompletedDate,
      steps: routine.map((step) => step.id)
    };
    if (portalBridge.onRoutineComplete) {
      portalBridge.onRoutineComplete(summary);
    }
    cueStepChange();
  }

  function cueStepChange() {
    if (prefs.silentMode) return;
    if ('vibrate' in navigator) {
      navigator.vibrate(18);
    }
    playSoftChime();
  }

  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) {
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function playSoftChime() {
    const context = getAudioContext();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.45);
  }

  elements.startButtons.forEach((button) => {
    button.addEventListener('click', () => startRoutine(button.dataset.startMode));
  });

  elements.prefInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.pref;
      prefs[key] = input.checked;
      if (key === 'silentMode' && !prefs.silentMode) {
        getAudioContext();
      }
      savePreferences();
      applyPreferences();
    });
  });

  elements.controls.forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'pause') togglePause();
      if (action === 'next') goNext();
      if (action === 'back') goBack();
      if (action === 'restart') restartRoutine();
    });
  });

  function createVisualController() {
    const canvas = document.querySelector('[data-three-canvas]');
    const stage = document.querySelector('[data-three-stage]');
    const fallback = document.querySelector('[data-visual-fallback]');
    const THREE = window.THREE;

    if (!canvas || !stage || !THREE || !webGLAvailable()) {
      if (fallback) fallback.hidden = false;
      return {
        setStep() {},
        setReduceMotion() {},
        resize() {}
      };
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
      });
    } catch (error) {
      console.warn('Unable to initialize Seated Spine Reset 3D visual', error);
      fallback.hidden = false;
      return {
        setStep() {},
        setReduceMotion() {},
        resize() {}
      };
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 2.2, 8.4);

    const root = new THREE.Group();
    scene.add(root);

    const body = new THREE.Group();
    const cues = new THREE.Group();
    root.add(body, cues);

    scene.add(new THREE.HemisphereLight(0xf6dfbd, 0x1b201e, 1.5));
    const key = new THREE.DirectionalLight(0xffd6a0, 2);
    key.position.set(4, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8dc8bd, 0.7);
    fill.position.set(-5, 2, 4);
    scene.add(fill);

    const materials = {
      line: new THREE.MeshStandardMaterial({ color: 0xf0b56d, roughness: 0.62, metalness: 0.05 }),
      soft: new THREE.MeshStandardMaterial({ color: 0x9eb89a, roughness: 0.7, metalness: 0.02 }),
      clay: new THREE.MeshStandardMaterial({ color: 0xce7a5b, roughness: 0.68, metalness: 0.02 }),
      dim: new THREE.MeshStandardMaterial({ color: 0x4b4840, roughness: 0.8, metalness: 0.04 }),
      floor: new THREE.MeshStandardMaterial({ color: 0x25231e, roughness: 0.9, metalness: 0.02 })
    };

    const makeBox = (w, h, d, material, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      return mesh;
    };

    const makeCylinder = (radius, height, material, x, y, z, axis = 'y') => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 28), material);
      mesh.position.set(x, y, z);
      if (axis === 'x') mesh.rotation.z = Math.PI / 2;
      if (axis === 'z') mesh.rotation.x = Math.PI / 2;
      return mesh;
    };

    const floor = makeBox(7.8, 0.08, 4.6, materials.floor, 0, -1.48, 0);
    const chair = new THREE.Group();
    chair.add(
      makeBox(2.35, 0.16, 1.7, materials.dim, 0, -0.7, 0),
      makeBox(2.35, 1.9, 0.16, materials.dim, 0, 0.18, -0.82),
      makeCylinder(0.05, 1.5, materials.dim, -1.0, -1.2, -0.55),
      makeCylinder(0.05, 1.5, materials.dim, 1.0, -1.2, -0.55),
      makeCylinder(0.05, 1.5, materials.dim, -1.0, -1.2, 0.55),
      makeCylinder(0.05, 1.5, materials.dim, 1.0, -1.2, 0.55)
    );
    root.add(floor, chair);

    const torso = makeCylinder(0.44, 1.55, materials.line, 0, 0.28, 0);
    torso.scale.x = 0.72;
    torso.scale.z = 0.5;
    const neck = makeCylinder(0.13, 0.38, materials.soft, 0, 1.2, 0.02);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 24), materials.soft);
    head.position.set(0, 1.66, 0.04);
    const shoulderBar = makeCylinder(0.075, 1.55, materials.clay, 0, 0.92, 0.02, 'x');
    const leftArm = makeCylinder(0.07, 1.25, materials.soft, -0.68, 0.34, 0.05);
    leftArm.rotation.z = -0.16;
    const rightArm = makeCylinder(0.07, 1.25, materials.soft, 0.68, 0.34, 0.05);
    rightArm.rotation.z = 0.16;
    const leftThigh = makeCylinder(0.09, 1.1, materials.soft, -0.44, -0.74, 0.48, 'z');
    const rightThigh = makeCylinder(0.09, 1.1, materials.soft, 0.44, -0.74, 0.48, 'z');
    const leftShin = makeCylinder(0.08, 1.15, materials.soft, -0.44, -1.12, 0.95);
    leftShin.rotation.x = 0.12;
    const rightShin = makeCylinder(0.08, 1.15, materials.soft, 0.44, -1.12, 0.95);
    rightShin.rotation.x = 0.12;

    body.add(torso, neck, head, shoulderBar, leftArm, rightArm, leftThigh, rightThigh, leftShin, rightShin);

    const arrowMaterial = new THREE.MeshStandardMaterial({ color: 0x8dc8bd, roughness: 0.55, metalness: 0.05 });
    const amberMaterial = new THREE.MeshStandardMaterial({ color: 0xf0b56d, roughness: 0.55, metalness: 0.05 });

    function makeArrow(length = 1.1, material = arrowMaterial) {
      const group = new THREE.Group();
      const shaft = makeCylinder(0.035, length, material, 0, 0, 0);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 28), material);
      cone.position.y = length / 2 + 0.14;
      group.add(shaft, cone);
      return group;
    }

    function makeRing(radius = 0.8) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.028, 12, 80),
        new THREE.MeshStandardMaterial({ color: 0xf0b56d, transparent: true, opacity: 0.72 })
      );
      return ring;
    }

    const cueObjects = {
      crown: makeArrow(0.9, arrowMaterial),
      chin: makeArrow(0.64, amberMaterial),
      shouldersLeft: makeArrow(0.7, arrowMaterial),
      shouldersRight: makeArrow(0.7, arrowMaterial),
      side: makeArrow(0.82, amberMaterial),
      rotation: makeRing(0.58),
      chestLeft: makeArrow(0.7, arrowMaterial),
      chestRight: makeArrow(0.7, arrowMaterial),
      wave: makeRing(0.78),
      hip: makeArrow(0.78, amberMaterial),
      breath: makeRing(1.18)
    };

    cueObjects.crown.position.set(0, 2.34, 0.04);
    cueObjects.chin.position.set(0.12, 1.7, 0.84);
    cueObjects.chin.rotation.x = Math.PI / 2;
    cueObjects.shouldersLeft.position.set(-1.08, 0.94, 0.08);
    cueObjects.shouldersLeft.rotation.z = -Math.PI / 2;
    cueObjects.shouldersRight.position.set(1.08, 0.94, 0.08);
    cueObjects.shouldersRight.rotation.z = Math.PI / 2;
    cueObjects.side.position.set(-0.74, 1.78, 0.05);
    cueObjects.side.rotation.z = 0.62;
    cueObjects.rotation.position.set(0, 1.66, 0.06);
    cueObjects.rotation.rotation.x = Math.PI / 2;
    cueObjects.chestLeft.position.set(-1.0, 0.64, 0.12);
    cueObjects.chestLeft.rotation.z = Math.PI / 2;
    cueObjects.chestRight.position.set(1.0, 0.64, 0.12);
    cueObjects.chestRight.rotation.z = -Math.PI / 2;
    cueObjects.wave.position.set(0, 0.42, 0.1);
    cueObjects.wave.scale.set(0.8, 1.18, 0.8);
    cueObjects.hip.position.set(0.9, -0.42, 0.76);
    cueObjects.hip.rotation.z = -0.72;
    cueObjects.breath.position.set(0, 0.45, 0.18);
    cueObjects.breath.scale.set(1, 1.25, 1);

    Object.values(cueObjects).forEach((object) => cues.add(object));

    let activeStep = 'crown';
    let reduceMotion = prefs.reduceMotion;
    let dragActive = false;
    let dragStartX = 0;
    let baseRotation = -0.14;
    let targetRotation = baseRotation;
    const clock = new THREE.Clock();

    function setCueVisibility() {
      Object.values(cueObjects).forEach((object) => {
        object.visible = false;
      });
      if (activeStep === 'crown') cueObjects.crown.visible = true;
      if (activeStep === 'chin') cueObjects.chin.visible = true;
      if (activeStep === 'shoulders') {
        cueObjects.shouldersLeft.visible = true;
        cueObjects.shouldersRight.visible = true;
      }
      if (activeStep === 'side-stretch') cueObjects.side.visible = true;
      if (activeStep === 'rotation') cueObjects.rotation.visible = true;
      if (activeStep === 'chest') {
        cueObjects.chestLeft.visible = true;
        cueObjects.chestRight.visible = true;
      }
      if (activeStep === 'wave') cueObjects.wave.visible = true;
      if (activeStep === 'figure-four') cueObjects.hip.visible = true;
      if (activeStep === 'breath') cueObjects.breath.visible = true;
    }

    function applyPose(time) {
      const motion = reduceMotion ? 0 : Math.sin(time * 1.4);
      body.rotation.set(0, 0, 0);
      torso.rotation.set(0, 0, 0);
      neck.rotation.set(0, 0, 0);
      head.rotation.set(0, 0, 0);
      shoulderBar.position.y = 0.92;
      leftArm.position.set(-0.68, 0.34, 0.05);
      rightArm.position.set(0.68, 0.34, 0.05);
      leftArm.rotation.set(0, 0, -0.16);
      rightArm.rotation.set(0, 0, 0.16);
      leftThigh.position.set(-0.44, -0.74, 0.48);
      rightThigh.position.set(0.44, -0.74, 0.48);
      leftThigh.rotation.set(Math.PI / 2, 0, 0);
      rightThigh.rotation.set(Math.PI / 2, 0, 0);
      root.rotation.y += (targetRotation - root.rotation.y) * 0.08;

      if (activeStep === 'chin') {
        head.position.z = -0.06 - motion * 0.025;
        neck.position.z = -0.02;
      } else {
        head.position.z = 0.04;
        neck.position.z = 0.02;
      }

      if (activeStep === 'shoulders') {
        shoulderBar.position.y = 0.86 - Math.abs(motion) * 0.035;
        shoulderBar.scale.x = 0.92;
      } else {
        shoulderBar.scale.x = 1;
      }

      if (activeStep === 'side-stretch') {
        body.rotation.z = -0.12 - motion * 0.025;
        head.rotation.z = -0.22 - motion * 0.025;
      }

      if (activeStep === 'rotation') {
        head.rotation.y = motion * 0.42;
      }

      if (activeStep === 'chest') {
        torso.rotation.x = -0.08;
        leftArm.position.set(-0.72, 0.2, -0.28);
        rightArm.position.set(0.72, 0.2, -0.28);
        leftArm.rotation.z = 0.18;
        rightArm.rotation.z = -0.18;
      }

      if (activeStep === 'wave') {
        torso.rotation.x = motion * 0.16;
        head.position.y = 1.63 + motion * 0.04;
      }

      if (activeStep === 'figure-four') {
        rightThigh.position.set(0.22, -0.5, 0.56);
        rightThigh.rotation.set(Math.PI / 2, 0, 1.12);
        body.rotation.x = -0.05;
      }

      if (activeStep === 'breath') {
        const scale = reduceMotion ? 1 : 1 + Math.sin(time * 1.15) * 0.045;
        torso.scale.set(0.72 * scale, 1, 0.5 * scale);
        cueObjects.breath.scale.set(scale, 1.25 * scale, scale);
      } else {
        torso.scale.set(0.72, 1, 0.5);
      }
    }

    function resize() {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(300, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = width < 520 ? 9.1 : 8.1;
      camera.updateProjectionMatrix();
    }

    function render() {
      const time = clock.getElapsedTime();
      applyPose(time);
      if (!reduceMotion) {
        cues.children.forEach((object, index) => {
          if (!object.visible) return;
          const pulse = 1 + Math.sin(time * 1.8 + index) * 0.035;
          object.scale.multiplyScalar(pulse / (object.userData.lastPulse || 1));
          object.userData.lastPulse = pulse;
        });
      }
      renderer.render(scene, camera);
      window.requestAnimationFrame(render);
    }

    canvas.addEventListener('pointerdown', (event) => {
      dragActive = true;
      dragStartX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!dragActive) return;
      const delta = Math.max(-120, Math.min(120, event.clientX - dragStartX));
      targetRotation = baseRotation + delta / 260;
    });
    canvas.addEventListener('pointerup', (event) => {
      dragActive = false;
      baseRotation = targetRotation;
      canvas.releasePointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointercancel', () => {
      dragActive = false;
    });

    window.addEventListener('resize', resize);
    setCueVisibility();
    resize();
    render();

    return {
      setStep(step) {
        activeStep = step;
        setCueVisibility();
      },
      setReduceMotion(value) {
        reduceMotion = Boolean(value);
      },
      resize
    };
  }

  function webGLAvailable() {
    try {
      const probe = document.createElement('canvas');
      return Boolean(
        window.WebGLRenderingContext
        && (
          probe.getContext('webgl2')
          || probe.getContext('webgl')
          || probe.getContext('experimental-webgl')
        )
      );
    } catch (error) {
      return false;
    }
  }

  visualController = createVisualController();

  applyPreferences();
  setCurrentStep(0, { resetTimer: true, cue: false });
  setScreen('landing');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      console.warn('Service worker registration skipped', error);
    });
  }
})();
