const KEY_TO_CONTROL = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
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

export function createInputController(options = {}) {
  const { onPauseToggle = () => {} } = options;
  const state = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    thrust: false,
  };

  const pointerCleanup = [];

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

  function clear() {
    Object.keys(state).forEach(control => {
      state[control] = false;
    });
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
    bindButton('up-btn', 'forward');
    bindButton('down-btn', 'backward');
    bindButton('left-btn', 'left');
    bindButton('right-btn', 'right');
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
