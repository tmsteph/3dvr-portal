import { createClaritySnapshot, snapshotToText } from './snapshot.js';

const form = document.querySelector('[data-next-move-form]');
const formView = document.querySelector('[data-form-view]');
const resultView = document.querySelector('[data-result-view]');
const error = document.querySelector('[data-error]');
const status = document.querySelector('[data-status]');

function selectedMode() {
  return form.querySelector('input[name="mode"]:checked')?.value || '';
}

function renderSnapshot(snapshot) {
  document.querySelector('[data-result-title]').textContent = snapshot.title;
  document.querySelector('[data-result-situation]').textContent = snapshot.situation;
  document.querySelector('[data-result-desired]').textContent = snapshot.desired;
  document.querySelector('[data-result-constraint]').textContent = snapshot.constraint;
  document.querySelector('[data-result-lens]').textContent = snapshot.lens;
  document.querySelector('[data-result-action]').textContent = snapshot.nextAction;
  document.querySelector('[data-result-disclaimer]').textContent = snapshot.disclaimer;

  const route = document.querySelector('[data-result-route]');
  route.href = snapshot.route;
  route.querySelector('strong').textContent = snapshot.routeLabel;
  route.querySelector('span').textContent = snapshot.routeDetail;

  formView.hidden = true;
  resultView.hidden = false;
  resultView.dataset.snapshot = JSON.stringify(snapshot);
  document.querySelector('[data-result-title]').focus();
}

function currentSnapshot() {
  const encoded = resultView.dataset.snapshot;
  return encoded ? JSON.parse(encoded) : null;
}

async function copySnapshot() {
  const snapshot = currentSnapshot();
  if (!snapshot) return;
  const text = snapshotToText(snapshot);

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  status.textContent = 'Snapshot copied.';
}

form.addEventListener('submit', event => {
  event.preventDefault();
  error.textContent = '';

  try {
    renderSnapshot(createClaritySnapshot({
      mode: selectedMode(),
      situation: form.elements.situation.value,
      desired: form.elements.desired.value,
      constraint: form.elements.constraint.value
    }));
  } catch (snapshotError) {
    error.textContent = snapshotError.message;
    form.querySelector(':invalid, textarea, input')?.focus();
  }
});

document.querySelector('[data-action="edit"]').addEventListener('click', () => {
  resultView.hidden = true;
  formView.hidden = false;
  form.elements.situation.focus();
});

document.querySelector('[data-action="reset"]').addEventListener('click', () => {
  form.reset();
  resultView.dataset.snapshot = '';
  resultView.hidden = true;
  formView.hidden = false;
  error.textContent = '';
  status.textContent = '';
  form.querySelector('input[name="mode"]').focus();
});

document.querySelector('[data-action="copy"]').addEventListener('click', copySnapshot);
