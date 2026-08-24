import {
  createClaritySnapshot,
  createFallbackGuidance,
  getNextMoveAnswers,
  getNextMoveQuestions
} from '../next-move-lab/snapshot.js';

const STORAGE_KEY = '3dvr.guide.session.v2';
const questionKeys = ['desired', 'constraint'];

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
  resultHears: document.querySelector('[data-result-hears]'),
  recommendationWhy: document.querySelector('[data-recommendation-why]'),
  nextAction: document.querySelector('[data-next-action]'),
  pathList: document.querySelector('[data-path-list]'),
  assumption: document.querySelector('[data-assumption]'),
  generatedOutput: document.querySelector('[data-generated-output]'),
  generatedTitle: document.querySelector('[data-generated-title]'),
  generatedBody: document.querySelector('[data-generated-body]'),
  resultStatus: document.querySelector('[data-result-status]')
};

let state = freshState();

function freshState() {
  return {
    initial: '',
    mode: 'general',
    step: 0,
    answers: { desired: '', constraint: '' },
    snapshot: null,
    guidance: null
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

function show(view) {
  refs.startView.hidden = view !== 'start';
  refs.questionView.hidden = view !== 'question';
  refs.resultView.hidden = view !== 'result';
}

function renderQuestion() {
  const key = questionKeys[state.step];
  const question = getNextMoveQuestions(state.mode)?.[key]
    || getNextMoveQuestions('general')?.[key];
  if (!question) return;

  show('question');
  refs.stepLabel.textContent = state.step === 0 ? 'One quick question' : 'Last question';
  refs.questionTitle.textContent = state.step === 0
    ? 'What would make this better?'
    : 'What should we avoid making worse?';
  refs.questionHelp.textContent = state.step === 0
    ? 'Think about what you want to be different soon.'
    : 'Time, money, stress, family, risk — whatever matters most.';
  refs.questionAnswer.placeholder = question.placeholder;
  refs.questionAnswer.value = state.answers[key] || '';
  refs.questionStatus.textContent = '';
  refs.next.textContent = state.step === 1 ? 'Show me what to do' : 'Continue';
  refs.back.textContent = 'Back';

  const answers = getNextMoveAnswers(state.mode, key).length
    ? getNextMoveAnswers(state.mode, key)
    : getNextMoveAnswers('general', key);

  refs.answerChips.replaceChildren(...answers.slice(0, 3).map(answer => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = answer;
    button.addEventListener('click', async () => {
      const key = questionKeys[state.step];
      state.answers[key] = answer;
      refs.questionAnswer.value = answer;
      persist();

      if (state.step === 0) {
        state.step = 1;
        renderQuestion();
        return;
      }

      await finish();
    });
    return button;
  }));

  persist();
  refs.questionAnswer.focus();
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

function createPathCard(path) {
  const article = document.createElement('article');
  article.className = 'path-card';
  const title = document.createElement('h3');
  title.textContent = path.title;
  const fit = document.createElement('p');
  fit.textContent = path.fit;
  const experiment = document.createElement('p');
  experiment.innerHTML = `<strong>Try:</strong> ${escapeHtml(path.experiment)}`;
  article.append(title, fit, experiment);
  return article;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderResult(snapshot, guidance, message = '') {
  state.snapshot = snapshot;
  state.guidance = guidance;
  show('result');

  refs.resultTitle.textContent = guidance.recommendation.title;
  refs.resultHears.textContent = guidance.whatItHears;
  refs.recommendationWhy.textContent = guidance.recommendation.why;
  refs.nextAction.textContent = guidance.nextAction;
  refs.assumption.textContent = guidance.assumptionToTest;

  const alternatives = guidance.paths.filter(path => path.title !== guidance.recommendation.title);
  refs.pathList.replaceChildren(...alternatives.map(createPathCard));
  refs.generatedOutput.hidden = true;
  refs.resultStatus.textContent = message;
  refs.resultTitle.focus();
  clearSaved();
}

async function finish() {
  const snapshot = buildSnapshot();
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
    renderResult(snapshot, createFallbackGuidance(snapshot), 'Using the simple offline version.');
  } finally {
    refs.next.disabled = false;
    refs.answerChips.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
}

function generatedMessage() {
  const recommendation = state.guidance?.recommendation?.title || 'this next step';
  return `Hey — I am trying ${recommendation.toLowerCase()}. ${state.guidance?.nextAction || ''} Would you give me a quick reaction?`;
}

function generatedWeek() {
  const first = state.guidance?.nextAction || 'Take one small step.';
  return [
    `Day 1 — ${first}`,
    'Day 2 — Notice what happened.',
    'Day 3 — Ask one real person for feedback.',
    'Day 4 — Make the next version smaller.',
    'Day 5 — Try it again.',
    'Day 6 — Keep what worked.',
    'Day 7 — Decide what is worth continuing.'
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
    refs.resultStatus.textContent = 'Select the text and copy it.';
  }
}

refs.startForm.addEventListener('submit', event => {
  event.preventDefault();
  const initial = clean(refs.stuck.value);
  if (!initial) return;
  state = freshState();
  state.initial = initial;
  state.mode = inferMode(initial);
  renderQuestion();
});

document.querySelectorAll('[data-preset]').forEach(button => {
  button.addEventListener('click', () => {
    refs.stuck.value = button.dataset.preset;
    refs.startForm.requestSubmit();
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
  state.step = 0;
  renderQuestion();
});

document.querySelectorAll('[data-tool]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.tool === 'message') showGenerated('Message draft', generatedMessage());
    if (button.dataset.tool === 'week') showGenerated('7-day plan', generatedWeek());
  });
});

document.querySelector('[data-copy-generated]').addEventListener('click', () => {
  copyText(refs.generatedBody.textContent || '');
});

document.querySelector('[data-edit]').addEventListener('click', () => {
  state.step = 0;
  renderQuestion();
});

document.querySelector('[data-start-over]').addEventListener('click', () => {
  state = freshState();
  clearSaved();
  refs.stuck.value = '';
  show('start');
  refs.stuck.focus();
});

if (restore()) {
  refs.startStatus.textContent = 'You have an unfinished answer here.';
}
show('start');
