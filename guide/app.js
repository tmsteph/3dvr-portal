import {
  createClaritySnapshot,
  createFallbackGuidance,
  getNextMoveAnswers,
  getNextMoveQuestions,
  snapshotToText
} from '../next-move-lab/snapshot.js';

const STORAGE_KEY = '3dvr.guide.session.v1';
const questionKeys = ['situation', 'desired', 'constraint'];

const refs = {
  startView: document.querySelector('[data-start-view]'),
  startForm: document.querySelector('[data-start-form]'),
  stuck: document.querySelector('#stuckText'),
  startStatus: document.querySelector('[data-start-status]'),
  questionView: document.querySelector('[data-question-view]'),
  questionForm: document.querySelector('[data-question-form]'),
  questionTitle: document.querySelector('[data-question-title]'),
  questionHelp: document.querySelector('[data-question-help]'),
  questionAnswer: document.querySelector('[data-question-form] textarea[name="answer"]'),
  questionStatus: document.querySelector('[data-question-status]'),
  answerChips: document.querySelector('[data-answer-chips]'),
  stepLabel: document.querySelector('[data-step-label]'),
  reading: document.querySelector('[data-reading]'),
  modeButtons: [...document.querySelectorAll('[data-mode]')],
  back: document.querySelector('[data-back]'),
  next: document.querySelector('[data-next]'),
  resultView: document.querySelector('[data-result-view]'),
  resultTitle: document.querySelector('[data-result-title]'),
  resultHears: document.querySelector('[data-result-hears]'),
  recommendationTitle: document.querySelector('[data-recommendation-title]'),
  recommendationWhy: document.querySelector('[data-recommendation-why]'),
  nextAction: document.querySelector('[data-next-action]'),
  pathList: document.querySelector('[data-path-list]'),
  assumption: document.querySelector('[data-assumption]'),
  routeLink: document.querySelector('[data-route-link]'),
  routeDetail: document.querySelector('[data-route-detail]'),
  generatedOutput: document.querySelector('[data-generated-output]'),
  generatedTitle: document.querySelector('[data-generated-title]'),
  generatedBody: document.querySelector('[data-generated-body]'),
  resultStatus: document.querySelector('[data-result-status]')
};

let state = {
  initial: '',
  mode: '',
  step: 0,
  answers: { situation: '', desired: '', constraint: '' },
  snapshot: null,
  guidance: null
};

function clean(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

function inferMode(text = '') {
  const value = clean(text).toLowerCase();
  const scores = { career: 0, startup: 0, build: 0 };
  const add = (mode, words) => words.forEach(word => {
    if (value.includes(word)) scores[mode] += 1;
  });

  add('career', ['job', 'career', 'work', 'boss', 'shift', 'resume', 'interview', 'hiring', 'overtime', 'commute', 'schedule']);
  add('startup', ['money', 'income', 'customer', 'client', 'business', 'sell', 'sale', 'revenue', 'offer', 'service', 'freelance', 'paid']);
  add('build', ['build', 'app', 'website', 'site', 'software', 'tool', 'code', 'product', 'feature', 'design']);

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] === 0) return 'general';
  if (ranked[0][1] === ranked[1][1]) return 'general';
  return ranked[0][0];
}

function modeLabel(mode) {
  return {
    general: 'something unclear',
    career: 'work / life',
    startup: 'money / business',
    build: 'something to build'
  }[mode] || 'something unclear';
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      initial: state.initial,
      mode: state.mode,
      step: state.step,
      answers: state.answers
    }));
  } catch {}
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved?.initial) return false;
    state.initial = clean(saved.initial);
    state.mode = saved.mode || inferMode(state.initial);
    state.step = Math.max(0, Math.min(2, Number(saved.step) || 0));
    state.answers = { ...state.answers, ...(saved.answers || {}) };
    refs.stuck.value = state.initial;
    return true;
  } catch {
    return false;
  }
}

function clearSaved() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function show(view) {
  refs.startView.hidden = view !== 'start';
  refs.questionView.hidden = view !== 'question';
  refs.resultView.hidden = view !== 'result';
}

function renderMode() {
  refs.reading.textContent = `Mostly ${modeLabel(state.mode)}`;
  refs.modeButtons.forEach(button => {
    button.dataset.selected = String(button.dataset.mode === state.mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
  });
}

function renderQuestion() {
  const questions = getNextMoveQuestions(state.mode);
  const key = questionKeys[state.step];
  const question = questions?.[key];
  if (!question) return;

  show('question');
  renderMode();
  refs.stepLabel.textContent = `Question ${state.step + 1} of 3`;
  refs.questionTitle.textContent = question.label.replace(/^\d+\.\s*/, '');
  refs.questionHelp.textContent = question.help;
  refs.questionAnswer.placeholder = question.placeholder;
  refs.questionAnswer.value = state.answers[key] || '';
  refs.questionStatus.textContent = '';
  refs.next.textContent = state.step === 2 ? 'Show my next move' : 'Next';
  refs.back.textContent = state.step === 0 ? 'Back to start' : 'Back';

  refs.answerChips.replaceChildren(...getNextMoveAnswers(state.mode, key).map(answer => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = answer;
    button.addEventListener('click', () => {
      refs.questionAnswer.value = answer;
      refs.questionAnswer.focus();
    });
    return button;
  }));

  persist();
}

function createPathCard(path, index) {
  const article = document.createElement('article');
  article.className = 'path-card';

  const title = document.createElement('h4');
  title.textContent = `${index + 1}. ${path.title}`;
  const fit = document.createElement('p');
  fit.textContent = `Fit: ${path.fit}`;
  const tradeoff = document.createElement('p');
  tradeoff.textContent = `Hard part: ${path.tradeoff}`;
  const experiment = document.createElement('p');
  experiment.textContent = `Try this: ${path.experiment}`;

  article.append(title, fit, tradeoff, experiment);
  return article;
}

async function requestGuidance(snapshot) {
  const response = await fetch('/api/openai-site?provider=next-move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Guide could not reach AI.');
    error.code = result.code || '';
    throw error;
  }
  return result.guidance;
}

function buildSnapshot() {
  const situation = [state.initial, state.answers.situation].filter(Boolean).join(' — ');
  return createClaritySnapshot({
    mode: state.mode,
    situation,
    desired: state.answers.desired,
    constraint: state.answers.constraint
  });
}

function renderResult(snapshot, guidance, message = '') {
  state.snapshot = snapshot;
  state.guidance = guidance;
  show('result');

  refs.resultTitle.textContent = guidance.title;
  refs.resultHears.textContent = guidance.whatItHears;
  refs.recommendationTitle.textContent = guidance.recommendation.title;
  refs.recommendationWhy.textContent = guidance.recommendation.why;
  refs.nextAction.textContent = guidance.nextAction;
  refs.assumption.textContent = guidance.assumptionToTest;
  refs.pathList.replaceChildren(...guidance.paths.map(createPathCard));
  refs.routeLink.href = snapshot.route || '../life/';
  refs.routeLink.querySelector('strong').textContent = snapshot.routeLabel || 'Keep going';
  refs.routeDetail.textContent = snapshot.routeDetail || 'Take this into the next 3DVR tool.';
  refs.resultStatus.textContent = message;
  refs.generatedOutput.hidden = true;
  refs.resultTitle.focus();
}

async function finish() {
  const snapshot = buildSnapshot();
  refs.questionStatus.textContent = 'Making a short plan…';
  refs.next.disabled = true;

  try {
    const guidance = await requestGuidance(snapshot);
    renderResult(snapshot, guidance, 'Guide used AI for this recommendation.');
  } catch (error) {
    if (error.code === 'crisis_support') {
      refs.questionStatus.textContent = error.message;
      refs.next.disabled = false;
      return;
    }
    renderResult(snapshot, createFallbackGuidance(snapshot), 'AI was unavailable, so Guide used its built-in fallback.');
  } finally {
    refs.next.disabled = false;
  }
}

function generatedMessage() {
  const recommendation = state.guidance?.recommendation?.title || 'this next step';
  return `Hey — I am trying ${recommendation.toLowerCase()}. My goal is ${clean(state.answers.desired).toLowerCase()}. Would you be willing to give me a quick reaction or point me toward one person I should talk to?`;
}

function generatedWeek() {
  const first = state.guidance?.nextAction || 'Take one small step.';
  const experiment = state.guidance?.paths?.[0]?.experiment || 'Try the smallest version with one real person.';
  return [
    `Day 1 — ${first}`,
    'Day 2 — Put the idea in front of one real person.',
    'Day 3 — Write down what confused them or got a response.',
    `Day 4 — ${experiment}`,
    'Day 5 — Remove one thing that is not helping.',
    'Day 6 — Try the smaller version again.',
    'Day 7 — Decide: continue, change direction, or stop.'
  ].join('\n');
}

function showGenerated(title, body) {
  refs.generatedTitle.textContent = title;
  refs.generatedBody.textContent = body;
  refs.generatedOutput.hidden = false;
  refs.generatedOutput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function copyText(text, successMessage) {
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
  refs.resultStatus.textContent = successMessage;
}

refs.startForm.addEventListener('submit', event => {
  event.preventDefault();
  const initial = clean(refs.stuck.value);
  if (!initial) return;
  state.initial = initial;
  state.mode = inferMode(initial);
  state.step = 0;
  state.answers = { situation: '', desired: '', constraint: '' };
  renderQuestion();
});

document.querySelectorAll('[data-preset]').forEach(button => {
  button.addEventListener('click', () => {
    refs.stuck.value = button.dataset.preset;
    refs.stuck.focus();
  });
});

document.querySelector('[data-reset]').addEventListener('click', () => {
  refs.stuck.value = '';
  refs.startStatus.textContent = '';
  clearSaved();
  refs.stuck.focus();
});

refs.modeButtons.forEach(button => {
  button.addEventListener('click', () => {
    const key = questionKeys[state.step];
    state.answers[key] = clean(refs.questionAnswer.value);
    state.mode = button.dataset.mode;
    renderQuestion();
  });
});

refs.questionForm.addEventListener('submit', async event => {
  event.preventDefault();
  const key = questionKeys[state.step];
  const answer = clean(refs.questionAnswer.value);
  if (!answer) return;
  state.answers[key] = answer;
  persist();

  if (state.step < 2) {
    state.step += 1;
    renderQuestion();
    return;
  }

  await finish();
});

refs.back.addEventListener('click', () => {
  const key = questionKeys[state.step];
  state.answers[key] = clean(refs.questionAnswer.value);
  if (state.step === 0) {
    refs.stuck.value = state.initial;
    show('start');
    refs.stuck.focus();
    persist();
    return;
  }
  state.step -= 1;
  renderQuestion();
});

document.querySelectorAll('[data-tool]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.tool === 'message') showGenerated('Message draft', generatedMessage());
    if (button.dataset.tool === 'week') showGenerated('7-day test', generatedWeek());
  });
});

document.querySelector('[data-copy-generated]').addEventListener('click', () => {
  copyText(refs.generatedBody.textContent || '', 'Copied.');
});

document.querySelector('[data-copy-plan]').addEventListener('click', () => {
  if (!state.snapshot || !state.guidance) return;
  const text = snapshotToText(state.snapshot, state.guidance)
    .replace('3dvr Next Move — Clarity Snapshot', '3dvr Guide — Next Move')
    .replace('What Compass hears:', 'What Guide hears:');
  copyText(text, 'Plan copied.');
});

document.querySelector('[data-edit]').addEventListener('click', () => {
  state.step = 0;
  renderQuestion();
});

document.querySelector('[data-start-over]').addEventListener('click', () => {
  state = {
    initial: '',
    mode: '',
    step: 0,
    answers: { situation: '', desired: '', constraint: '' },
    snapshot: null,
    guidance: null
  };
  clearSaved();
  refs.stuck.value = '';
  show('start');
  refs.stuck.focus();
});

if (restore()) {
  refs.startStatus.textContent = 'Your unfinished Guide session is still here.';
}
show('start');
