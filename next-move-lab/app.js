import {
  createClaritySnapshot,
  createFallbackGuidance,
  getNextMoveAnswers,
  getNextMoveQuestions,
  snapshotToText
} from './snapshot.js';
import { createCompassExperience } from './experience.js';

const form = document.querySelector('[data-next-move-form]');
const followUpForm = document.querySelector('[data-follow-up-form]');
const formView = document.querySelector('[data-form-view]');
const resultView = document.querySelector('[data-result-view]');
const error = document.querySelector('[data-error]');
const status = document.querySelector('[data-status]');
const aiStatus = document.querySelector('[data-ai-status]');
const followUpStatus = document.querySelector('[data-follow-up-status]');
const submitButton = document.querySelector('[data-submit-button]');
const followUpButton = document.querySelector('[data-follow-up-button]');
const detailQuestions = document.querySelector('[data-detail-questions]');
const steps = [...form.querySelectorAll('[data-step]')];
const compass = createCompassExperience({
  form,
  soundToggle: document.querySelector('[data-sound-toggle]')
});

let latestSnapshot = null;
let latestGuidance = null;
let stepIndex = 0;

function selectedMode() {
  return form.elements.mode.value || '';
}

function showQuestions(mode) {
  const questions = getNextMoveQuestions(mode);
  if (!questions) {
    detailQuestions.hidden = true;
    return;
  }

  Object.entries(questions).forEach(([name, question]) => {
    document.querySelector(`[data-question-label="${name}"]`).textContent = question.label;
    document.querySelector(`[data-question-help="${name}"]`).textContent = question.help;
    document.querySelector(`[data-answer-label="${name}"]`).textContent = question.label.replace(/^\d+\.\s*/, '');
    form.elements[name].placeholder = question.placeholder;
  });

  document.querySelectorAll('[data-answers]').forEach(group => {
    const name = group.dataset.answers;
    group.replaceChildren(...getNextMoveAnswers(mode, name).map(answer => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-chip';
      button.textContent = answer;
      button.dataset.answer = answer;
      button.dataset.field = name;
      return button;
    }));
  });

  detailQuestions.hidden = false;
}

function showStep(index) {
  stepIndex = index;
  steps.forEach((step, i) => { step.hidden = i !== index; });
  detailQuestions.hidden = index === 0;
  document.querySelector('[data-step-note]').textContent = `Step ${index + 1} of 4`;
  submitButton.hidden = index !== 3;
  form.querySelectorAll('[data-back]').forEach(button => {
    button.hidden = index < 1;
  });
  const target = steps[index].querySelector('textarea, input');
  target?.focus();
}

function createPathCard(path, index) {
  const article = document.createElement('article');
  article.className = 'path-card';

  const label = document.createElement('p');
  label.className = 'path-number';
  label.textContent = `Path ${index + 1}`;

  const title = document.createElement('h4');
  title.textContent = path.title;

  const fit = document.createElement('p');
  fit.textContent = path.fit;

  const tradeoffTitle = document.createElement('strong');
  tradeoffTitle.textContent = 'Hard part';

  const tradeoff = document.createElement('p');
  tradeoff.textContent = path.tradeoff;

  const experimentTitle = document.createElement('strong');
  experimentTitle.textContent = 'Try this';

  const experiment = document.createElement('p');
  experiment.textContent = path.experiment;

  article.append(label, title, fit, tradeoffTitle, tradeoff, experimentTitle, experiment);
  return article;
}

function renderGuidance(snapshot, guidance, message = '') {
  latestSnapshot = snapshot;
  latestGuidance = guidance;

  document.querySelector('[data-result-title]').textContent = guidance.title;
  document.querySelector('[data-result-situation]').textContent = snapshot.situation;
  document.querySelector('[data-result-desired]').textContent = snapshot.desired;
  document.querySelector('[data-result-constraint]').textContent = snapshot.constraint;
  document.querySelector('[data-result-hears]').textContent = guidance.whatItHears;
  document.querySelector('[data-result-recommendation-title]').textContent = guidance.recommendation.title;
  document.querySelector('[data-result-recommendation-why]').textContent = guidance.recommendation.why;
  document.querySelector('[data-result-assumption]').textContent = guidance.assumptionToTest;
  document.querySelector('[data-result-action]').textContent = guidance.nextAction;
  document.querySelector('[data-result-follow-up-question]').textContent = guidance.followUpQuestion;
  document.querySelector('[data-result-disclaimer]').textContent = snapshot.disclaimer;

  const paths = document.querySelector('[data-result-paths]');
  paths.replaceChildren(...guidance.paths.map(createPathCard));

  const route = document.querySelector('[data-result-route]');
  route.href = snapshot.route;
  route.querySelector('strong').textContent = snapshot.routeLabel;
  route.querySelector('span').textContent = snapshot.routeDetail;

  formView.hidden = true;
  resultView.hidden = false;
  compass.reveal();
  status.textContent = message;
  document.querySelector('[data-result-title]').focus();
}

function setBusy(button, statusElement, busy, message = '') {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  statusElement.textContent = message;
}

async function requestGuidance(payload) {
  const response = await fetch('/api/openai-site?provider=next-move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const requestError = new Error(result.error || 'Compass could not generate guidance.');
    requestError.code = result.code || '';
    throw requestError;
  }

  return result.guidance;
}

function snapshotFromForm() {
  return createClaritySnapshot({
    mode: selectedMode(),
    situation: form.elements.situation.value,
    desired: form.elements.desired.value,
    constraint: form.elements.constraint.value
  });
}

async function generateInitialGuidance(event) {
  event.preventDefault();
  error.textContent = '';
  status.textContent = '';

  let snapshot;
  try {
    snapshot = snapshotFromForm();
  } catch (snapshotError) {
    error.textContent = snapshotError.message;
    form.querySelector(':invalid, textarea, input')?.focus();
    return;
  }

  setBusy(submitButton, aiStatus, true, 'Making a short plan…');
  compass.setThinking(true);

  try {
    const guidance = await requestGuidance(snapshot);
    renderGuidance(snapshot, guidance, 'Your plan is ready. We did not save your answers.');
  } catch (requestError) {
    if (requestError.code === 'crisis_support') {
      error.textContent = requestError.message;
      error.focus?.();
      return;
    }

    renderGuidance(
      snapshot,
      createFallbackGuidance(snapshot),
      'AI is not ready, so here is a simple backup plan.'
    );
  } finally {
    compass.setThinking(false);
    setBusy(submitButton, aiStatus, false);
  }
}

async function refineGuidance(event) {
  event.preventDefault();
  if (!latestSnapshot || !latestGuidance) return;

  const answer = followUpForm.elements.followUpAnswer.value.trim();
  if (!answer) {
    followUpForm.elements.followUpAnswer.focus();
    return;
  }

  setBusy(followUpButton, followUpStatus, true, 'Updating your plan…');
  compass.setThinking(true);

  try {
    const guidance = await requestGuidance({
      ...latestSnapshot,
      followUpAnswer: answer,
      previousGuidance: latestGuidance
    });
    followUpStatus.textContent = '';
    renderGuidance(latestSnapshot, guidance, 'Your plan is updated.');
    followUpForm.reset();
  } catch (requestError) {
    followUpStatus.textContent = requestError.message;
  } finally {
    compass.setThinking(false);
    followUpButton.disabled = false;
    followUpButton.setAttribute('aria-busy', 'false');
  }
}

async function copySnapshot() {
  if (!latestSnapshot || !latestGuidance) return;
  const text = snapshotToText(latestSnapshot, latestGuidance);

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

  status.textContent = 'Plan copied.';
}

form.addEventListener('submit', generateInitialGuidance);
followUpForm.addEventListener('submit', refineGuidance);
form.addEventListener('click', event => {
  const modeChoice = event.target.closest('[data-mode-choice]');
  if (modeChoice) {
    const mode = modeChoice.dataset.modeChoice;
    form.elements.mode.value = mode;
    form.querySelectorAll('[data-mode-choice]').forEach(button => {
      button.dataset.selected = String(button === modeChoice);
    });
    showQuestions(mode);
    showStep(1);
    return;
  }

  const answer = event.target.closest('[data-answer]');
  if (answer) {
    form.elements[answer.dataset.field].value = answer.dataset.answer;
    form.querySelectorAll(`[data-answer][data-field="${answer.dataset.field}"]`).forEach(button => {
      button.setAttribute('aria-pressed', String(button === answer));
    });
    if (stepIndex < 3) showStep(stepIndex + 1);
    return;
  }

  const back = event.target.closest('[data-back]');
  if (back) {
    showStep(Math.max(0, stepIndex - 1));
    return;
  }

  if (!event.target.closest('[data-next]')) return;
  if (stepIndex === 0 && !selectedMode()) {
    form.querySelector('input[name="mode"]')?.reportValidity();
    return;
  }
  const field = steps[stepIndex].querySelector('textarea');
  if (!field || field.value.trim()) showStep(stepIndex + 1);
  else field.reportValidity();
});

document.querySelector('[data-action="edit"]').addEventListener('click', () => {
  resultView.hidden = true;
  formView.hidden = false;
  showQuestions(selectedMode());
  showStep(1);
});

document.querySelector('[data-action="reset"]').addEventListener('click', () => {
  form.reset();
  followUpForm.reset();
  latestSnapshot = null;
  latestGuidance = null;
  resultView.hidden = true;
  formView.hidden = false;
  error.textContent = '';
  status.textContent = '';
  aiStatus.textContent = '';
  followUpStatus.textContent = '';
  detailQuestions.hidden = true;
  showStep(0);
  compass.reset();
  form.querySelector('[data-mode-choice], input[name="mode"]')?.focus();
});

document.querySelector('[data-action="copy"]').addEventListener('click', copySnapshot);

showStep(0);
