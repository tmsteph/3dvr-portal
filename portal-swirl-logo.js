(() => {
  const THREE_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const TAU = Math.PI * 2;
  const BASE_FACE_SPIN = TAU / 5200;
  const DRAG_WIND_FACTOR = 0.000325;
  const MAX_EXTRA_SPIN = 0.1;
  const PULL_WINDUP_FACTOR = 0.00003;
  const MAX_PULL_WINDUP_SPIN = 0.004;
  const SPIN_DECAY = 0.99;
  const FLIP_DECAY = 0.965;
  const MIN_FLIP_VELOCITY = 0.005;
  const TILT_X_LIMIT = 0.18;
  const TILT_Y_LIMIT = 0.24;
  const TWIST_LIMIT = 0.045;
  const TWIST_FACTOR = 0.0012;
  const FLIP_DISTANCE_THRESHOLD = 42;
  const FLIP_DISTANCE_FULL_CHARGE = 110;
  const FLIP_STREAK_REQUIRED = 4;
  const FLIP_ENERGY_DECAY = 0.4;
  const FLIP_STREAK_WINDOW = 3200;
  const SWIPE_STREAK_MAX = 5;
  const SWIPE_TILT_GAIN = 0.12;
  const SWIPE_SPIN_GAIN = 0.12;
  const QUICK_TAP_MAX_MS = 280;
  const QUICK_TAP_PULL_DISTANCE = 72;
  const TOUCH_RAMP_WINDOW = 2400;
  const TOUCH_RAMP_MAX = 6;
  const FIRST_TOUCH_SPIN_SCALE = 0.38;
  const TOUCH_SPIN_GAIN = 0.13;
  const FIRST_TOUCH_WOBBLE_SCALE = 0.48;
  const TOUCH_WOBBLE_GAIN = 0.32;
  const FIRST_TOUCH_FLIP_SCALE = 0.74;
  const TOUCH_FLIP_GAIN = 0.16;
  const TOUCH_INSTABILITY_IMPULSE = 0.012;
  const TOUCH_INSTABILITY_DECAY = 0.985;
  const MAX_TOUCH_INSTABILITY = 0.075;
  const MAX_FLIP_ENERGY = 1.15;
  const FLIP_IMPULSE_X = 0.22;
  const FLIP_IMPULSE_Y = 0.26;
  const FLIP_CROSS_IMPULSE = 0.055;
  const FLIP_SPIN_BOOST = 0.013;
  const FLIP_BUILD_SPIN_STEP = 0.006;
  const FLIP_BUILD_IMPULSE_STEP = 0.014;
  const FLIP_BUILD_WOBBLE_STEP = 0.026;
  const TARGET_SETTLE_BASE = 0.94;
  const CURRENT_SETTLE_BASE = 0.86;
  const FLIP_HOME_EASE = 0.075;
  const UPRIGHT_TEXT_HOME_EASE = 0.12;
  const GOOD_FACE_STEP = Math.PI;
  const UPRIGHT_TEXT_STEP = TAU;
  const DRAG_WOBBLE_FACTOR = 0.0009;
  const DRAG_TWIST_WOBBLE_FACTOR = 0.00042;
  const DRAG_WOBBLE_STREAK_GAIN = 0.32;
  const FLIP_WOBBLE_IMPULSE = 0.075;
  const WOBBLE_SPRING = 0.12;
  const WOBBLE_DECAY = 0.89;
  const MAX_WOBBLE = 0.18;
  const MAX_WOBBLE_Z = 0.09;
  const ROOT_SELECTOR = '[data-portal-swirl-logo]';
  const CANVAS_SELECTOR = '[data-portal-swirl-canvas]';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const nearestGoodFaceAngle = (angle) => Math.round(angle / GOOD_FACE_STEP) * GOOD_FACE_STEP;
  const nearestUprightTextAngle = (angle) => Math.round(angle / UPRIGHT_TEXT_STEP) * UPRIGHT_TEXT_STEP;

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-portal-three-loader]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.THREE), { once: true });
        existing.addEventListener('error', () => reject(new Error('Unable to load Three.js.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = THREE_CDN_URL;
      script.async = true;
      script.dataset.portalThreeLoader = 'true';
      script.addEventListener('load', () => resolve(window.THREE), { once: true });
      script.addEventListener('error', () => reject(new Error('Unable to load Three.js.')), { once: true });
      document.head.appendChild(script);
    });
  }

  function makeFaceTexture(THREE, mirrored = false) {
    const textureCanvas = document.createElement('canvas');
    const size = 1024;
    textureCanvas.width = size;
    textureCanvas.height = size;
    const context = textureCanvas.getContext('2d');
    const center = size / 2;
    const radius = size * 0.45;

    const shell = context.createRadialGradient(center, center, radius * 0.08, center, center, size * 0.66);
    shell.addColorStop(0, '#9de7f8');
    shell.addColorStop(0.28, '#2aa7bf');
    shell.addColorStop(0.62, '#0f766e');
    shell.addColorStop(1, '#07111f');
    context.fillStyle = shell;
    context.fillRect(0, 0, size, size);

    context.save();
    context.translate(center, center);
    if (mirrored) context.scale(-1, 1);
    for (let arm = 0; arm < 7; arm += 1) {
      context.save();
      context.rotate((arm / 7) * TAU);
      const gradient = context.createLinearGradient(0, 0, radius, radius * 0.32);
      gradient.addColorStop(0, 'rgba(226, 246, 252, 0.58)');
      gradient.addColorStop(0.5, 'rgba(125, 211, 252, 0.42)');
      gradient.addColorStop(1, 'rgba(251, 191, 36, 0.24)');
      context.strokeStyle = gradient;
      context.lineWidth = 38;
      context.lineCap = 'round';
      context.beginPath();
      for (let index = 0; index <= 88; index += 1) {
        const progress = index / 88;
        const angle = progress * TAU * 1.04;
        const r = radius * (0.13 + progress * 0.72);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r * 0.72;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.restore();
    }
    context.restore();

    context.beginPath();
    context.arc(center, center, radius * 0.97, 0, TAU);
    context.strokeStyle = '#d8fff7';
    context.lineWidth = 30;
    context.stroke();

    context.beginPath();
    context.arc(center, center, radius * 0.74, 0, TAU);
    context.strokeStyle = 'rgba(254, 215, 170, 0.74)';
    context.lineWidth = 12;
    context.stroke();

    context.beginPath();
    context.arc(center, center, radius * 0.36, 0, TAU);
    context.fillStyle = 'rgba(2, 6, 23, 0.72)';
    context.fill();
    context.strokeStyle = 'rgba(186, 230, 253, 0.38)';
    context.lineWidth = 8;
    context.stroke();

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.center.set(0.5, 0.5);
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }

  function makeTextTexture(THREE, mirrored = false) {
    const textureCanvas = document.createElement('canvas');
    const size = 1024;
    textureCanvas.width = size;
    textureCanvas.height = size;
    const context = textureCanvas.getContext('2d');
    const center = size / 2;

    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(center, center);
    if (mirrored) context.scale(-1, 1);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(0, 0, 0, 0.55)';
    context.shadowBlur = 28;
    context.fillStyle = '#ffffff';
    context.font = '900 142px Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillText('3dvr', 0, -22);
    context.fillStyle = '#ccfbf1';
    context.font = '850 82px Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillText('portal', 0, 104);
    context.restore();

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }

  function createPortalToken(THREE) {
    const group = new THREE.Group();
    const frontFaceTexture = makeFaceTexture(THREE, false);
    const backFaceTexture = makeFaceTexture(THREE, true);
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f8f8f,
      metalness: 0.68,
      roughness: 0.26,
    });
    const frontMaterial = new THREE.MeshStandardMaterial({
      map: frontFaceTexture,
      metalness: 0.4,
      roughness: 0.22,
    });
    const backMaterial = new THREE.MeshStandardMaterial({
      map: backFaceTexture,
      metalness: 0.42,
      roughness: 0.26,
    });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.45, 0.34, 128, 1, false),
      [sideMaterial, frontMaterial, backMaterial],
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xfed7aa,
      metalness: 0.82,
      roughness: 0.18,
    });
    const frontRim = new THREE.Mesh(new THREE.TorusGeometry(1.47, 0.04, 16, 128), rimMaterial);
    frontRim.position.z = 0.185;
    group.add(frontRim);

    const backRim = frontRim.clone();
    backRim.position.z = -0.185;
    group.add(backRim);

    const textGeometry = new THREE.PlaneGeometry(2.22, 2.22);
    const frontText = new THREE.Mesh(
      textGeometry,
      new THREE.MeshBasicMaterial({
        map: makeTextTexture(THREE, false),
        transparent: true,
        depthWrite: false,
      }),
    );
    frontText.position.z = 0.225;
    group.add(frontText);

    const backText = new THREE.Mesh(
      textGeometry,
      new THREE.MeshBasicMaterial({
        map: makeTextTexture(THREE, false),
        transparent: true,
        depthWrite: false,
      }),
    );
    backText.position.z = -0.225;
    backText.rotation.y = Math.PI;
    group.add(backText);

    group.userData.faceTextures = [frontFaceTexture, backFaceTexture];

    return group;
  }

  function setupPortalLogo(root) {
    const canvas = root.querySelector(CANVAS_SELECTOR);
    if (!canvas) return null;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = {
      ready: false,
      mode: 'initializing',
      dragging: false,
      paused: false,
      pointerMoved: false,
      lastX: 0,
      lastY: 0,
      dragDX: 0,
      dragDY: 0,
      gestureDX: 0,
      gestureDY: 0,
      dragStartedAt: 0,
      lastPointerDownDuration: 0,
      lastTapStimulatedAt: 0,
      lastTimestamp: 0,
      faceSpin: 0,
      extraFaceSpin: 0,
      pullWindupSpin: 0,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      currentX: 0,
      currentY: 0,
      currentZ: 0,
      flipX: 0,
      flipY: 0,
      flipVelocityX: 0,
      flipVelocityY: 0,
      flipStreakAxis: '',
      flipStreakDirection: 0,
      flipStreakCount: 0,
      flipStreakEnergy: 0,
      lastFlipGestureAt: 0,
      swipeStreakAxis: '',
      swipeStreakDirection: 0,
      swipeStreakCount: 0,
      lastSwipeAt: 0,
      touchRampCount: 0,
      lastTouchRampAt: 0,
      touchInstability: 0,
      wobbleX: 0,
      wobbleY: 0,
      wobbleZ: 0,
      wobbleVelocityX: 0,
      wobbleVelocityY: 0,
      wobbleVelocityZ: 0,
      renderer: null,
      scene: null,
      camera: null,
      token: null,
      fallbackContext: null,
      frame: 0,
    };

    const getRect = () => root.getBoundingClientRect();

    const resize = () => {
      const rect = getRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (state.renderer && state.camera) {
        state.renderer.setPixelRatio(dpr);
        state.renderer.setSize(width, height, false);
        state.camera.aspect = width / height;
        state.camera.updateProjectionMatrix();
        return;
      }

      if (state.fallbackContext) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        state.fallbackContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    const getPointer = (event) => {
      const rect = getRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        rect,
      };
    };

    const capturePointer = (event) => {
      if (event.pointerId == null || !root.setPointerCapture) return;
      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic smoke-test events and older browsers can reject capture.
      }
    };

    const releasePointer = (event) => {
      if (event.pointerId == null || !root.releasePointerCapture) return;
      try {
        root.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional; release behavior should never block settling.
      }
    };

    const setPaused = (paused) => {
      state.paused = Boolean(paused);
      root.dataset.logoPaused = String(state.paused);
    };

    const getGesture = () => {
      const absX = Math.abs(state.gestureDX);
      const absY = Math.abs(state.gestureDY);
      const axis = absX >= absY ? 'y' : 'x';
      const distance = Math.max(absX, absY);
      const direction = axis === 'y' ? Math.sign(state.gestureDX) : Math.sign(state.gestureDY);

      return { axis, direction, distance };
    };

    const getActiveSwipeStreakCount = () => {
      const { axis, direction, distance } = getGesture();
      if (!direction || distance < 8) return state.swipeStreakCount;

      return state.swipeStreakAxis === axis && state.swipeStreakDirection === direction
        ? state.swipeStreakCount
        : 0;
    };

    const getSwipeBoost = () => 1 + Math.min(getActiveSwipeStreakCount(), SWIPE_STREAK_MAX) * SWIPE_TILT_GAIN;
    const getSpinBoost = () => 1 + Math.min(getActiveSwipeStreakCount(), SWIPE_STREAK_MAX) * SWIPE_SPIN_GAIN;
    const getTouchRampLevel = () => Math.max(0, state.touchRampCount - 1);
    const getTouchSpinScale = () => FIRST_TOUCH_SPIN_SCALE + getTouchRampLevel() * TOUCH_SPIN_GAIN;
    const getTouchWobbleScale = () => FIRST_TOUCH_WOBBLE_SCALE + getTouchRampLevel() * TOUCH_WOBBLE_GAIN;
    const getTouchFlipScale = () =>
      state.touchRampCount > 0 ? FIRST_TOUCH_FLIP_SCALE + getTouchRampLevel() * TOUCH_FLIP_GAIN : 1;

    const updateSwipeStreak = ({ axis, direction, distance }) => {
      if (!direction || distance < FLIP_DISTANCE_THRESHOLD) {
        state.swipeStreakCount = 0;
        return;
      }

      const now = window.performance?.now?.() ?? Date.now();
      const sameSwipe =
        state.swipeStreakAxis === axis &&
        state.swipeStreakDirection === direction &&
        now - state.lastSwipeAt < FLIP_STREAK_WINDOW;

      state.swipeStreakAxis = axis;
      state.swipeStreakDirection = direction;
      state.swipeStreakCount = sameSwipe ? Math.min(state.swipeStreakCount + 1, SWIPE_STREAK_MAX) : 1;
      state.lastSwipeAt = now;
    };

    const updateTouchRamp = () => {
      const now = window.performance?.now?.() ?? Date.now();
      const recentTouch = state.lastTouchRampAt > 0 && now - state.lastTouchRampAt < TOUCH_RAMP_WINDOW;
      state.touchRampCount = recentTouch ? Math.min(state.touchRampCount + 1, TOUCH_RAMP_MAX) : 1;
      state.lastTouchRampAt = now;

      const rampLevel = getTouchRampLevel();
      if (rampLevel <= 0) return;

      const jitterSign = Math.sin(now * 0.019) >= 0 ? 1 : -1;
      const instabilityImpulse = rampLevel * TOUCH_INSTABILITY_IMPULSE;
      state.touchInstability = clamp(
        state.touchInstability + instabilityImpulse,
        0,
        MAX_TOUCH_INSTABILITY,
      );
      state.wobbleVelocityX += jitterSign * instabilityImpulse;
      state.wobbleVelocityY -= jitterSign * instabilityImpulse * 0.74;
      state.wobbleVelocityZ += jitterSign * instabilityImpulse * 0.42;
    };

    const setTiltFromPointer = (event, dx = 0, dy = 0) => {
      const point = getPointer(event);
      const centerX = point.rect.width / 2;
      const centerY = point.rect.height / 2;
      const tiltBoost = getSwipeBoost();
      state.targetY = clamp((point.x - centerX) / centerX, -1, 1) * TILT_Y_LIMIT * tiltBoost;
      state.targetX = clamp((point.y - centerY) / centerY, -1, 1) * TILT_X_LIMIT * tiltBoost;
      state.targetZ = clamp((dx - dy) * TWIST_FACTOR, -TWIST_LIMIT, TWIST_LIMIT);
    };

    const registerFlipGesture = (axis, direction, distance) => {
      if (!direction || distance < FLIP_DISTANCE_THRESHOLD) {
        state.flipStreakEnergy *= FLIP_ENERGY_DECAY;
        state.flipStreakCount = 0;
        return;
      }

      const now = window.performance?.now?.() ?? Date.now();
      const sameGesture =
        state.flipStreakAxis === axis &&
        state.flipStreakDirection === direction &&
        now - state.lastFlipGestureAt < FLIP_STREAK_WINDOW;
      const energyGain = clamp(
        (distance - FLIP_DISTANCE_THRESHOLD) / FLIP_DISTANCE_FULL_CHARGE,
        0.16,
        0.36,
      );

      state.flipStreakEnergy = sameGesture
        ? clamp(state.flipStreakEnergy + energyGain, 0, MAX_FLIP_ENERGY)
        : energyGain;
      state.flipStreakCount = sameGesture ? state.flipStreakCount + 1 : 1;
      state.flipStreakAxis = axis;
      state.flipStreakDirection = direction;
      state.lastFlipGestureAt = now;

      const buildLevel = Math.min(state.flipStreakCount, FLIP_STREAK_REQUIRED);
      const buildScale = (1 + clamp(state.flipStreakEnergy, 0, MAX_FLIP_ENERGY) * 0.28) * getTouchFlipScale();
      const buildTilt = FLIP_BUILD_IMPULSE_STEP * buildLevel * buildScale;
      const buildWobble = FLIP_BUILD_WOBBLE_STEP * buildLevel * buildScale;

      if (axis === 'y') {
        state.targetY = clamp(state.targetY + direction * buildTilt, -TILT_Y_LIMIT, TILT_Y_LIMIT);
        state.wobbleVelocityY += direction * buildWobble;
      } else {
        state.targetX = clamp(state.targetX + direction * buildTilt, -TILT_X_LIMIT, TILT_X_LIMIT);
        state.wobbleVelocityX += direction * buildWobble;
      }
      state.extraFaceSpin = clamp(
        state.extraFaceSpin + FLIP_BUILD_SPIN_STEP * buildLevel * buildScale,
        -MAX_EXTRA_SPIN,
        MAX_EXTRA_SPIN,
      );

      if (state.flipStreakCount < FLIP_STREAK_REQUIRED) return;

      const impulseScale = (1 + clamp(state.flipStreakEnergy, 0, MAX_FLIP_ENERGY) * 0.35) * getTouchFlipScale();
      const wobbleSign = Math.sin(now * 0.017 + (axis === 'y' ? 0 : 1.7)) >= 0 ? 1 : -1;
      if (axis === 'y') {
        state.flipVelocityY += direction * FLIP_IMPULSE_Y * impulseScale;
        state.flipVelocityX += wobbleSign * FLIP_CROSS_IMPULSE * impulseScale;
        state.wobbleVelocityX += wobbleSign * FLIP_WOBBLE_IMPULSE * impulseScale;
        state.wobbleVelocityY += direction * FLIP_WOBBLE_IMPULSE * 0.55 * impulseScale;
      } else {
        state.flipVelocityX += direction * FLIP_IMPULSE_X * impulseScale;
        state.flipVelocityY += wobbleSign * FLIP_CROSS_IMPULSE * impulseScale;
        state.wobbleVelocityY += wobbleSign * FLIP_WOBBLE_IMPULSE * impulseScale;
        state.wobbleVelocityX += direction * FLIP_WOBBLE_IMPULSE * 0.55 * impulseScale;
      }
      state.wobbleVelocityZ += wobbleSign * FLIP_WOBBLE_IMPULSE * 0.5 * impulseScale;
      state.extraFaceSpin = clamp(
        state.extraFaceSpin + FLIP_SPIN_BOOST * impulseScale,
        -MAX_EXTRA_SPIN,
        MAX_EXTRA_SPIN,
      );
      state.flipStreakCount = 0;
      state.flipStreakEnergy = 0;
    };

    const addDirectionalFlipImpulse = ({ axis, direction, distance }) => {
      registerFlipGesture(axis, direction, distance);
    };

    const stimulateQuickTap = () => {
      const now = window.performance?.now?.() ?? Date.now();
      state.lastTapStimulatedAt = now;
      const gesture = {
        axis: 'y',
        direction: 1,
        distance: QUICK_TAP_PULL_DISTANCE,
      };
      updateSwipeStreak(gesture);
      addDirectionalFlipImpulse(gesture);
      state.extraFaceSpin = clamp(
        state.extraFaceSpin + QUICK_TAP_PULL_DISTANCE * 0.00045 * getSpinBoost() * getTouchSpinScale(),
        -MAX_EXTRA_SPIN,
        MAX_EXTRA_SPIN,
      );
      state.wobbleVelocityY += FLIP_BUILD_WOBBLE_STEP * getTouchWobbleScale();
    };

    const startDrag = (event) => {
      const point = getPointer(event);
      state.dragging = true;
      setPaused(true);
      state.pointerMoved = false;
      state.lastX = point.x;
      state.lastY = point.y;
      state.dragDX = 0;
      state.dragDY = 0;
      state.gestureDX = 0;
      state.gestureDY = 0;
      state.dragStartedAt = window.performance?.now?.() ?? Date.now();
      state.pullWindupSpin = 0;
      updateTouchRamp();
      capturePointer(event);
      event.preventDefault();
    };

    const drag = (event) => {
      if (!state.dragging) return;
      const point = getPointer(event);
      const dx = point.x - state.lastX;
      const dy = point.y - state.lastY;
      const distance = Math.hypot(dx, dy);
      if (distance > 3) {
        state.pointerMoved = true;
      }
      state.lastX = point.x;
      state.lastY = point.y;
      state.dragDX = dx;
      state.dragDY = dy;
      state.gestureDX += dx;
      state.gestureDY += dy;
      const touchSpinScale = getTouchSpinScale();
      state.pullWindupSpin = clamp(
        state.pullWindupSpin + distance * PULL_WINDUP_FACTOR * getSpinBoost() * touchSpinScale,
        0,
        MAX_PULL_WINDUP_SPIN,
      );
      state.extraFaceSpin = clamp(
        state.extraFaceSpin + distance * DRAG_WIND_FACTOR * getSpinBoost() * touchSpinScale,
        -MAX_EXTRA_SPIN,
        MAX_EXTRA_SPIN,
      );
      const wobbleMultiplier =
        (1 + Math.min(state.flipStreakCount, 3) * DRAG_WOBBLE_STREAK_GAIN) * getTouchWobbleScale();
      state.wobbleVelocityY += dx * DRAG_WOBBLE_FACTOR * wobbleMultiplier;
      state.wobbleVelocityX += dy * DRAG_WOBBLE_FACTOR * wobbleMultiplier;
      state.wobbleVelocityZ += (dx - dy) * DRAG_TWIST_WOBBLE_FACTOR * wobbleMultiplier;
      state.wobbleVelocityX += state.touchInstability * Math.sign(dy || dx || 1) * 0.12;
      state.wobbleVelocityZ += state.touchInstability * Math.sign(dx - dy || 1) * 0.08;
      setTiltFromPointer(event, dx, dy);
      event.preventDefault();
    };

    const endDrag = (event = {}) => {
      if (!state.dragging) return;
      state.dragging = false;
      releasePointer(event);

      const wasTap = !state.pointerMoved && Math.hypot(state.gestureDX, state.gestureDY) < 6;
      const now = window.performance?.now?.() ?? Date.now();
      state.lastPointerDownDuration = now - state.dragStartedAt;
      if (wasTap) {
        if (state.lastPointerDownDuration <= QUICK_TAP_MAX_MS) {
          stimulateQuickTap();
        }
        setPaused(false);
        return;
      }

      const gesture = getGesture();
      updateSwipeStreak(gesture);
      addDirectionalFlipImpulse(gesture);
      state.extraFaceSpin = clamp(
        state.extraFaceSpin +
          Math.hypot(state.dragDX, state.dragDY) * 0.0009 * getSpinBoost() * getTouchSpinScale(),
        -MAX_EXTRA_SPIN,
        MAX_EXTRA_SPIN,
      );
      setPaused(false);
    };

    const setupInteraction = () => {
      window.addEventListener('resize', resize);
      root.addEventListener('pointerdown', startDrag);
      root.addEventListener('pointermove', drag);
      root.addEventListener('pointerup', endDrag);
      root.addEventListener('pointercancel', endDrag);
      root.addEventListener('lostpointercapture', endDrag);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
      root.addEventListener('click', (event) => {
        const now = window.performance?.now?.() ?? Date.now();
        if (state.dragging || state.lastPointerDownDuration > QUICK_TAP_MAX_MS) return;
        if (now - state.lastTapStimulatedAt < 160) return;
        stimulateQuickTap();
        setPaused(false);
        event.preventDefault();
      });

      root.addEventListener('keydown', (event) => {
        if (event.key === ' ') {
          if (!event.repeat) setPaused(true);
          event.preventDefault();
        } else if (event.key === 'ArrowRight') {
          setPaused(false);
          state.extraFaceSpin = clamp(state.extraFaceSpin + 0.012, -MAX_EXTRA_SPIN, MAX_EXTRA_SPIN);
          registerFlipGesture('y', 1, FLIP_DISTANCE_FULL_CHARGE);
          event.preventDefault();
        } else if (event.key === 'ArrowLeft') {
          setPaused(false);
          state.extraFaceSpin = clamp(state.extraFaceSpin + 0.008, -MAX_EXTRA_SPIN, MAX_EXTRA_SPIN);
          registerFlipGesture('y', -1, FLIP_DISTANCE_FULL_CHARGE);
          event.preventDefault();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          setPaused(false);
          registerFlipGesture('x', event.key === 'ArrowUp' ? -1 : 1, FLIP_DISTANCE_FULL_CHARGE);
          event.preventDefault();
        }
      });
      root.addEventListener('keyup', (event) => {
        if (event.key === ' ') {
          setPaused(false);
          event.preventDefault();
        }
      });
    };

    const drawFallback = () => {
      const context = state.fallbackContext;
      if (!context) return;

      const rect = getRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const centerX = width / 2;
      const centerY = height / 2;
      const size = Math.min(width, height);
      const radius = size * 0.42;
      const surfaceY = state.currentY + state.flipY + state.wobbleY;
      const tiltScaleX = Math.max(0.2, Math.abs(Math.cos(surfaceY)) * 0.76 + 0.24);
      const tiltScaleY = Math.max(0.52, Math.cos(state.currentX + state.flipX + state.wobbleX) * 0.2 + 0.78);

      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(centerX, centerY);
      context.rotate(state.currentZ + state.wobbleZ);
      context.scale(tiltScaleX, tiltScaleY);

      const faceGradient = context.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius);
      faceGradient.addColorStop(0, '#9de7f8');
      faceGradient.addColorStop(0.28, '#2aa7bf');
      faceGradient.addColorStop(0.62, '#0f766e');
      faceGradient.addColorStop(1, '#07111f');
      context.beginPath();
      context.arc(0, 0, radius, 0, TAU);
      context.fillStyle = faceGradient;
      context.fill();

      for (let arm = 0; arm < 7; arm += 1) {
        context.save();
        context.rotate((arm / 7) * TAU + state.faceSpin * 0.7);
        context.beginPath();
        for (let index = 0; index <= 58; index += 1) {
          const progress = index / 58;
          const angle = progress * TAU * 1.05;
          const r = radius * (0.12 + progress * 0.72);
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r * 0.72;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = 'rgba(186, 230, 253, 0.38)';
        context.lineWidth = Math.max(4, radius * 0.066);
        context.lineCap = 'round';
        context.stroke();
        context.restore();
      }

      context.lineWidth = Math.max(7, size * 0.04);
      context.strokeStyle = '#d8fff7';
      context.beginPath();
      context.arc(0, 0, radius, 0, TAU);
      context.stroke();

      context.lineWidth = Math.max(3, size * 0.012);
      context.strokeStyle = 'rgba(254, 215, 170, 0.74)';
      context.beginPath();
      context.arc(0, 0, radius * 0.74, 0, TAU);
      context.stroke();

      context.beginPath();
      context.arc(0, 0, radius * 0.36, 0, TAU);
      context.fillStyle = 'rgba(2, 6, 23, 0.72)';
      context.fill();

      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.shadowColor = 'rgba(0, 0, 0, 0.45)';
      context.shadowBlur = size * 0.03;
      context.fillStyle = '#ffffff';
      context.font = `900 ${Math.max(18, size * 0.15)}px Inter, system-ui, sans-serif`;
      context.fillText('3dvr', 0, -size * 0.02);
      context.fillStyle = '#ccfbf1';
      context.font = `800 ${Math.max(11, size * 0.085)}px Inter, system-ui, sans-serif`;
      context.fillText('portal', 0, size * 0.12);
      context.restore();
    };

    const render = () => {
      const rotationX = state.currentX + state.flipX + state.wobbleX;
      const rotationY = state.currentY + state.flipY + state.wobbleY;
      const rotationZ = state.currentZ + state.wobbleZ;

      if (state.renderer && state.scene && state.camera && state.token) {
        state.token.rotation.set(rotationX, rotationY, rotationZ);
        for (const texture of state.token.userData.faceTextures || []) {
          texture.rotation = state.faceSpin;
        }
        state.renderer.render(state.scene, state.camera);
        return;
      }

      drawFallback();
    };

    const animate = (timestamp = 0) => {
      state.frame = window.requestAnimationFrame(animate);
      const rawElapsed = state.lastTimestamp ? Math.min(timestamp - state.lastTimestamp, 250) : 16.67;
      const spinElapsed = Math.min(rawElapsed, 64);
      state.lastTimestamp = timestamp;
      const frames = rawElapsed / 16.67;
      const targetSettle = 1 - Math.pow(TARGET_SETTLE_BASE, frames);
      const currentSettle = 1 - Math.pow(CURRENT_SETTLE_BASE, frames);

      if (!state.dragging) {
        state.targetX = lerp(state.targetX, 0, targetSettle);
        state.targetY = lerp(state.targetY, 0, targetSettle);
        state.targetZ = lerp(state.targetZ, 0, targetSettle);
        state.pullWindupSpin = lerp(state.pullWindupSpin, 0, currentSettle);
        state.extraFaceSpin *= Math.pow(SPIN_DECAY, frames);
      }

      state.currentX = lerp(state.currentX, state.targetX, currentSettle);
      state.currentY = lerp(state.currentY, state.targetY, currentSettle);
      state.currentZ = lerp(state.currentZ, state.targetZ, currentSettle);
      state.flipX += state.flipVelocityX * frames;
      state.flipY += state.flipVelocityY * frames;
      state.flipVelocityX *= Math.pow(FLIP_DECAY, frames);
      state.flipVelocityY *= Math.pow(FLIP_DECAY, frames);
      state.wobbleVelocityX += -state.wobbleX * WOBBLE_SPRING * frames;
      state.wobbleVelocityY += -state.wobbleY * WOBBLE_SPRING * frames;
      state.wobbleVelocityZ += -state.wobbleZ * WOBBLE_SPRING * frames;
      state.touchInstability *= Math.pow(TOUCH_INSTABILITY_DECAY, frames);
      state.wobbleVelocityX *= Math.pow(WOBBLE_DECAY, frames);
      state.wobbleVelocityY *= Math.pow(WOBBLE_DECAY, frames);
      state.wobbleVelocityZ *= Math.pow(WOBBLE_DECAY, frames);
      state.wobbleX = clamp(state.wobbleX + state.wobbleVelocityX * frames, -MAX_WOBBLE, MAX_WOBBLE);
      state.wobbleY = clamp(state.wobbleY + state.wobbleVelocityY * frames, -MAX_WOBBLE, MAX_WOBBLE);
      state.wobbleZ = clamp(state.wobbleZ + state.wobbleVelocityZ * frames, -MAX_WOBBLE_Z, MAX_WOBBLE_Z);

      if (Math.abs(state.flipVelocityX) < MIN_FLIP_VELOCITY) {
        state.flipVelocityX = 0;
        state.flipX = lerp(state.flipX, nearestUprightTextAngle(state.flipX), UPRIGHT_TEXT_HOME_EASE);
      }
      if (Math.abs(state.flipVelocityY) < MIN_FLIP_VELOCITY) {
        state.flipVelocityY = 0;
        state.flipY = lerp(state.flipY, nearestGoodFaceAngle(state.flipY), FLIP_HOME_EASE);
      }

      const baseSpin = state.paused ? 0 : reducedMotion ? BASE_FACE_SPIN * 0.28 : BASE_FACE_SPIN;
      const extraSpin = state.paused ? 0 : state.extraFaceSpin;
      const pullWindupSpin = state.dragging ? state.pullWindupSpin : 0;
      state.faceSpin += (baseSpin + extraSpin + pullWindupSpin) * spinElapsed;
      render();
    };

    const markReady = (mode) => {
      state.ready = true;
      state.mode = mode;
      root.dataset.logoReady = 'true';
      window.__portalSwirlLogo = {
        ready: true,
        mode,
        getState: () => ({
          mode: state.mode,
          dragging: state.dragging,
          paused: state.paused,
          faceSpin: state.faceSpin,
          extraFaceSpin: state.extraFaceSpin,
          pullWindupSpin: state.pullWindupSpin,
          targetX: state.targetX,
          targetY: state.targetY,
          targetZ: state.targetZ,
          currentX: state.currentX,
          currentY: state.currentY,
          currentZ: state.currentZ,
          flipX: state.flipX,
          flipY: state.flipY,
          flipVelocityX: state.flipVelocityX,
          flipVelocityY: state.flipVelocityY,
          swipeStreakCount: state.swipeStreakCount,
          swipeStreakAxis: state.swipeStreakAxis,
          swipeStreakDirection: state.swipeStreakDirection,
          touchRampCount: state.touchRampCount,
          touchInstability: state.touchInstability,
          flipStreakCount: state.flipStreakCount,
          flipStreakEnergy: state.flipStreakEnergy,
          wobbleX: state.wobbleX,
          wobbleY: state.wobbleY,
          wobbleZ: state.wobbleZ,
        }),
      };
    };

    const initFallback = (error) => {
      console.warn('3dvr portal Three.js logo fallback active:', error);
      state.fallbackContext = canvas.getContext('2d');
      if (!state.fallbackContext) {
        window.__portalSwirlLogo = { ready: false };
        return;
      }
      resize();
      setupInteraction();
      markReady('canvas-fallback');
      animate();
    };

    const initThree = async () => {
      try {
        const THREE = await loadThree();
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        });
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 5);

        const token = createPortalToken(THREE);
        scene.add(token);
        scene.add(new THREE.AmbientLight(0xe2fff8, 0.72));

        const key = new THREE.DirectionalLight(0xffffff, 1.35);
        key.position.set(2.5, 2.8, 4.5);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0x99f6e4, 0.62);
        fill.position.set(-3, -1.5, 2);
        scene.add(fill);

        state.renderer = renderer;
        state.scene = scene;
        state.camera = camera;
        state.token = token;

        resize();
        setupInteraction();
        markReady('webgl');
        animate();
      } catch (error) {
        initFallback(error);
      }
    };

    initThree();
    return state;
  }

  const init = () => {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;
    setupPortalLogo(root);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
