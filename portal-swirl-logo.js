(() => {
  const TAU = Math.PI * 2;
  const BASE_SPEED = 0.011;
  const MAX_SPEED = 0.095;
  const MIN_SIZE = 72;
  const WIND_FORCE = 0.0018;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;

  const setupPortalSwirlLogo = (root) => {
    const canvas = root.querySelector('[data-portal-swirl-canvas]');
    if (!canvas) return null;

    const context = canvas.getContext('2d');
    if (!context) return null;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = {
      ready: false,
      dragging: false,
      spin: 0,
      spinVelocity: reducedMotion ? BASE_SPEED * 0.35 : BASE_SPEED,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      targetTiltX: 0,
      targetTiltY: 0,
      targetTwist: 0,
      lastX: 0,
      lastY: 0,
      dpr: 1,
      size: MIN_SIZE,
    };

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const measured = Math.min(rect.width || MIN_SIZE, rect.height || rect.width || MIN_SIZE);
      const size = Math.max(MIN_SIZE, measured);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (state.size === size && state.dpr === dpr) return;

      state.size = size;
      state.dpr = dpr;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawSwirlArm = (radius, armIndex, arms) => {
      context.beginPath();
      for (let index = 0; index <= 92; index += 1) {
        const progress = index / 92;
        const curl = 1.18 + state.twist * 0.42;
        const angle = state.spin + armIndex * (TAU / arms) + progress * TAU * curl;
        const wave = Math.sin(progress * TAU * 1.2 + state.spin * 0.7) * radius * 0.018;
        const r = radius * (0.11 + progress * 0.77) + wave;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      const gradient = context.createLinearGradient(-radius, -radius * 0.35, radius, radius * 0.35);
      gradient.addColorStop(0, 'rgba(45, 212, 191, 0.25)');
      gradient.addColorStop(0.5, 'rgba(125, 211, 252, 0.96)');
      gradient.addColorStop(1, 'rgba(251, 191, 36, 0.66)');
      context.strokeStyle = gradient;
      context.lineWidth = Math.max(5, radius * 0.09);
      context.lineCap = 'round';
      context.stroke();
    };

    const draw = () => {
      resize();

      const size = state.size;
      const center = size / 2;
      const radius = size * 0.42;
      const tiltDepthX = Math.cos(state.tiltX) * 0.18 + 0.82;
      const tiltDepthY = Math.cos(state.tiltY) * 0.2 + 0.8;

      context.clearRect(0, 0, size, size);

      context.save();
      context.translate(center, center);
      context.rotate(state.tiltY * 0.18);
      context.scale(tiltDepthY, tiltDepthX);

      const shell = context.createRadialGradient(-radius * 0.32, -radius * 0.38, radius * 0.16, 0, 0, radius * 1.12);
      shell.addColorStop(0, 'rgba(248, 250, 252, 0.2)');
      shell.addColorStop(0.32, 'rgba(14, 165, 233, 0.2)');
      shell.addColorStop(0.72, 'rgba(15, 23, 42, 0.98)');
      shell.addColorStop(1, 'rgba(4, 10, 21, 1)');

      context.beginPath();
      context.arc(0, 0, radius, 0, TAU);
      context.fillStyle = shell;
      context.fill();

      context.lineWidth = Math.max(2, radius * 0.035);
      context.strokeStyle = 'rgba(186, 230, 253, 0.22)';
      context.stroke();

      context.save();
      context.rotate(state.spin * 0.45);
      for (let armIndex = 0; armIndex < 6; armIndex += 1) {
        drawSwirlArm(radius, armIndex, 6);
      }
      context.restore();

      context.beginPath();
      context.arc(0, 0, radius * 0.28, 0, TAU);
      context.fillStyle = 'rgba(2, 6, 23, 0.82)';
      context.fill();
      context.strokeStyle = 'rgba(251, 191, 36, 0.38)';
      context.lineWidth = Math.max(1.5, radius * 0.018);
      context.stroke();

      context.fillStyle = 'rgba(248, 250, 252, 0.96)';
      context.font = `800 ${Math.max(17, radius * 0.17)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('3dvr', 0, -radius * 0.035);

      context.fillStyle = 'rgba(186, 230, 253, 0.72)';
      context.font = `700 ${Math.max(9, radius * 0.072)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      context.fillText('portal', 0, radius * 0.135);
      context.restore();
    };

    const animate = () => {
      const restingSpeed = reducedMotion ? BASE_SPEED * 0.35 : BASE_SPEED;
      if (!state.dragging) {
        state.spinVelocity = lerp(state.spinVelocity, restingSpeed, 0.026);
        state.targetTiltX = lerp(state.targetTiltX, 0, 0.052);
        state.targetTiltY = lerp(state.targetTiltY, 0, 0.052);
        state.targetTwist = lerp(state.targetTwist, 0, 0.045);
      }

      state.tiltX = lerp(state.tiltX, state.targetTiltX, 0.16);
      state.tiltY = lerp(state.tiltY, state.targetTiltY, 0.16);
      state.twist = lerp(state.twist, state.targetTwist, 0.14);
      state.spin += state.spinVelocity;
      draw();
      window.requestAnimationFrame(animate);
    };

    const pointerPosition = (event) => {
      const rect = root.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        rect,
      };
    };

    const windFromPointer = (event) => {
      const point = pointerPosition(event);
      const dx = point.x - state.lastX;
      const dy = point.y - state.lastY;
      const centerX = point.rect.width / 2;
      const centerY = point.rect.height / 2;
      const distance = Math.hypot(dx, dy);
      const directionBias = dx * 0.00045 + Math.abs(dy) * 0.00022;

      state.spinVelocity = clamp(
        state.spinVelocity + distance * WIND_FORCE + directionBias,
        BASE_SPEED * 0.3,
        MAX_SPEED,
      );
      state.targetTiltY = clamp((point.x - centerX) / centerX, -1, 1) * 0.9;
      state.targetTiltX = clamp((centerY - point.y) / centerY, -1, 1) * 0.75;
      state.targetTwist = clamp(state.targetTwist + (dx - dy) * 0.012, -1.2, 1.2);
      state.lastX = point.x;
      state.lastY = point.y;
    };

    root.addEventListener('pointerdown', (event) => {
      const point = pointerPosition(event);
      state.dragging = true;
      state.lastX = point.x;
      state.lastY = point.y;
      state.spinVelocity = clamp(state.spinVelocity + BASE_SPEED * 1.5, BASE_SPEED, MAX_SPEED);
      root.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    root.addEventListener('pointermove', (event) => {
      if (!state.dragging) return;
      windFromPointer(event);
      event.preventDefault();
    });

    const releasePointer = (event) => {
      if (!state.dragging) return;
      state.dragging = false;
      root.releasePointerCapture?.(event.pointerId);
    };

    root.addEventListener('pointerup', releasePointer);
    root.addEventListener('pointercancel', releasePointer);
    root.addEventListener('pointerleave', () => {
      state.dragging = false;
    });

    root.addEventListener('mousedown', (event) => {
      const point = pointerPosition(event);
      state.dragging = true;
      state.lastX = point.x;
      state.lastY = point.y;
      state.spinVelocity = clamp(state.spinVelocity + BASE_SPEED * 1.5, BASE_SPEED, MAX_SPEED);
      event.preventDefault();
    });

    window.addEventListener('mousemove', (event) => {
      if (!state.dragging) return;
      windFromPointer(event);
    });

    window.addEventListener('mouseup', () => {
      state.dragging = false;
    });

    root.addEventListener('touchstart', (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      const point = pointerPosition(touch);
      state.dragging = true;
      state.lastX = point.x;
      state.lastY = point.y;
      state.spinVelocity = clamp(state.spinVelocity + BASE_SPEED * 1.5, BASE_SPEED, MAX_SPEED);
      event.preventDefault();
    }, { passive: false });

    root.addEventListener('touchmove', (event) => {
      const touch = event.touches[0];
      if (!state.dragging || !touch) return;
      windFromPointer(touch);
      event.preventDefault();
    }, { passive: false });

    root.addEventListener('touchend', () => {
      state.dragging = false;
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        state.spinVelocity = clamp(state.spinVelocity + BASE_SPEED * 2, BASE_SPEED, MAX_SPEED);
        state.targetTwist = clamp(state.targetTwist + 0.22, -1.2, 1.2);
        event.preventDefault();
      }
      if (event.key === 'ArrowLeft') {
        state.spinVelocity = clamp(state.spinVelocity + BASE_SPEED, BASE_SPEED, MAX_SPEED);
        state.targetTwist = clamp(state.targetTwist - 0.22, -1.2, 1.2);
        event.preventDefault();
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const direction = event.key === 'ArrowUp' ? 1 : -1;
        state.targetTiltX = clamp(state.targetTiltX + direction * 0.22, -1, 1);
        event.preventDefault();
      }
    });

    window.addEventListener('resize', resize);
    root.classList.add('portal-swirl-logo--ready');
    state.ready = true;
    animate();
    return state;
  };

  const init = () => {
    const roots = Array.from(document.querySelectorAll('[data-portal-swirl-logo]'));
    const states = roots.map(setupPortalSwirlLogo).filter(Boolean);
    window.__portalSwirlLogo = {
      ready: states.length > 0,
      getState: () => states[0] ? { ...states[0] } : null,
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
