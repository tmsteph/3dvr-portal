const KEY_TO_CONTROL = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyQ: 'strafeLeft',
  KeyE: 'strafeRight',
  Space: 'thrust',
  ShiftLeft: 'thrust',
  ShiftRight: 'thrust',
};

const PREVENT_DEFAULT_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createInputController(options = {}) {
  const { onPauseToggle = () => {} } = options;
  const state = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    strafeLeft: false,
    strafeRight: false,
    thrust: false,
    moveX: 0,
    moveY: 0,
  };

  const pointerCleanup = [];
  const joystick = {
    zone: null,
    base: null,
    knob: null,
    pointerId: null,
    maxDistance: 42,
    deadzone: 0.18,
  };

  function setControl(control, isActive) {
    if (!control || !(control in state)) {
      return;
    }
    state[control] = isActive;
  }

  function onKeyDown(event) {
    if (event.code === 'KeyP' && !event.repeat) {
      event.preventDefault();
      onPauseToggle();
      return;
    }

    const control = KEY_TO_CONTROL[event.code];
    if (!control) {
      return;
    }

    if (PREVENT_DEFAULT_KEYS.has(event.code)) {
      event.preventDefault();
    }

    setControl(control, true);
  }

  function onKeyUp(event) {
    const control = KEY_TO_CONTROL[event.code];
    if (!control) {
      return;
    }

    if (PREVENT_DEFAULT_KEYS.has(event.code)) {
      event.preventDefault();
    }

    setControl(control, false);
  }

  function applyDeadzone(value) {
    const absValue = Math.abs(value);
    if (absValue < joystick.deadzone) {
      return 0;
    }
    const scaled = (absValue - joystick.deadzone) / (1 - joystick.deadzone);
    return Math.sign(value) * scaled;
  }

  function setJoystickAxes(x, y) {
    state.moveX = applyDeadzone(clamp(x, -1, 1));
    state.moveY = applyDeadzone(clamp(y, -1, 1));
  }

  function updateJoystickFromEvent(event) {
    if (!joystick.base || !joystick.knob) {
      return;
    }

    const rect = joystick.base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const offsetX = event.clientX - centerX;
    const offsetY = event.clientY - centerY;
    const distance = Math.hypot(offsetX, offsetY);
    const ratio = distance > joystick.maxDistance ? joystick.maxDistance / distance : 1;
    const clampedX = offsetX * ratio;
    const clampedY = offsetY * ratio;

    joystick.knob.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
    setJoystickAxes(clampedX / joystick.maxDistance, -clampedY / joystick.maxDistance);
  }

  function resetJoystick() {
    joystick.pointerId = null;
    setJoystickAxes(0, 0);
    if (joystick.knob) {
      joystick.knob.style.transform = 'translate3d(0, 0, 0)';
    }
    if (joystick.zone) {
      joystick.zone.classList.remove('active');
    }
  }

  function bindJoystick() {
    joystick.zone = document.getElementById('joystick-zone');
    joystick.base = document.getElementById('joystick-base');
    joystick.knob = document.getElementById('joystick-knob');
    if (!joystick.zone || !joystick.base || !joystick.knob) {
      return;
    }

    const resizeJoystick = () => {
      if (!joystick.base) {
        return;
      }
      joystick.maxDistance = Math.max(28, joystick.base.clientWidth * 0.33);
    };
    resizeJoystick();
    window.addEventListener('resize', resizeJoystick);

    const onPointerDown = event => {
      event.preventDefault();
      joystick.pointerId = event.pointerId;
      joystick.zone.classList.add('active');
      if (joystick.zone.setPointerCapture) {
        joystick.zone.setPointerCapture(event.pointerId);
      }
      updateJoystickFromEvent(event);
    };

    const onPointerMove = event => {
      if (event.pointerId !== joystick.pointerId) {
        return;
      }
      event.preventDefault();
      updateJoystickFromEvent(event);
    };

    const onPointerEnd = event => {
      if (event.pointerId !== joystick.pointerId) {
        return;
      }
      event.preventDefault();
      if (joystick.zone.releasePointerCapture) {
        try {
          joystick.zone.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Ignore invalid pointer lifecycle release errors.
        }
      }
      resetJoystick();
    };

    joystick.zone.addEventListener('pointerdown', onPointerDown);
    joystick.zone.addEventListener('pointermove', onPointerMove);
    joystick.zone.addEventListener('pointerup', onPointerEnd);
    joystick.zone.addEventListener('pointercancel', onPointerEnd);
    joystick.zone.addEventListener('lostpointercapture', resetJoystick);

    pointerCleanup.push(() => {
      window.removeEventListener('resize', resizeJoystick);
      joystick.zone.removeEventListener('pointerdown', onPointerDown);
      joystick.zone.removeEventListener('pointermove', onPointerMove);
      joystick.zone.removeEventListener('pointerup', onPointerEnd);
      joystick.zone.removeEventListener('pointercancel', onPointerEnd);
      joystick.zone.removeEventListener('lostpointercapture', resetJoystick);
      resetJoystick();
    });
  }

  function clear() {
    state.forward = false;
    state.backward = false;
    state.left = false;
    state.right = false;
    state.strafeLeft = false;
    state.strafeRight = false;
    state.thrust = false;
    resetJoystick();
  }

  function bindButton(buttonId, control) {
    const button = document.getElementById(buttonId);
    if (!button) {
      return;
    }

    const activate = event => {
      event.preventDefault();
      setControl(control, true);
      if (button.setPointerCapture && event.pointerId !== undefined) {
        button.setPointerCapture(event.pointerId);
      }
    };

    const deactivate = event => {
      event.preventDefault();
      setControl(control, false);
      if (button.releasePointerCapture && event.pointerId !== undefined) {
        try {
          button.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Ignore invalid pointer release attempts from browsers with strict pointer lifecycle.
        }
      }
    };

    button.addEventListener('pointerdown', activate);
    button.addEventListener('pointerup', deactivate);
    button.addEventListener('pointercancel', deactivate);
    button.addEventListener('pointerleave', deactivate);

    pointerCleanup.push(() => {
      button.removeEventListener('pointerdown', activate);
      button.removeEventListener('pointerup', deactivate);
      button.removeEventListener('pointercancel', deactivate);
      button.removeEventListener('pointerleave', deactivate);
    });
  }

  function bindTouchControls() {
    bindJoystick();
    bindButton('fly-btn', 'thrust');

    const pauseButton = document.getElementById('pause-btn');
    if (pauseButton) {
      const onPauseClick = event => {
        event.preventDefault();
        onPauseToggle();
      };
      pauseButton.addEventListener('click', onPauseClick);
      pointerCleanup.push(() => {
        pauseButton.removeEventListener('click', onPauseClick);
      });
    }
  }

  function attach() {
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', clear);
    bindTouchControls();
  }

  function detach() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', clear);
    pointerCleanup.forEach(cleanup => cleanup());
    pointerCleanup.length = 0;
  }

  return {
    state,
    attach,
    detach,
    clear,
  };
}
