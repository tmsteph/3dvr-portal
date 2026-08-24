import {
  createClaritySnapshot,
  createFallbackGuidance,
  getNextMoveAnswers,
  getNextMoveQuestions
} from '../next-move-lab/snapshot.js';

const STORAGE_KEY = '3dvr.guide.session.v2';
const questionKeys = ['desired', 'constraint'];
const mobileViewport = window.matchMedia('(max-width: 620px)');

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
  back: document.querySelector('[data-back]'),
  next: document.querySelector('[data-next]'),
  resultView: document.querySelector('[data-result-view]'),
  resultTitle: document.querySelector('[data-result-title]'),
  recommendationWhy: document.querySelector('[data-recommendation-why]'),
  nextAction: document.querySelector('[data-next-action]'),
  generatedOutput: document.querySelector('[data-generated-output]'),
  generatedTitle: document.querySelector('[data-generated-title]'),
  generatedBody: document.querySelector('[data-generated-body]'),
  resultStatus: document.querySelector('[data-result-status]'),
  another: document.querySelector('[data-another]')
};

let state = freshState();

function freshState() {
  return {
    initial: '',
    mode: 'general',
    step: 0,
    answers: { desired: '', constraint: '' },
    snapshot: null,
    guidance: null,
    choice: null,
    alternativeIndex: 0
  };
}

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
  if (ranked[0][1] === 0 || ranked[0][1] === ranked[1][1]) return 'general';
  return ranked[0][0];
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
    state.step = Math.max(0, Math.min(1, Number(saved.step) || 0));
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

function scrollViewIntoPlace(target) {
  if (!mobileViewport.matches || !target) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
  });
}

function show(view, { scroll = true } = {}) {
  refs.startView.hidden = view !== 'start';
  refs.questionView.hidden = view !== 'question';
  refs.resultView.hidden = view !== 'result';
  document.body.dataset.guideView = view;

  if (!scroll) return;
  const target = view === 'question'
    ? refs.questionView
    : view === 'result'
      ? refs.resultView
      : refs.startView;
  scrollViewIntoPlace(target);
}

function beginGuide(initial, { focusInput = true } = {}) {
  state = freshState();
  state.initial = initial;
  state.mode = inferMode(initial);
  renderQuestion({ focusInput });
}

function renderQuestion({ focusInput = true } = {}) {
  const key = questionKeys[state.step];
  const question = getNextMoveQuestions(state.mode)?.[key]
    || getNextMoveQuestions('general')?.[key];
  if (!question) return;

  show('question');
  refs.stepLabel.textContent = state.step === 0 ? 'One quick question' : 'Last question';
  refs.questionTitle.textContent = state.step === 0
    ? 'What would you like to be better?'
    : 'What do you want to keep safe?';
  refs.questionHelp.textContent = state.step === 0
    ? 'Pick one thing.'
    : 'For example: your money, time, job, or family time.';
  refs.questionAnswer.placeholder = question.placeholder;
  refs.questionAnswer.value = state.answers[key] || '';
  refs.questionStatus.textContent = '';
  refs.next.textContent = state.step === 1 ? 'Show my idea' : 'Continue';
  refs.back.textContent = 'Back';

  const answers = getNextMoveAnswers(state.mode, key).length
    ? getNextMoveAnswers(state.mode, key)
    : getNextMoveAnswers('general', key);

  refs.answerChips.replaceChildren(...answers.slice(0, 3).map(answer => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = answer;
    button.addEventListener('click', async () => {
      const answerKey = questionKeys[state.step];
      state.answers[answerKey] = answer;
      refs.questionAnswer.value = answer;
      refs.questionAnswer.blur();
      persist();

      if (state.step === 0) {
        state.step = 1;
        renderQuestion({ focusInput: false });
        return;
      }

      await finish();
    });
    return button;
  }));

  persist();
  if (focusInput) {
    requestAnimationFrame(() => refs.questionAnswer.focus({ preventScroll: true }));
  } else {
    refs.questionAnswer.blur();
  }
}

function buildSnapshot() {
  return createClaritySnapshot({
    mode: state.mode,
    situation: state.initial,
    desired: state.answers.desired,
    constraint: state.answers.constraint
  });
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

function showChoice(choice) {
  state.choice = choice;
  refs.resultTitle.textContent = choice.title;
  refs.recommendationWhy.textContent = choice.why;
  refs.nextAction.textContent = choice.nextAction;
  refs.generatedOutput.hidden = true;
  refs.resultStatus.textContent = '';
}

function renderResult(snapshot, guidance, message = '') {
  state.snapshot = snapshot;
  state.guidance = guidance;
  state.alternativeIndex = 0;
  refs.questionAnswer.blur();
  show('result');

  showChoice({
    title: guidance.recommendation.title,
    why: guidance.recommendation.why,
    nextAction: guidance.nextAction
  });

  refs.resultStatus.textContent = message;
  refs.resultTitle.focus({ preventScroll: true });
  clearSaved();
}

async function finish() {
  const snapshot = buildSnapshot();
  refs.questionAnswer.blur();
  refs.questionStatus.textContent = 'Thinking…';
  refs.next.disabled = true;
  refs.answerChips.querySelectorAll('button').forEach(button => { button.disabled = true; });

  try {
    const guidance = await requestGuidance(snapshot);
    renderResult(snapshot, guidance);
  } catch (error) {
    if (error.code === 'crisis_support') {
      refs.questionStatus.textContent = error.message;
      return;
    }
    renderResult(snapshot, createFallbackGuidance(snapshot), 'I could not reach AI, so I used a simple backup idea.');
  } finally {
    refs.next.disabled = false;
    refs.answerChips.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
}

function generatedMessage() {
  const title = state.choice?.title || 'this idea';
  const next = state.choice?.nextAction || '';
  return `Hi! I want to try ${title.toLowerCase()}. ${next} Can you help me with this?`;
}

function generatedWeek() {
  const first = state.choice?.nextAction || 'Take one small step.';
  return [
    `Day 1 — ${first}`,
    'Day 2 — See what happened.',
    'Day 3 — Ask one person what they think.',
    'Day 4 — Make it smaller or easier.',
    'Day 5 — Try again.',
    'Day 6 — Keep what worked.',
    'Day 7 — Pick what to do next.'
  ].join('\n');
}

function showGenerated(title, body) {
  refs.generatedTitle.textContent = title;
  refs.generatedBody.textContent = body;
  refs.generatedOutput.hidden = false;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    refs.resultStatus.textContent = 'Copied.';
  } catch {
    refs.resultStatus.textContent = 'Press and hold the text to copy it.';
  }
}

refs.startForm.addEventListener('submit', event => {
  event.preventDefault();
  const initial = clean(refs.stuck.value);
  if (!initial) return;
  beginGuide(initial, { focusInput: true });
});

document.querySelectorAll('[data-preset]').forEach(button => {
  button.addEventListener('click', () => {
    const initial = clean(button.dataset.preset);
    refs.stuck.value = initial;
    refs.stuck.blur();
    beginGuide(initial, { focusInput: false });
  });
});

refs.questionForm.addEventListener('submit', async event => {
  event.preventDefault();
  const key = questionKeys[state.step];
  const answer = clean(refs.questionAnswer.value);
  if (!answer) return;
  state.answers[key] = answer;
  persist();

  if (state.step === 0) {
    state.step = 1;
    renderQuestion({ focusInput: true });
    return;
  }

  await finish();
});

refs.back.addEventListener('click', () => {
  const key = questionKeys[state.step];
  state.answers[key] = clean(refs.questionAnswer.value);
  refs.questionAnswer.blur();
  if (state.step === 0) {
    refs.stuck.value = state.initial;
    show('start');
    persist();
    return;
  }
  state.step = 0;
  renderQuestion({ focusInput: false });
});

document.querySelectorAll('[data-tool]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.tool === 'message') showGenerated('Message', generatedMessage());
    if (button.dataset.tool === 'week') showGenerated('7-day plan', generatedWeek());
  });
});

document.querySelector('[data-copy-generated]').addEventListener('click', () => {
  copyText(refs.generatedBody.textContent || '');
});

refs.another.addEventListener('click', () => {
  const choices = (state.guidance?.paths || [])
    .filter(path => path.title !== state.guidance?.recommendation?.title);
  if (!choices.length) {
    refs.resultStatus.textContent = 'I do not have another idea yet.';
    return;
  }

  const path = choices[state.alternativeIndex % choices.length];
  state.alternativeIndex += 1;
  showChoice({
    title: path.title,
    why: path.fit,
    nextAction: path.experiment
  });
});

document.querySelector('[data-start-over]').addEventListener('click', () => {
  state = freshState();
  clearSaved();
  refs.stuck.value = '';
  show('start');
});

if (restore()) {
  refs.startStatus.textContent = 'You have an unfinished answer here.';
}
show('start', { scroll: false });
