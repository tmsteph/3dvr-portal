const DEFAULT_SELECT_DISTANCE = 44;
const DEFAULT_MENU_DISTANCE = 18;
const DEFAULT_HOLD_TO_ACTIVATE_MS = 650;
const DEFAULT_STRONG_FLICK_DISTANCE = 150;
const DEFAULT_STRONG_FLICK_MAX_MS = 190;
const DEFAULT_STRONG_FLICK_SPEED = 0.9;

export function selectSpinnerDirection(dx, dy, minimumDistance = DEFAULT_SELECT_DISTANCE) {
  const distance = Math.hypot(dx, dy);
  if (distance < minimumDistance) return '';

  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'work' : 'apps';
  return dy > 0 ? 'build' : 'day';
}

export function classifySpinnerRelease({
  dx = 0,
  dy = 0,
  durationMs = 0,
  selectionHeldMs = 0,
  cancelled = false
} = {}, {
  menuDistance = DEFAULT_MENU_DISTANCE,
  selectDistance = DEFAULT_SELECT_DISTANCE,
  holdToActivateMs = DEFAULT_HOLD_TO_ACTIVATE_MS,
  strongFlickDistance = DEFAULT_STRONG_FLICK_DISTANCE,
  strongFlickMaxMs = DEFAULT_STRONG_FLICK_MAX_MS,
  strongFlickSpeed = DEFAULT_STRONG_FLICK_SPEED
} = {}) {
  const distance = Math.hypot(dx, dy);
  const selection = cancelled ? '' : selectSpinnerDirection(dx, dy, selectDistance);
  const speed = distance / Math.max(1, durationMs);

  if (cancelled || distance < menuDistance) {
    return { action: 'none', selection: '', reason: cancelled ? 'cancelled' : 'tiny', distance, speed };
  }

  if (!selection) {
    return { action: 'menu', selection: '', reason: 'spin', distance, speed };
  }

  if (selectionHeldMs >= holdToActivateMs) {
    return { action: 'activate', selection, reason: 'hold', distance, speed };
  }

  if (
    distance >= strongFlickDistance
    && durationMs <= strongFlickMaxMs
    && speed >= strongFlickSpeed
  ) {
    return { action: 'activate', selection, reason: 'flick', distance, speed };
  }

  return { action: 'menu', selection, reason: 'spin', distance, speed };
}

const documentRef = globalThis.document;

if (documentRef) {
  const spinner = documentRef.querySelector('[data-spinner-nav-toggle]');
  const stage = spinner?.closest('[data-spinner-nav]');

  if (spinner && stage) {
    const ACTIVATE_DELAY_MS = 70;
    const SELECTION_FLASH_MS = 420;
    const originalLabel = spinner.getAttribute('aria-label') || 'Interactive 3DVR portal spinner.';
    const targets = {
      day: stage.querySelector('.spinner-nav__item--day'),
      work: stage.querySelector('.spinner-nav__item--work'),
      build: stage.querySelector('.spinner-nav__item--build'),
      apps: stage.querySelector('.spinner-nav__item--apps')
    };
    const labels = {
      day: 'Day',
      work: 'Work',
      build: 'Build',
      apps: 'Apps'
    };

    let gesture = null;
    let currentSelection = '';
    let armed = false;
    let armTimer = 0;

    const now = () => globalThis.performance?.now?.() ?? Date.now();

    const style = documentRef.createElement('style');
    style.dataset.spinnerDirectionStyles = 'true';
    style.textContent = `
      .spinner-stage[data-spin-selecting="true"]::before {
        transform: scale(1.7);
      }

      .spinner-stage[data-spin-selecting="true"] .spinner-nav__item {
        opacity: 1;
        pointer-events: auto;
      }

      .spinner-stage[data-spin-selecting="true"] .spinner-nav__item--day {
        transform: translate(-50%, 0) scale(1);
      }

      .spinner-stage[data-spin-selecting="true"] .spinner-nav__item--work {
        transform: translate(0, -50%) scale(1);
      }

      .spinner-stage[data-spin-selecting="true"] .spinner-nav__item--build {
        transform: translate(-50%, 0) scale(1);
      }

      .spinner-stage[data-spin-selecting="true"] .spinner-nav__item--apps {
        transform: translate(0, -50%) scale(1);
      }

      .spinner-nav__item[data-spinner-selected="true"] {
        border-color: #7dd3fc;
        background: linear-gradient(180deg, rgba(15, 76, 92, 0.98), rgba(13, 45, 63, 0.98));
        color: #f0fdfa;
        box-shadow:
          0 0 0 2px rgba(125, 211, 252, 0.14),
          0 0 22px rgba(45, 212, 191, 0.24),
          0 14px 34px rgba(0, 0, 0, 0.34);
      }

      .spinner-nav__item[data-spinner-armed="true"] {
        border-color: #fcd34d;
        background: linear-gradient(180deg, rgba(14, 116, 144, 0.98), rgba(15, 76, 92, 0.98));
        box-shadow:
          0 0 0 3px rgba(252, 211, 77, 0.18),
          0 0 34px rgba(45, 212, 191, 0.42),
          0 14px 34px rgba(0, 0, 0, 0.34);
      }
    `;
    documentRef.head.appendChild(style);

    const setOpen = open => {
      stage.dataset.open = String(Boolean(open));
      spinner.setAttribute('aria-expanded', String(Boolean(open)));
    };

    const clearArmTimer = () => {
      if (!armTimer) return;
      globalThis.clearTimeout(armTimer);
      armTimer = 0;
    };

    const updateAria = () => {
      if (!currentSelection) {
        spinner.setAttribute('aria-label', originalLabel);
        return;
      }

      spinner.setAttribute(
        'aria-label',
        armed
          ? `Release to open ${labels[currentSelection]}.`
          : `${labels[currentSelection]} selected. Release for menu, or hold to open.`
      );
    };

    const setArmed = value => {
      armed = Boolean(value && currentSelection);
      stage.dataset.spinArmed = String(armed);
      for (const [key, target] of Object.entries(targets)) {
        if (!target) continue;
        if (armed && key === currentSelection) target.setAttribute('data-spinner-armed', 'true');
        else target.removeAttribute('data-spinner-armed');
      }
      updateAria();
    };

    const scheduleArm = selection => {
      clearArmTimer();
      if (!selection || !gesture) return;
      armTimer = globalThis.setTimeout(() => {
        armTimer = 0;
        if (!gesture || gesture.selection !== selection || currentSelection !== selection) return;
        setArmed(true);
      }, DEFAULT_HOLD_TO_ACTIVATE_MS);
    };

    const setSelection = selection => {
      if (selection === currentSelection) return;
      currentSelection = selection;
      stage.dataset.spinSelection = selection || '';
      setArmed(false);

      for (const [key, target] of Object.entries(targets)) {
        if (!target) continue;
        if (key === selection) target.setAttribute('data-spinner-selected', 'true');
        else target.removeAttribute('data-spinner-selected');
      }

      if (gesture) {
        gesture.selection = selection;
        gesture.selectionSince = selection ? now() : 0;
      }
      scheduleArm(selection);
      updateAria();
    };

    const begin = event => {
      if (event.isPrimary === false) return;
      if (typeof event.button === 'number' && event.button !== 0) return;

      clearArmTimer();
      setArmed(false);
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: now(),
        wasOpen: stage.dataset.open === 'true',
        engaged: false,
        selection: '',
        selectionSince: 0
      };
      setSelection('');
    };

    const update = event => {
      if (!gesture) return;
      if (gesture.pointerId != null && event.pointerId != null && event.pointerId !== gesture.pointerId) return;

      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const distance = Math.hypot(dx, dy);
      const selection = selectSpinnerDirection(dx, dy);

      if (distance >= DEFAULT_MENU_DISTANCE) {
        gesture.engaged = true;
        stage.dataset.spinSelecting = 'true';
        setOpen(true);
      }

      setSelection(selection);
    };

    const emitSelection = (selection, reason) => {
      globalThis.dispatchEvent?.(new CustomEvent('3dvr:spinner-select', {
        detail: {
          selection,
          label: labels[selection],
          href: targets[selection]?.getAttribute?.('href') || '',
          reason
        }
      }));
    };

    const activate = (selection, reason) => {
      const target = targets[selection];
      if (!target) return;
      emitSelection(selection, reason);
      globalThis.setTimeout(() => target.click(), ACTIVATE_DELAY_MS);
    };

    const finish = (event, cancelled = false) => {
      if (!gesture) return;
      if (gesture.pointerId != null && event?.pointerId != null && event.pointerId !== gesture.pointerId) return;

      const activeGesture = gesture;
      const endedAt = now();
      const dx = Number(event?.clientX ?? activeGesture.startX) - activeGesture.startX;
      const dy = Number(event?.clientY ?? activeGesture.startY) - activeGesture.startY;
      const releaseSelection = cancelled ? '' : selectSpinnerDirection(dx, dy);
      const selectionHeldMs = releaseSelection
        && activeGesture.selection === releaseSelection
        && activeGesture.selectionSince
        ? endedAt - activeGesture.selectionSince
        : 0;
      const result = classifySpinnerRelease({
        dx,
        dy,
        durationMs: endedAt - activeGesture.startedAt,
        selectionHeldMs,
        cancelled
      });

      gesture = null;
      clearArmTimer();
      stage.dataset.spinSelecting = 'false';
      setArmed(false);

      if (result.action === 'activate' && result.selection) {
        setOpen(true);
        setSelection(result.selection);
        setArmed(true);
        activate(result.selection, result.reason);
        globalThis.setTimeout(() => {
          setArmed(false);
          setSelection('');
        }, ACTIVATE_DELAY_MS + 180);
        return;
      }

      if (result.action === 'menu') {
        setOpen(true);
        setSelection(result.selection);
        globalThis.setTimeout(() => setSelection(''), SELECTION_FLASH_MS);
        return;
      }

      setSelection('');
    };

    spinner.addEventListener('pointerdown', begin);
    spinner.addEventListener('pointermove', update);
    spinner.addEventListener('pointerup', event => finish(event, false));
    spinner.addEventListener('pointercancel', event => finish(event, true));
    globalThis.addEventListener?.('pointerup', event => finish(event, false));
    globalThis.addEventListener?.('pointercancel', event => finish(event, true));
  }
}
