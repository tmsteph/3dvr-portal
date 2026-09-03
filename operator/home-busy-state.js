const BUSY_TEXT = 'Operator is working on this page…';
const IDLE_LABEL = 'Ask Operator anything';

function installHomeOperatorBusyText() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

  const form = document.querySelector('#homeOperatorForm');
  const input = document.querySelector('#homeOperatorInput');
  if (!form || !input || input.dataset.busyTextInstalled === 'true') return;

  input.dataset.busyTextInstalled = 'true';

  const sync = () => {
    const busy = form.getAttribute('aria-busy') === 'true';

    if (busy) {
      input.dataset.operatorBusyText = 'true';
      input.value = BUSY_TEXT;
      input.setAttribute('aria-label', BUSY_TEXT.replace(/…$/, ''));
      return;
    }

    if (input.dataset.operatorBusyText === 'true') {
      input.value = '';
      delete input.dataset.operatorBusyText;
      input.setAttribute('aria-label', IDLE_LABEL);
    }
  };

  new MutationObserver(sync).observe(form, {
    attributes: true,
    attributeFilter: ['aria-busy']
  });

  sync();
}

function installFullOperatorBusyIndicator() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

  const form = document.querySelector('#operator-form');
  const submit = form?.querySelector('button[type="submit"]');
  if (!form || !submit || submit.dataset.busyIndicatorInstalled === 'true') return;

  submit.dataset.busyIndicatorInstalled = 'true';

  if (!document.querySelector('#operator-full-busy-indicator-style')) {
    const style = document.createElement('style');
    style.id = 'operator-full-busy-indicator-style';
    style.textContent = `
      #operator-form button[type="submit"] {
        position: relative;
        display: grid;
        place-items: center;
        min-width: 5rem;
        overflow: hidden;
      }

      #operator-form .operator-submit__label,
      #operator-form .operator-submit__arrow,
      #operator-form .operator-submit__portal {
        grid-area: 1 / 1;
        pointer-events: none;
        transition: opacity 160ms ease, transform 180ms ease;
      }

      #operator-form .operator-submit__label {
        transform: translateX(-0.45rem);
      }

      #operator-form .operator-submit__arrow {
        transform: translateX(1.35rem);
      }

      #operator-form .operator-submit__portal {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        opacity: 0;
        transform: scale(0.68) rotate(-35deg);
        filter: drop-shadow(0 0 6px rgba(121, 237, 207, 0.42));
      }

      #operator-form button[data-busy="true"]:disabled {
        opacity: 1;
        cursor: progress;
      }

      #operator-form button[data-busy="true"] .operator-submit__label,
      #operator-form button[data-busy="true"] .operator-submit__arrow {
        opacity: 0;
        transform: scale(0.45) rotate(90deg);
      }

      #operator-form button[data-busy="true"] .operator-submit__portal {
        opacity: 1;
        transform: scale(1);
        animation: operator-full-portal-spin 900ms linear infinite,
          operator-full-portal-pulse 760ms ease-in-out infinite alternate;
      }

      @keyframes operator-full-portal-spin {
        to { transform: scale(1) rotate(360deg); }
      }

      @keyframes operator-full-portal-pulse {
        from { filter: drop-shadow(0 0 3px rgba(121, 237, 207, 0.28)); }
        to { filter: drop-shadow(0 0 9px rgba(121, 237, 207, 0.72)); }
      }

      @media (prefers-reduced-motion: reduce) {
        #operator-form .operator-submit__label,
        #operator-form .operator-submit__arrow,
        #operator-form .operator-submit__portal {
          transition: none;
        }

        #operator-form button[data-busy="true"] .operator-submit__portal {
          animation: operator-full-portal-pulse 1100ms ease-in-out infinite alternate;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const label = document.createElement('span');
  label.className = 'operator-submit__label';
  label.textContent = 'Do it';

  const arrow = document.createElement('span');
  arrow.className = 'operator-submit__arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';

  const portal = document.createElement('img');
  portal.className = 'operator-submit__portal';
  portal.src = '/brand/portal-logo.svg';
  portal.alt = '';
  portal.setAttribute('aria-hidden', 'true');

  submit.replaceChildren(label, arrow, portal);

  const sync = () => {
    const busy = submit.disabled;
    submit.dataset.busy = String(busy);
    submit.setAttribute('aria-label', busy ? 'Operator is working' : 'Do it');
    form.setAttribute('aria-busy', String(busy));
  };

  new MutationObserver(sync).observe(submit, {
    attributes: true,
    attributeFilter: ['disabled']
  });

  sync();
}

installHomeOperatorBusyText();
installFullOperatorBusyIndicator();

export { BUSY_TEXT, installFullOperatorBusyIndicator, installHomeOperatorBusyText };
