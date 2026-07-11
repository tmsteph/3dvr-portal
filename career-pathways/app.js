import { createEmptyPathwayState, getPathwayConfig } from './pathway-config.js';
import {
  briefToText,
  generatePathwayBrief,
  isPathwayComplete,
  listMissingPathwaySteps
} from './brief-generator.js';
import { clearPathwayProgress, readPathwayProgress, writePathwayProgress } from './pathway-storage.js';

const mode = document.body.dataset.pathwayMode;
const config = getPathwayConfig(mode);

if (!config) {
  throw new Error(`Unknown career pathway mode: ${mode}`);
}

const elements = {
  eyebrow: document.querySelector('[data-pathway-eyebrow]'),
  title: document.querySelector('[data-pathway-title]'),
  promise: document.querySelector('[data-pathway-promise]'),
  formView: document.querySelector('[data-form-view]'),
  briefView: document.querySelector('[data-brief-view]'),
  form: document.querySelector('[data-pathway-form]'),
  stepCount: document.querySelector('[data-step-count]'),
  progress: document.querySelector('[data-progress]'),
  stepLabel: document.querySelector('[data-step-label]'),
  question: document.querySelector('[data-question]'),
  help: document.querySelector('[data-help]'),
  answer: document.querySelector('[data-answer]'),
  error: document.querySelector('[data-error]'),
  back: document.querySelector('[data-action="back"]'),
  next: document.querySelector('[data-action="next"]'),
  reset: document.querySelector('[data-action="reset"]'),
  edit: document.querySelector('[data-action="edit"]'),
  copy: document.querySelector('[data-action="copy"]'),
  print: document.querySelector('[data-action="print"]'),
  briefTitle: document.querySelector('[data-brief-title]'),
  briefSections: document.querySelector('[data-brief-sections]'),
  disclaimer: document.querySelector('[data-disclaimer]'),
  tools: document.querySelector('[data-tool-links]'),
  statuses: document.querySelectorAll('[data-status]')
};

function normalizeState(stored) {
  const empty = createEmptyPathwayState(config);
  if (!stored) return empty;

  return {
    ...empty,
    ...stored,
    step: Math.min(Math.max(Number(stored.step) || 0, 0), config.steps.length - 1),
    answers: { ...empty.answers, ...(stored.answers || {}) },
    brief: stored.brief?.kind === config.id ? stored.brief : null
  };
}

let state = normalizeState(readPathwayProgress(config));

function persist() {
  writePathwayProgress(config, state);
}

function setError(message = '') {
  elements.error.textContent = message;
  elements.answer.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function setStatus(message = '') {
  elements.statuses.forEach(status => {
    status.textContent = message;
  });
}

function renderStep({ focus = false } = {}) {
  const step = config.steps[state.step];
  const percent = ((state.step + 1) / config.steps.length) * 100;

  elements.formView.hidden = false;
  elements.briefView.hidden = true;
  elements.stepCount.textContent = `Step ${state.step + 1} of ${config.steps.length}`;
  elements.progress.style.width = `${percent}%`;
  elements.stepLabel.textContent = step.label;
  elements.question.textContent = step.question;
  elements.help.textContent = step.help;
  elements.answer.value = state.answers[step.id] || '';
  elements.answer.placeholder = step.placeholder;
  elements.answer.name = step.id;
  elements.answer.setAttribute('aria-label', step.question);
  elements.back.disabled = state.step === 0;
  elements.next.textContent = state.step === config.steps.length - 1 ? `Create ${config.briefTitle}` : 'Continue';
  setStatus('Progress is saved in this browser.');
  setError();

  if (focus) elements.answer.focus();
}

function renderBrief() {
  const brief = state.brief || generatePathwayBrief(config.id, state.answers);
  state.brief = brief;
  persist();

  elements.formView.hidden = true;
  elements.briefView.hidden = false;
  elements.briefTitle.textContent = brief.title;
  elements.disclaimer.textContent = config.disclaimer;
  elements.briefSections.replaceChildren(
    ...brief.sections.map(section => {
      const article = document.createElement('article');
      const heading = document.createElement('h3');
      heading.textContent = section.label;
      article.className = 'pathway-brief__section';
      article.append(heading);

      if (section.items) {
        const list = document.createElement('ol');
        section.items.forEach(value => {
          const item = document.createElement('li');
          item.textContent = value;
          list.append(item);
        });
        article.append(list);
      } else {
        const value = document.createElement('p');
        value.textContent = section.value;
        article.append(value);
      }

      return article;
    })
  );
  elements.tools.replaceChildren(
    ...config.tools.map(tool => {
      const link = document.createElement('a');
      const label = document.createElement('strong');
      const detail = document.createElement('span');
      link.href = tool.href;
      label.textContent = tool.label;
      detail.textContent = tool.detail;
      link.append(label, detail);
      return link;
    })
  );
  elements.briefTitle.focus();
}

function saveCurrentAnswer() {
  const step = config.steps[state.step];
  state.answers[step.id] = elements.answer.value.trim();
  state.brief = null;
  persist();
}

function continueFlow() {
  saveCurrentAnswer();
  const step = config.steps[state.step];
  if (step.required && !state.answers[step.id]) {
    setError('Add a short answer before continuing. You can revise it later.');
    elements.answer.focus();
    return;
  }

  if (state.step < config.steps.length - 1) {
    state.step += 1;
    persist();
    renderStep({ focus: true });
    return;
  }

  if (!isPathwayComplete(config, state.answers)) {
    const missing = listMissingPathwaySteps(config, state.answers);
    setError(`Complete these steps first: ${missing.join(', ')}.`);
    return;
  }

  state.brief = generatePathwayBrief(config.id, state.answers);
  persist();
  renderBrief();
}

async function copyBrief() {
  const text = briefToText(state.brief);
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
  setStatus(`${config.briefTitle} copied.`);
}

function resetFlow() {
  const confirmed = window.confirm('Start over and remove the saved answers for this pathway?');
  if (!confirmed) return;
  clearPathwayProgress(config);
  state = createEmptyPathwayState(config);
  renderStep({ focus: true });
}

elements.eyebrow.textContent = config.eyebrow;
elements.title.textContent = config.title;
elements.promise.textContent = config.promise;
document.title = `${config.eyebrow} | 3DVR Portal`;

elements.answer.addEventListener('input', () => {
  saveCurrentAnswer();
  setError();
});
elements.form.addEventListener('submit', event => {
  event.preventDefault();
  continueFlow();
});
elements.back.addEventListener('click', () => {
  saveCurrentAnswer();
  if (state.step > 0) state.step -= 1;
  persist();
  renderStep({ focus: true });
});
elements.edit.addEventListener('click', () => renderStep({ focus: true }));
elements.copy.addEventListener('click', copyBrief);
elements.print.addEventListener('click', () => window.print());
elements.reset.addEventListener('click', resetFlow);

if (state.brief && isPathwayComplete(config, state.answers)) {
  renderBrief();
} else {
  renderStep();
}
