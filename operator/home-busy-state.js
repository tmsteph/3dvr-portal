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

installHomeOperatorBusyText();

export { BUSY_TEXT, installHomeOperatorBusyText };
