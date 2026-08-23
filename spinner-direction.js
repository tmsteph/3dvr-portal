const DEFAULT_SELECT_DISTANCE = 44;

export function selectSpinnerDirection(dx, dy, minimumDistance = DEFAULT_SELECT_DISTANCE) {
  const distance = Math.hypot(dx, dy);
  if (distance < minimumDistance) return '';

  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'work' : 'apps';
  return dy > 0 ? 'build' : 'day';
}

const documentRef = globalThis.document;

if (documentRef) {
  const spinner = documentRef.querySelector('[data-spinner-nav-toggle]');
  const stage = spinner?.closest('[data-spinner-nav]');

  if (spinner && stage) {
    const ACTIVATE_DELAY_MS = 70;
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
        background: linear-gradient(180deg, rgba(14, 116, 144, 0.98), rgba(15, 76, 92, 0.98));
        color: #f0fdfa;
        box-shadow:
          0 0 0 2px rgba(125, 211, 252, 0.18),
          0 0 28px rgba(45, 212, 191, 0.34),
          0 14px 34px rgba(0, 0, 0, 0.34);
      }
    `;
    documentRef.head.appendChild(style);

    const setOpen = open => {
      stage.dataset.open = String(Boolean(open));
      spinner.setAttribute('aria-expanded', String(Boolean(open)));
    };

    const setSelection = selection => {
      if (selection === currentSelection) return;
      currentSelection = selection;
      stage.dataset.spinSelection = selection || '';

      for (const [key, target] of Object.entries(targets)) {
        if (!target) continue;
        if (key === selection) target.setAttribute('data-spinner-selected', 'true');
        else target.removeAttribute('data-spinner-selected');
      }

      spinner.setAttribute(
        'aria-label',
        selection ? `Release to open ${labels[selection]}.` : originalLabel
      );
    };

    const begin = event => {
      if (event.isPrimary === false) return;
      if (typeof event.button === 'number' && event.button !== 0) return;

      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        wasOpen: stage.dataset.open === 'true',
        engaged: false
      };
      setSelection('');
    };

    const update = event => {
      if (!gesture) return;
      if (gesture.pointerId != null && event.pointerId != null && event.pointerId !== gesture.pointerId) return;

      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const selection = selectSpinnerDirection(dx, dy);

      if (selection) {
        gesture.engaged = true;
        stage.dataset.spinSelecting = 'true';
        setOpen(true);
      } else if (gesture.engaged) {
        stage.dataset.spinSelecting = 'false';
        if (!gesture.wasOpen) setOpen(false);
      }

      setSelection(selection);
    };

    const emitSelection = selection => {
      globalThis.dispatchEvent?.(new CustomEvent('3dvr:spinner-select', {
        detail: {
          selection,
          label: labels[selection],
          href: targets[selection]?.getAttribute?.('href') || ''
        }
      }));
    };

    const activate = selection => {
      const target = targets[selection];
      if (!target) return;
      emitSelection(selection);
      globalThis.setTimeout(() => target.click(), ACTIVATE_DELAY_MS);
    };

    const finish = (event, cancelled = false) => {
      if (!gesture) return;
      if (gesture.pointerId != null && event?.pointerId != null && event.pointerId !== gesture.pointerId) return;

      const activeGesture = gesture;
      const dx = Number(event?.clientX ?? activeGesture.startX) - activeGesture.startX;
      const dy = Number(event?.clientY ?? activeGesture.startY) - activeGesture.startY;
      const selection = cancelled ? '' : selectSpinnerDirection(dx, dy);
      gesture = null;
      stage.dataset.spinSelecting = 'false';

      if (selection) {
        setOpen(true);
        setSelection(selection);
        activate(selection);
        globalThis.setTimeout(() => setSelection(''), ACTIVATE_DELAY_MS + 180);
        return;
      }

      setSelection('');
      if (activeGesture.engaged && !activeGesture.wasOpen) setOpen(false);
    };

    spinner.addEventListener('pointerdown', begin);
    spinner.addEventListener('pointermove', update);
    spinner.addEventListener('pointerup', event => finish(event, false));
    spinner.addEventListener('pointercancel', event => finish(event, true));
    globalThis.addEventListener?.('pointerup', event => finish(event, false));
    globalThis.addEventListener?.('pointercancel', event => finish(event, true));
  }
}
