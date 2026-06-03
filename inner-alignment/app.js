import {
  INNER_ALIGNMENT_CATEGORIES,
  INNER_ALIGNMENT_KEYS,
  INNER_ALIGNMENT_PRACTICES,
  buildPracticeSession,
  formatPracticeDuration,
  getInnerAlignmentPractice,
  readInnerAlignmentList,
  readInnerAlignmentPreferences,
  savePracticeSession,
  writeInnerAlignmentPreferences,
} from './practices.js';

const appState = {
  practice: INNER_ALIGNMENT_PRACTICES[0],
  currentStepIndex: 0,
  remainingSeconds: INNER_ALIGNMENT_PRACTICES[0].duration,
  timerId: 0,
  isRunning: false,
  isComplete: false,
  reduceMotion: false,
  scene: null,
  syncBridge: null,
};

function getRefs() {
  return {
    body: document.body,
    practiceGrid: document.getElementById('practiceGrid'),
    categoryFilters: document.getElementById('categoryFilters'),
    canvas: document.getElementById('alignmentCanvas'),
    sceneFallback: document.getElementById('sceneFallback'),
    activeCategory: document.getElementById('activeCategory'),
    activeTitle: document.getElementById('activeTitle'),
    activeIntention: document.getElementById('activeIntention'),
    activeDuration: document.getElementById('activeDuration'),
    activeBreath: document.getElementById('activeBreath'),
    timerDisplay: document.getElementById('timerDisplay'),
    progressBar: document.getElementById('progressBar'),
    stepCounter: document.getElementById('stepCounter'),
    instructionList: document.getElementById('instructionList'),
    reflectionPrompt: document.getElementById('reflectionPrompt'),
    reflectionInput: document.getElementById('reflectionInput'),
    actionInput: document.getElementById('actionInput'),
    startPauseButton: document.getElementById('startPauseButton'),
    nextStepButton: document.getElementById('nextStepButton'),
    resetButton: document.getElementById('resetButton'),
    saveSessionButton: document.getElementById('saveSessionButton'),
    saveStatus: document.getElementById('saveStatus'),
    reduceMotionToggle: document.getElementById('reduceMotionToggle'),
    sessionList: document.getElementById('sessionList'),
    sessionCount: document.getElementById('sessionCount'),
  };
}

function initInnerAlignment() {
  if (typeof document === 'undefined') {
    return;
  }

  const refs = getRefs();
  const preferences = readInnerAlignmentPreferences();
  appState.reduceMotion = preferences.reduceMotion;
  appState.practice = getInnerAlignmentPractice(readActivePracticeId())
    || getInnerAlignmentPractice(preferences.lastPracticeId);
  appState.practice = appState.practice || INNER_ALIGNMENT_PRACTICES[0];
  appState.remainingSeconds = appState.practice.duration;

  refs.reduceMotionToggle.checked = appState.reduceMotion;
  applyReduceMotion(refs, appState.reduceMotion);
  renderCategoryFilters(refs);
  renderPracticeCards(refs);
  renderActivePractice(refs);
  renderSessions(refs);
  bindEvents(refs);
  loadScene(refs);

  window.InnerAlignment = {
    setSyncBridge(bridge) {
      appState.syncBridge = bridge;
    },
    getActivePractice() {
      return appState.practice;
    },
  };
}

function bindEvents(refs) {
  refs.practiceGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-practice-id]');
    if (!button) return;
    selectPractice(button.getAttribute('data-practice-id'), refs);
  });

  refs.categoryFilters.addEventListener('click', event => {
    const button = event.target.closest('[data-category-filter]');
    if (!button) return;
    const category = button.getAttribute('data-category-filter') || 'all';
    renderPracticeCards(refs, category);
    refs.categoryFilters.querySelectorAll('[data-category-filter]').forEach(filter => {
      const selected = filter === button;
      filter.classList.toggle('is-active', selected);
      filter.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  });

  refs.startPauseButton.addEventListener('click', () => {
    if (appState.isRunning) {
      pausePractice(refs);
    } else {
      startPractice(refs);
    }
  });
  refs.nextStepButton.addEventListener('click', () => nextStep(refs));
  refs.resetButton.addEventListener('click', () => resetPractice(refs));
  refs.saveSessionButton.addEventListener('click', () => saveCurrentSession(refs));
  refs.reduceMotionToggle.addEventListener('change', event => {
    appState.reduceMotion = Boolean(event.target.checked);
    writeInnerAlignmentPreferences({
      reduceMotion: appState.reduceMotion,
      lastPracticeId: appState.practice.id,
    });
    applyReduceMotion(refs, appState.reduceMotion);
    if (appState.scene) appState.scene.setReduceMotion(appState.reduceMotion);
  });
}

async function loadScene(refs) {
  try {
    const module = await import('./three-scene.js');
    appState.scene = module.createInnerAlignmentScene(refs.canvas, {
      visualMode: appState.practice.visual,
      reduceMotion: appState.reduceMotion,
    });
    appState.scene.setPaused(false);
    refs.sceneFallback.hidden = true;
  } catch (error) {
    console.warn('Inner Alignment Three.js scene unavailable', error);
    refs.sceneFallback.hidden = false;
    refs.sceneFallback.textContent = 'Visual guide unavailable. The practice timer still works.';
  }
}

function renderCategoryFilters(refs) {
  refs.categoryFilters.replaceChildren();
  const filters = ['all', ...INNER_ALIGNMENT_CATEGORIES];
  filters.forEach((category, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = index === 0 ? 'filter-button is-active' : 'filter-button';
    button.dataset.categoryFilter = category;
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    button.textContent = category === 'all' ? 'All' : category;
    refs.categoryFilters.append(button);
  });
}

function renderPracticeCards(refs, category = 'all') {
  const practices = category === 'all'
    ? INNER_ALIGNMENT_PRACTICES
    : INNER_ALIGNMENT_PRACTICES.filter(practice => practice.category === category);

  refs.practiceGrid.replaceChildren();
  practices.forEach(practice => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = practice.id === appState.practice.id ? 'practice-card is-active' : 'practice-card';
    button.dataset.practiceId = practice.id;
    button.innerHTML = `
      <span class="practice-card__category">${escapeHtml(practice.category)}</span>
      <strong>${escapeHtml(practice.title)}</strong>
      <span>${escapeHtml(practice.intention)}</span>
      <small>${formatPracticeDuration(practice.duration)} · ${escapeHtml(practice.visual)}</small>
    `;
    refs.practiceGrid.append(button);
  });
}

function renderActivePractice(refs) {
  const practice = appState.practice;
  const progress = 1 - (appState.remainingSeconds / practice.duration);
  refs.activeCategory.textContent = practice.category;
  refs.activeTitle.textContent = practice.title;
  refs.activeIntention.textContent = practice.intention;
  refs.activeDuration.textContent = formatPracticeDuration(practice.duration);
  refs.activeBreath.textContent = practice.breathPattern;
  refs.timerDisplay.textContent = formatPracticeDuration(appState.remainingSeconds);
  refs.progressBar.value = Math.max(0, Math.min(1, progress));
  refs.stepCounter.textContent = `Step ${appState.currentStepIndex + 1} of ${practice.instructions.length}`;
  refs.reflectionPrompt.textContent = practice.reflectionPrompt;
  refs.instructionList.replaceChildren();

  practice.instructions.forEach((instruction, index) => {
    const item = document.createElement('li');
    item.className = index === appState.currentStepIndex ? 'is-active' : '';
    item.textContent = instruction;
    refs.instructionList.append(item);
  });

  refs.startPauseButton.textContent = appState.isRunning ? 'Pause' : 'Start';
  refs.saveSessionButton.disabled = !appState.isComplete;
  renderPracticeCards(refs, getActiveCategoryFilter(refs));
}

function renderSessions(refs) {
  const sessions = readInnerAlignmentList('sessions');
  refs.sessionCount.textContent = String(sessions.length);
  refs.sessionList.replaceChildren();
  if (!sessions.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No completed practices saved yet.';
    refs.sessionList.append(empty);
    return;
  }

  sessions.slice(0, 6).forEach(session => {
    const item = document.createElement('article');
    item.className = 'session-item';
    item.innerHTML = `
      <strong>${escapeHtml(session.practiceTitle)}</strong>
      <small>${escapeHtml(formatSessionDate(session.createdAt))}</small>
      <span>${escapeHtml(session.action || 'No action logged')}</span>
    `;
    refs.sessionList.append(item);
  });
}

function selectPractice(practiceId, refs) {
  const practice = getInnerAlignmentPractice(practiceId);
  if (!practice) return;
  pausePractice(refs);
  appState.practice = practice;
  appState.currentStepIndex = 0;
  appState.remainingSeconds = practice.duration;
  appState.isComplete = false;
  refs.reflectionInput.value = '';
  refs.actionInput.value = '';
  setSaveStatus(refs, '');
  saveActivePracticeId(practice.id);
  writeInnerAlignmentPreferences({ lastPracticeId: practice.id });
  if (appState.scene) appState.scene.setVisualMode(practice.visual);
  renderActivePractice(refs);
}

function startPractice(refs) {
  if (appState.isComplete) {
    resetPractice(refs);
  }
  appState.isRunning = true;
  if (appState.scene) appState.scene.setPaused(false);
  clearInterval(appState.timerId);
  appState.timerId = window.setInterval(() => {
    appState.remainingSeconds = Math.max(0, appState.remainingSeconds - 1);
    updateStepFromTime();
    if (appState.remainingSeconds === 0) {
      completePractice(refs);
      return;
    }
    renderActivePractice(refs);
  }, 1000);
  renderActivePractice(refs);
}

function pausePractice(refs) {
  appState.isRunning = false;
  clearInterval(appState.timerId);
  appState.timerId = 0;
  renderActivePractice(refs);
}

function resetPractice(refs) {
  pausePractice(refs);
  appState.currentStepIndex = 0;
  appState.remainingSeconds = appState.practice.duration;
  appState.isComplete = false;
  setSaveStatus(refs, '');
  renderActivePractice(refs);
}

function nextStep(refs) {
  const maxStep = appState.practice.instructions.length - 1;
  appState.currentStepIndex = Math.min(maxStep, appState.currentStepIndex + 1);
  const stepDuration = appState.practice.duration / appState.practice.instructions.length;
  appState.remainingSeconds = Math.max(
    0,
    Math.ceil(appState.practice.duration - (appState.currentStepIndex * stepDuration))
  );
  renderActivePractice(refs);
}

function completePractice(refs) {
  pausePractice(refs);
  appState.remainingSeconds = 0;
  appState.currentStepIndex = appState.practice.instructions.length - 1;
  appState.isComplete = true;
  setSaveStatus(refs, 'Practice complete. Add a reflection and one real-world action.');
  renderActivePractice(refs);
}

function saveCurrentSession(refs) {
  const session = savePracticeSession({
    practiceId: appState.practice.id,
    reflection: refs.reflectionInput.value,
    action: refs.actionInput.value,
  });
  setSaveStatus(refs, 'Saved locally.');
  refs.reflectionInput.value = '';
  refs.actionInput.value = '';
  appState.isComplete = false;
  renderSessions(refs);
  renderActivePractice(refs);

  if (appState.syncBridge && typeof appState.syncBridge.onSessionSaved === 'function') {
    appState.syncBridge.onSessionSaved(session);
  }
}

function updateStepFromTime() {
  const elapsed = appState.practice.duration - appState.remainingSeconds;
  const stepDuration = appState.practice.duration / appState.practice.instructions.length;
  appState.currentStepIndex = Math.min(
    appState.practice.instructions.length - 1,
    Math.floor(elapsed / stepDuration)
  );
}

function applyReduceMotion(refs, reduceMotion) {
  refs.body.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
}

function setSaveStatus(refs, message) {
  refs.saveStatus.textContent = message;
}

function getActiveCategoryFilter(refs) {
  const active = refs.categoryFilters.querySelector('[data-category-filter].is-active');
  return active ? active.getAttribute('data-category-filter') || 'all' : 'all';
}

function readActivePracticeId() {
  try {
    return window.localStorage.getItem(INNER_ALIGNMENT_KEYS.activePractice) || '';
  } catch (_error) {
    return '';
  }
}

function saveActivePracticeId(practiceId) {
  try {
    window.localStorage.setItem(INNER_ALIGNMENT_KEYS.activePractice, practiceId);
  } catch (_error) {
    // Storage can be unavailable in private contexts. The app remains usable for the current session.
  }
}

function formatSessionDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInnerAlignment, { once: true });
  } else {
    initInnerAlignment();
  }
}
