export const STORAGE_KEY = '3dvr.science.experimentDraft.v1';

const clean = value => String(value ?? '').trim();
const fallback = value => clean(value) || 'Not recorded yet.';

export function buildProtocol(data = {}) {
  const requested = Number.parseInt(data.replications, 10);
  const replications = Number.isFinite(requested)
    ? Math.min(1000, Math.max(1, requested))
    : 3;

  return [
    `# ${clean(data.title) || 'Untitled experiment'}`,
    '',
    '## Question / observation',
    fallback(data.question),
    '',
    '## Hypothesis',
    fallback(data.hypothesis),
    '',
    '## Variable being changed',
    fallback(data.test),
    '',
    '## Measurement',
    fallback(data.measurement),
    '',
    '## Controls',
    fallback(data.controls),
    '',
    '## What would count against the hypothesis?',
    fallback(data.disconfirm),
    '',
    '## Replication target',
    `${replications} independent run${replications === 1 ? '' : 's'}.`,
    '',
    '## Recording checklist',
    '- Date, time, and relevant environment',
    '- Exact procedure and materials',
    '- Raw measurements before interpretation',
    '- Unexpected events or protocol deviations',
    '- Result, uncertainty, and possible alternative explanations',
    '- Replication notes: who repeated it, where, and what changed',
    '',
    'Share the method with the result so another person can challenge or repeat it.'
  ].join('\n');
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function writeForm(form, draft) {
  Object.entries(draft || {}).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (field && 'value' in field) field.value = value;
  });
}

function initExperimentBuilder() {
  const form = document.querySelector('#experiment-form');
  const output = document.querySelector('#protocol-output');
  const status = document.querySelector('#protocol-status');
  const copyButton = document.querySelector('#copy-protocol');
  const clearButton = document.querySelector('#clear-experiment');
  if (!form || !output || !status || !copyButton || !clearButton) return;

  const saveDraft = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readForm(form)));
    status.textContent = 'Draft saved on this device.';
  };

  const render = () => {
    output.textContent = buildProtocol(readForm(form));
    copyButton.disabled = false;
    saveDraft();
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) {
      writeForm(form, saved);
      output.textContent = buildProtocol(saved);
      copyButton.disabled = false;
      status.textContent = 'Local draft restored.';
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    render();
  });

  form.addEventListener('input', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readForm(form)));
    status.textContent = '';
  });

  clearButton.addEventListener('click', () => {
    form.reset();
    form.elements.namedItem('replications').value = '3';
    localStorage.removeItem(STORAGE_KEY);
    output.textContent = 'Fill in the experiment and build a protocol. The goal is not to sound scientific; the goal is to make the test repeatable.';
    copyButton.disabled = true;
    status.textContent = 'Draft cleared.';
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.textContent);
      status.textContent = 'Protocol copied.';
    } catch {
      status.textContent = 'Copy failed. Select the protocol text manually.';
    }
  });
}

if (typeof document !== 'undefined') {
  initExperimentBuilder();
}
