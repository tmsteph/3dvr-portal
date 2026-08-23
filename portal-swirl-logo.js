(() => {
  const THREE_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const TAU = Math.PI * 2;
  const ROOT_SELECTOR = '[data-portal-swirl-logo]';
  const CANVAS_SELECTOR = '[data-portal-swirl-canvas]';

  const BASE_FACE_SPIN = TAU / 5200;
  const DRAG_SPIN_GAIN = 0.00012;
  const MAX_EXTRA_SPIN = 0.04;
  const SPIN_DECAY = 0.994;
  const TILT_X_LIMIT = 0.52;
  const TILT_Y_LIMIT = 0.68;
  const TILT_GAIN = 0.0042;
  const WOBBLE_DECAY = 0.9;
  const WOBBLE_SPRING = 0.115;
  const MAX_WOBBLE = 0.2;
  const HOLD_PAUSE_DELAY_MS = 260;
  const QUICK_TAP_MAX_MS = 280;
  const COMBO_WINDOW_MS = 2400;
  const COMBO_MAX = 8;
  const SPARK_LIFETIME_MS = 760;
  const SPARK_BURST_MAX = 28;

  const GOLD = {
    highlight: '#fff8bf',
    light: '#ffe66a',
    mid: '#f7bf24',
    deep: '#d68a04',
    shadow: '#7a4300',
    ink: '#6e3d00',
    cream: '#fff3b0',
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;

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

  function makeGoldFaceTexture(THREE, mirrored = false) {
    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const center = size / 2;
    const radius = size * 0.475;

    context.clearRect(0, 0, size, size);

    const shell = context.createRadialGradient(
      center - radius * 0.28,
      center - radius * 0.34,
      radius * 0.03,
      center,
      center,
      radius * 1.05,
    );
    shell.addColorStop(0, GOLD.highlight);
    shell.addColorStop(0.16, GOLD.light);
    shell.addColorStop(0.48, GOLD.mid);
    shell.addColorStop(0.78, GOLD.deep);
    shell.addColorStop(1, GOLD.shadow);
    context.fillStyle = shell;
    context.fillRect(0, 0, size, size);

    context.save();
    context.translate(center, center);
    if (mirrored) context.scale(-1, 1);

    for (let ray = 0; ray < 72; ray += 1) {
      const angle = (ray / 72) * TAU;
      const inner = radius * 0.38;
      const outer = radius * 0.88;
      context.beginPath();
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      context.strokeStyle = ray % 2
        ? 'rgba(255, 247, 180, 0.045)'
        : 'rgba(112, 61, 0, 0.035)';
      context.lineWidth = 5;
      context.stroke();
    }

    for (let arm = 0; arm < 7; arm += 1) {
      context.save();
      context.rotate((arm / 7) * TAU);
      const gradient = context.createLinearGradient(0, 0, radius, radius * 0.25);
      gradient.addColorStop(0, 'rgba(255, 255, 224, 0.56)');
      gradient.addColorStop(0.45, 'rgba(255, 225, 90, 0.42)');
      gradient.addColorStop(1, 'rgba(125, 67, 0, 0.24)');
      context.strokeStyle = gradient;
      context.lineWidth = 34;
      context.lineCap = 'round';
      context.beginPath();
      for (let index = 0; index <= 80; index += 1) {
        const progress = index / 80;
        const angle = progress * TAU * 0.94;
        const r = radius * (0.12 + progress * 0.68);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r * 0.76;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.restore();
    }

    context.beginPath();
    context.arc(0, 0, radius * 0.9, 0, TAU);
    context.strokeStyle = 'rgba(255, 250, 196, 0.9)';
    context.lineWidth = 24;
    context.stroke();

    context.beginPath();
    context.arc(0, 0, radius * 0.79, 0, TAU);
    context.strokeStyle = 'rgba(119, 63, 0, 0.34)';
    context.lineWidth = 10;
    context.stroke();

    const centerMedallion = context.createRadialGradient(
      -radius * 0.09,
      -radius * 0.12,
      radius * 0.02,
      0,
      0,
      radius * 0.38,
    );
    centerMedallion.addColorStop(0, '#fffbd4');
    centerMedallion.addColorStop(0.34, '#ffdd51');
    centerMedallion.addColorStop(0.75, '#efa916');
    centerMedallion.addColorStop(1, '#b76b00');
    context.beginPath();
    context.arc(0, 0, radius * 0.37, 0, TAU);
    context.fillStyle = centerMedallion;
    context.fill();
    context.strokeStyle = 'rgba(255, 246, 174, 0.84)';
    context.lineWidth = 12;
    context.stroke();

    context.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.center.set(0.5, 0.5);
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }

  function makeTextTexture(THREE) {
    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const center = size / 2;

    context.clearRect(0, 0, size, size);
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    context.shadowColor = 'rgba(91, 48, 0, 0.62)';
    context.shadowBlur = 24;
    context.shadowOffsetY = 14;
    context.lineJoin = 'round';
    context.lineWidth = 18;
    context.strokeStyle = '#8a4c00';
    context.fillStyle = '#fff7bf';
    context.font = '950 178px Inter, ui-sans-serif, system-ui, sans-serif';
    context.strokeText('3DVR', center, center - 26);
    context.fillText('3DVR', center, center - 26);

    context.shadowBlur = 14;
    context.shadowOffsetY = 8;
    context.lineWidth = 10;
    context.strokeStyle = '#9b5900';
    context.fillStyle = '#ffe174';
    context.font = '900 72px Inter, ui-sans-serif, system-ui, sans-serif';
    context.strokeText('PORTAL', center, center + 126);
    context.fillText('PORTAL', center, center + 126);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }

  function createPortalCoin(THREE) {
    const group = new THREE.Group();
    const frontFaceTexture = makeGoldFaceTexture(THREE, false);
    const backFaceTexture = makeGoldFaceTexture(THREE, true);

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd88c08,
      metalness: 0.94,
      roughness: 0.16,
    });

    const faceMaterialFront = new THREE.MeshStandardMaterial({
      map: frontFaceTexture,
      color: 0xffffff,
      metalness: 0.78,
      roughness: 0.2,
    });

    const faceMaterialBack = new THREE.MeshStandardMaterial({
      map: backFaceTexture,
      color: 0xffffff,
      metalness: 0.8,
      roughness: 0.22,
    });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.45, 0.34, 128, 1, false),
      [edgeMaterial, faceMaterialFront, faceMaterialBack],
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd23f,
      metalness: 0.98,
      roughness: 0.1,
    });

    const rimGeometry = new THREE.TorusGeometry(1.46, 0.055, 18, 128);
    const frontRim = new THREE.Mesh(rimGeometry, rimMaterial);
    frontRim.position.z = 0.19;
    group.add(frontRim);

    const backRim = frontRim.clone();
    backRim.position.z = -0.19;
    group.add(backRim);

    const innerRingGeometry = new THREE.TorusGeometry(1.16, 0.018, 10, 128);
    const innerRingMaterial = new THREE.MeshStandardMaterial({
      color: 0xffef8b,
      metalness: 0.95,
      roughness: 0.12,
    });
    const frontInnerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
    frontInnerRing.position.z = 0.205;
    group.add(frontInnerRing);
    const backInnerRing = frontInnerRing.clone();
    backInnerRing.position.z = -0.205;
    group.add(backInnerRing);

    const reedMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc62e,
      metalness: 0.92,
      roughness: 0.21,
    });
    for (let index = 0; index < 36; index += 1) {
      const angle = (index / 36) * TAU;
      const reed = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.2, 0.045), reedMaterial);
      reed.position.set(Math.cos(angle) * 1.455, Math.sin(angle) * 1.455, 0);
      reed.rotation.z = angle;
      group.add(reed);
    }

    const textTexture = makeTextTexture(THREE);
    const textMaterial = new THREE.MeshBasicMaterial({
      map: textTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.98,
    });
    const textGeometry = new THREE.PlaneGeometry(2.2, 2.2);
    const frontText = new THREE.Mesh(textGeometry, textMaterial);
    frontText.position.z = 0.23;
    group.add(frontText);

    const backText = new THREE.Mesh(textGeometry, textMaterial.clone());
    backText.position.z = -0.23;
    backText.rotation.y = Math.PI;
    group.add(backText);

    group.userData.faceTextures = [frontFaceTexture, backFaceTexture];
    return group;
  }

  function setupPortalLogo(root) {
    const canvas = root.querySelector(CANVAS_SELECTOR);
    if (!canvas) return null;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const state = {
      ready: false,
      mode: 'initializing',
      dragging: false,
      paused: false,
      pointerMoved: false,
      lastX: 0,
      lastY: 0,
      gestureDX: 0,
      gestureDY: 0,
      dragStartedAt: 0,
      lastPointerDownDuration: 0,
      holdPauseTimer: 0,
      lastTimestamp: 0,
      faceSpin: 0,
      extraFaceSpin: 0,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      currentX: 0,
      currentY: 0,
      currentZ: 0,
      wobbleX: 0,
      wobbleY: 0,
      wobbleZ: 0,
      wobbleVelocityX: 0,
      wobbleVelocityY: 0,
      wobbleVelocityZ: 0,
      comboCount: 0,
      lastMagicAt: 0,
      magicLevel: 0,
      renderer: null,
      scene: null,
      camera: null,
      token: null,
      fallbackContext: null,
      sparkLayer: null,
      halo: null,
      frame: 0,
    };

    const getRect = () => root.getBoundingClientRect();
    const now = () => window.performance?.now?.() ?? Date.now();

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

    const setPaused = paused => {
      state.paused = Boolean(paused);
      root.dataset.logoPaused = String(state.paused);
    };

    const capturePointer = event => {
      if (event.pointerId == null || !root.setPointerCapture) return;
      try { root.setPointerCapture(event.pointerId); } catch {}
    };

    const releasePointer = event => {
      if (event.pointerId == null || !root.releasePointerCapture) return;
      try { root.releasePointerCapture(event.pointerId); } catch {}
    };

    const ensureMagicLayer = () => {
      if (state.sparkLayer) return state.sparkLayer;
      const layer = document.createElement('span');
      layer.setAttribute('aria-hidden', 'true');
      Object.assign(layer.style, {
        position: 'absolute',
        inset: '-18%',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: '3',
      });
      root.appendChild(layer);
      state.sparkLayer = layer;
      return layer;
    };

    const ensureHalo = () => {
      if (state.halo) return state.halo;
      const halo = document.createElement('span');
      halo.setAttribute('aria-hidden', 'true');
      Object.assign(halo.style, {
        position: 'absolute',
        inset: '7%',
        borderRadius: '50%',
        border: '2px solid rgba(255, 228, 103, 0.7)',
        boxShadow: '0 0 24px rgba(255, 199, 50, 0.28), inset 0 0 20px rgba(255, 239, 151, 0.2)',
        opacity: '0',
        transform: 'scale(0.82)',
        transition: 'transform 420ms cubic-bezier(.16,1,.3,1), opacity 420ms ease-out',
        pointerEvents: 'none',
        zIndex: '1',
      });
      root.appendChild(halo);
      state.halo = halo;
      return halo;
    };

    const pulseHalo = (strength = 1) => {
      if (reducedMotion) return;
      const halo = ensureHalo();
      halo.style.opacity = String(clamp(0.28 + strength * 0.15, 0, 0.82));
      halo.style.transform = `scale(${0.9 + strength * 0.09})`;
      window.setTimeout(() => {
        halo.style.opacity = '0';
        halo.style.transform = 'scale(1.42)';
      }, 30);
    };

    const spawnSparks = (count = 7, intensity = 1, stars = false) => {
      if (reducedMotion) return;
      const layer = ensureMagicLayer();
      const rect = getRect();
      const size = Math.max(2, Math.min(rect.width, rect.height));
      const burstCount = Math.min(count, SPARK_BURST_MAX);

      for (let index = 0; index < burstCount; index += 1) {
        const spark = document.createElement('span');
        const angle = Math.random() * TAU;
        const distance = size * (0.18 + Math.random() * 0.36) * intensity;
        const sparkSize = 2.5 + Math.random() * 4 * intensity;
        const lifetime = SPARK_LIFETIME_MS + Math.random() * 180;
        spark.dataset.portalSpark = 'true';
        spark.textContent = stars && index % 3 === 0 ? '✦' : '';
        Object.assign(spark.style, {
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: stars && index % 3 === 0 ? 'auto' : `${sparkSize}px`,
          height: stars && index % 3 === 0 ? 'auto' : `${sparkSize}px`,
          borderRadius: '999px',
          background: stars && index % 3 === 0 ? 'transparent' : GOLD.light,
          color: GOLD.highlight,
          fontSize: `${8 + sparkSize * 2}px`,
          lineHeight: '1',
          textShadow: '0 0 9px rgba(255, 214, 65, 0.9)',
          boxShadow: stars && index % 3 === 0 ? 'none' : `0 0 ${9 + sparkSize * 2}px rgba(255, 196, 34, 0.9)`,
          opacity: '0.96',
          transform: 'translate(-50%, -50%) scale(0.75) rotate(0deg)',
          transition: `transform ${lifetime}ms cubic-bezier(.16,1,.3,1), opacity ${lifetime}ms ease-out`,
        });
        layer.appendChild(spark);
        window.requestAnimationFrame(() => {
          spark.style.transform = `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(0.12) rotate(${120 + Math.random() * 260}deg)`;
          spark.style.opacity = '0';
        });
        window.setTimeout(() => spark.remove(), lifetime + 100);
      }
    };

    const emitMagic = (type, detail = {}) => {
      const payload = {
        type,
        combo: state.comboCount,
        level: state.magicLevel,
        ...detail,
      };
      root.dispatchEvent(new CustomEvent('3dvr:coin-interact', { bubbles: true, detail: payload }));
      window.dispatchEvent(new CustomEvent(`3dvr:coin-${type}`, { detail: payload }));
    };

    const stimulateTap = () => {
      const timestamp = now();
      state.comboCount = timestamp - state.lastMagicAt < COMBO_WINDOW_MS
        ? Math.min(state.comboCount + 1, COMBO_MAX)
        : 1;
      state.lastMagicAt = timestamp;
      state.magicLevel = Math.max(state.magicLevel, state.comboCount >= 5 ? 2 : state.comboCount >= 3 ? 1 : 0);

      const comboBoost = 1 + Math.max(0, state.comboCount - 1) * 0.16;
      state.extraFaceSpin = clamp(state.extraFaceSpin + 0.012 * comboBoost, -MAX_EXTRA_SPIN, MAX_EXTRA_SPIN);
      state.wobbleVelocityY += 0.045 * comboBoost;
      state.wobbleVelocityX -= 0.02 * comboBoost;

      spawnSparks(5 + state.comboCount * 2, 0.72 + state.comboCount * 0.06, state.comboCount >= 3);
      pulseHalo(0.65 + state.comboCount * 0.12);
      emitMagic('tap', { count: state.comboCount });

      if (state.comboCount === 3) {
        state.extraFaceSpin = clamp(state.extraFaceSpin + 0.013, -MAX_EXTRA_SPIN, MAX_EXTRA_SPIN);
        emitMagic('combo', { milestone: 3 });
      }

      if (state.comboCount === 5) {
        state.extraFaceSpin = clamp(state.extraFaceSpin + 0.02, -MAX_EXTRA_SPIN, MAX_EXTRA_SPIN);
        state.wobbleVelocityZ += 0.09;
        spawnSparks(24, 1.22, true);
        emitMagic('powerup', { milestone: 5, charged: true });
      }
    };

    const startDrag = event => {
      const rect = getRect();
      state.dragging = true;
      state.pointerMoved = false;
      state.lastX = event.clientX - rect.left;
      state.lastY = event.clientY - rect.top;
      state.gestureDX = 0;
      state.gestureDY = 0;
      state.dragStartedAt = now();
      window.clearTimeout(state.holdPauseTimer);
      state.holdPauseTimer = window.setTimeout(() => {
        if (state.dragging && !state.pointerMoved) setPaused(true);
      }, HOLD_PAUSE_DELAY_MS);
      capturePointer(event);
      event.preventDefault();
    };

    const drag = event => {
      if (!state.dragging) return;
      const rect = getRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dx = x - state.lastX;
      const dy = y - state.lastY;
      const distance = Math.hypot(dx, dy);

      if (distance > 3) {
        state.pointerMoved = true;
        window.clearTimeout(state.holdPauseTimer);
        setPaused(false);
      }

      state.lastX = x;
      state.lastY = y;
      state.gestureDX += dx;
      state.gestureDY += dy;
      state.extraFaceSpin = clamp(state.extraFaceSpin + distance * DRAG_SPIN_GAIN, -MAX_EXTRA_SPIN, MAX_EXTRA_SPIN);
      state.targetY = clamp(state.gestureDX * TILT_GAIN, -TILT_Y_LIMIT, TILT_Y_LIMIT);
      state.targetX = clamp(state.gestureDY * TILT_GAIN, -TILT_X_LIMIT, TILT_X_LIMIT);
      state.targetZ = clamp((state.gestureDX - state.gestureDY) * 0.00075, -0.08, 0.08);
      state.wobbleVelocityX += dy * 0.00072;
      state.wobbleVelocityY += dx * 0.00072;
      state.wobbleVelocityZ += (dx - dy) * 0.00028;
      event.preventDefault();
    };

    const endDrag = (event = {}) => {
      if (!state.dragging) return;
      state.dragging = false;
      window.clearTimeout(state.holdPauseTimer);
      releasePointer(event);
      state.lastPointerDownDuration = now() - state.dragStartedAt;

      const distance = Math.hypot(state.gestureDX, state.gestureDY);
      if (!state.pointerMoved && distance < 6 && state.lastPointerDownDuration <= QUICK_TAP_MAX_MS) {
        stimulateTap();
      } else if (distance >= 18) {
        state.extraFaceSpin = clamp(state.extraFaceSpin + Math.min(distance, 180) * 0.00022, -MAX_EXTRA_SPIN, MAX_EXTRA_SPIN);
        state.wobbleVelocityX += clamp(state.gestureDY * 0.0004, -0.07, 0.07);
        state.wobbleVelocityY += clamp(state.gestureDX * 0.0004, -0.07, 0.07);
        spawnSparks(Math.min(14, 5 + Math.round(distance / 22)), 0.85, false);
        emitMagic('spin', { distance: Math.round(distance) });
      }

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

      root.addEventListener('keydown', event => {
        if (event.key === ' ') {
          if (!event.repeat) setPaused(true);
          event.preventDefault();
          return;
        }

        if (event.key === 'Enter') {
          stimulateTap();
          event.preventDefault();
          return;
        }

        if (event.key.startsWith('Arrow')) {
          setPaused(false);
          const horizontal = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          const vertical = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
          state.targetY = clamp(state.targetY + horizontal * 0.28, -TILT_Y_LIMIT, TILT_Y_LIMIT);
          state.targetX = clamp(state.targetX + vertical * 0.24, -TILT_X_LIMIT, TILT_X_LIMIT);
          state.extraFaceSpin = clamp(state.extraFaceSpin + 0.01, -MAX_EXTRA_SPIN, MAX_EXTRA_SPIN);
          spawnSparks(5, 0.65, false);
          event.preventDefault();
        }
      });

      root.addEventListener('keyup', event => {
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
      const size = Math.min(width, height);
      const radius = size * 0.42;
      const centerX = width / 2;
      const centerY = height / 2;
      const tiltScaleX = Math.max(0.2, Math.abs(Math.cos(state.currentY + state.wobbleY)) * 0.78 + 0.22);
      const tiltScaleY = Math.max(0.54, Math.cos(state.currentX + state.wobbleX) * 0.18 + 0.8);

      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(centerX, centerY);
      context.rotate(state.currentZ + state.wobbleZ);
      context.scale(tiltScaleX, tiltScaleY);

      const face = context.createRadialGradient(-radius * 0.28, -radius * 0.34, radius * 0.03, 0, 0, radius);
      face.addColorStop(0, GOLD.highlight);
      face.addColorStop(0.18, GOLD.light);
      face.addColorStop(0.52, GOLD.mid);
      face.addColorStop(0.8, GOLD.deep);
      face.addColorStop(1, GOLD.shadow);
      context.beginPath();
      context.arc(0, 0, radius, 0, TAU);
      context.fillStyle = face;
      context.fill();

      context.lineWidth = Math.max(7, size * 0.035);
      context.strokeStyle = GOLD.cream;
      context.stroke();

      context.lineWidth = Math.max(3, size * 0.012);
      context.strokeStyle = 'rgba(118, 62, 0, 0.42)';
      context.beginPath();
      context.arc(0, 0, radius * 0.79, 0, TAU);
      context.stroke();

      context.shadowColor = 'rgba(90, 48, 0, 0.55)';
      context.shadowBlur = size * 0.025;
      context.shadowOffsetY = size * 0.012;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineJoin = 'round';
      context.lineWidth = Math.max(3, size * 0.014);
      context.strokeStyle = '#884a00';
      context.fillStyle = '#fff7bd';
      context.font = `950 ${Math.max(20, size * 0.15)}px Inter, system-ui, sans-serif`;
      context.strokeText('3DVR', 0, -size * 0.02);
      context.fillText('3DVR', 0, -size * 0.02);
      context.lineWidth = Math.max(2, size * 0.008);
      context.font = `900 ${Math.max(11, size * 0.062)}px Inter, system-ui, sans-serif`;
      context.fillStyle = '#ffe174';
      context.strokeText('PORTAL', 0, size * 0.12);
      context.fillText('PORTAL', 0, size * 0.12);
      context.restore();
    };

    const render = () => {
      if (state.renderer && state.scene && state.camera && state.token) {
        state.token.rotation.set(
          state.currentX + state.wobbleX,
          state.currentY + state.wobbleY,
          state.currentZ + state.wobbleZ,
        );
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
      const elapsed = state.lastTimestamp ? Math.min(timestamp - state.lastTimestamp, 64) : 16.67;
      state.lastTimestamp = timestamp;
      const frames = elapsed / 16.67;

      if (!state.dragging) {
        state.targetX = lerp(state.targetX, 0, 1 - Math.pow(0.965, frames));
        state.targetY = lerp(state.targetY, 0, 1 - Math.pow(0.965, frames));
        state.targetZ = lerp(state.targetZ, 0, 1 - Math.pow(0.955, frames));
        state.extraFaceSpin *= Math.pow(SPIN_DECAY, frames);
      }

      state.currentX = lerp(state.currentX, state.targetX, 1 - Math.pow(0.9, frames));
      state.currentY = lerp(state.currentY, state.targetY, 1 - Math.pow(0.9, frames));
      state.currentZ = lerp(state.currentZ, state.targetZ, 1 - Math.pow(0.9, frames));

      state.wobbleVelocityX += -state.wobbleX * WOBBLE_SPRING * frames;
      state.wobbleVelocityY += -state.wobbleY * WOBBLE_SPRING * frames;
      state.wobbleVelocityZ += -state.wobbleZ * WOBBLE_SPRING * frames;
      state.wobbleVelocityX *= Math.pow(WOBBLE_DECAY, frames);
      state.wobbleVelocityY *= Math.pow(WOBBLE_DECAY, frames);
      state.wobbleVelocityZ *= Math.pow(WOBBLE_DECAY, frames);
      state.wobbleX = clamp(state.wobbleX + state.wobbleVelocityX * frames, -MAX_WOBBLE, MAX_WOBBLE);
      state.wobbleY = clamp(state.wobbleY + state.wobbleVelocityY * frames, -MAX_WOBBLE, MAX_WOBBLE);
      state.wobbleZ = clamp(state.wobbleZ + state.wobbleVelocityZ * frames, -MAX_WOBBLE * 0.6, MAX_WOBBLE * 0.6);

      if (!state.paused && !reducedMotion) {
        state.faceSpin += (BASE_FACE_SPIN + state.extraFaceSpin) * elapsed;
      }

      if (state.comboCount && now() - state.lastMagicAt > COMBO_WINDOW_MS) {
        state.comboCount = 0;
        state.magicLevel = 0;
      }

      render();
    };

    const markReady = mode => {
      state.ready = true;
      state.mode = mode;
      root.dataset.logoReady = 'true';
      root.dataset.coinFinish = 'regal-gold';
      window.__portalSwirlLogo = {
        ready: true,
        mode,
        getState: () => ({
          mode: state.mode,
          dragging: state.dragging,
          paused: state.paused,
          faceSpin: state.faceSpin,
          extraFaceSpin: state.extraFaceSpin,
          targetX: state.targetX,
          targetY: state.targetY,
          targetZ: state.targetZ,
          currentX: state.currentX,
          currentY: state.currentY,
          currentZ: state.currentZ,
          wobbleX: state.wobbleX,
          wobbleY: state.wobbleY,
          wobbleZ: state.wobbleZ,
          comboCount: state.comboCount,
          magicLevel: state.magicLevel,
        }),
      };
    };

    const initFallback = error => {
      console.warn('3dvr portal Three.js coin fallback active:', error);
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
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.14;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 5);

        const token = createPortalCoin(THREE);
        token.rotation.x = -0.08;
        token.rotation.y = 0.1;
        scene.add(token);

        scene.add(new THREE.HemisphereLight(0xfff7d6, 0x5c2f00, 0.95));

        const key = new THREE.DirectionalLight(0xfff5d0, 1.95);
        key.position.set(2.8, 3.4, 4.8);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0xffad2f, 0.88);
        fill.position.set(-3.2, -1.2, 2.2);
        scene.add(fill);

        const coolRim = new THREE.DirectionalLight(0xb9e9ff, 0.48);
        coolRim.position.set(-2.5, 3.2, -2.8);
        scene.add(coolRim);

        const sparkle = new THREE.PointLight(0xffdd69, 0.72, 9);
        sparkle.position.set(0.6, -2.2, 3.6);
        scene.add(sparkle);

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
