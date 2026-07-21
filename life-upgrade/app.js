import {
  STAGES,
  COMPLETED_STORAGE_KEY,
  STORAGE_KEY,
  createPlan,
  completeAction,
  completePlan,
  deleteStoredPlan,
  getStage,
  hasUsefulResult,
  hasProgress,
  loadStoredPlan,
  nextStage,
  saveStoredPlan,
  updateAction,
  updatePlan
} from './state.js';
import { createGame } from './game.js';
import { createLifeUpgradeSync } from './sync.js';

const root = document.querySelector('[data-life-upgrade]');
let storageAvailable = true;
let plan = loadPlan();
const sync = createLifeUpgradeSync({
  onStatus: (message) => setStatus(message)
});
const gameQuestionContent = root?.querySelector('[data-game-question-content]');
gameQuestionContent?.append(
  root?.querySelector('.suggestions'),
  root?.querySelector('.fields'),
  root?.querySelector('.actions')
);
const game = createGame(root?.querySelector('[data-game-canvas]'), {
  onArrive: () => {
    root?.querySelector('[data-stage-field]:not([hidden]) input, [data-stage-field]:not([hidden]) textarea')?.focus();
    setStatus('🎉 You reached the gate! Answer this one question, then keep flying.');
  },
  onReplay: () => {
    setStatus('Flight replayed. Fly to the gate whenever you are ready.');
  }
});

sync.ready.then(async (available) => {
  if (!available) return;
  const remote = await sync.load(plan);
  const localTime = Date.parse(plan.updatedAt || '') || 0;
  const remoteTime = Date.parse(remote?.updatedAt || '') || 0;
  if (remoteTime > localTime || (!hasProgress(plan) && hasProgress(remote))) {
    plan = loadStoredPlan(JSON.stringify(remote));
    savePlan({ announce: false });
    render();
  } else if (hasProgress(plan)) {
    sync.save(plan);
  }
  const syncLabel = root?.querySelector('[data-sync-label]');
  const accountLink = root?.querySelector('.account-link');
  const displayName = sync.getDisplayName?.();
  if (syncLabel) syncLabel.textContent = displayName
    ? `🔐 ${displayName}`
    : '🔐 Saved to your account';
  if (accountLink) accountLink.textContent = displayName
    ? `${displayName}'s account`
    : 'Account sync on';
});

function hasStageAnswer(stageId, currentPlan = plan) {
  if (stageId === 'plan') return currentPlan.actions.some((action) => action.text);
  if (stageId === 'complete') return currentPlan.actions.some((action) => action.text || action.completed);
  const field = { 'check-in': 'checkIn', choose: 'upgrade', result: 'result', evidence: 'evidence', review: 'review', next: 'nextMove' }[stageId];
  return Boolean(field && currentPlan[field]);
}

function loadPlan() {
  try {
    return loadStoredPlan(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    storageAvailable = false;
    return createPlan();
  }
}

function setStatus(message) {
  const status = document.querySelector('#saveStatus');
  if (status) status.textContent = message;
}

function savePlan({ announce = true } = {}) {
  let saved = false;
  try {
    saved = saveStoredPlan(window.localStorage, plan);
  } catch {
    saved = false;
  }
  storageAvailable = saved;
  if (announce) setStatus(saved
    ? 'Saved privately in this browser.'
    : 'Could not save in this browser. Your changes remain on this page until you leave.');
  sync.save(plan);
  return saved;
}

function render() {
  if (!root) return;
  const stage = getStage(plan);
  root.querySelector('[data-stage-label]').textContent = stage.label;
  root.querySelector('[data-stage-prompt]').textContent = stage.prompt;
  root.querySelector('[data-stage-support]').textContent = stage.support;
  root.querySelector('[data-game-question-prompt]').textContent = stage.prompt;
  root.querySelector('[data-game-question-support]').textContent = stage.support;
  root.querySelector('[data-game-question]').dataset.gameStage = stage.id;
  root.querySelector('[data-stage-count]').textContent = `${STAGES.findIndex((item) => item.id === stage.id) + 1} of ${STAGES.length}`;
  root.querySelector('[data-progress]').style.width = `${((STAGES.findIndex((item) => item.id === stage.id) + 1) / STAGES.length) * 100}%`;
  renderSuggestions(stage);
  root.querySelectorAll('[data-stage-field]').forEach((field) => {
    const visible = field.dataset.stageField.split(' ').includes(stage.id);
    field.hidden = !visible;
  });
  const completedActions = plan.actions.filter((action) => action.completed).length;
  game?.update({
    stageIndex: STAGES.findIndex((item) => item.id === stage.id),
    completedActions,
    hasResult: hasUsefulResult(plan),
    answered: hasStageAnswer(stage.id),
    prompt: stage.prompt,
    support: stage.support
  });
  root.querySelector('[data-momentum]').textContent = completedActions
    ? `⭐ ${completedActions} of 3 tiny wins done. Keep going!`
    : hasUsefulResult(plan)
      ? 'You picked your win. Now take one small step.'
      : '🎮 Your first tiny win starts here.';

  root.querySelectorAll('[data-stage]').forEach((button) => {
    const selected = button.dataset.stage === stage.id;
    button.classList.toggle('is-current', selected);
    button.setAttribute('aria-current', selected ? 'step' : 'false');
  });
  root.querySelector('#checkIn').value = plan.checkIn;
  root.querySelector('#upgrade').value = plan.upgrade;
  root.querySelector('#result').value = plan.result;
  root.querySelector('#evidence').value = plan.evidence;
  root.querySelector('#review').value = plan.review;
  root.querySelector('#nextMove').value = plan.nextMove;
  root.querySelectorAll('[data-action-index]').forEach((input) => {
    input.value = plan.actions[Number(input.dataset.actionIndex)].text;
  });
  root.querySelectorAll('[data-action-complete]').forEach((input) => {
    input.checked = plan.actions[Number(input.dataset.actionComplete)].completed;
  });
  root.querySelector('#summary').textContent = hasUsefulResult(plan)
    ? `${plan.upgrade}: ${plan.result}`
    : 'Your 7-day win will show up here.';
}

function showFinishPanel(show) {
  const panel = root.querySelector('[data-finish-panel]');
  if (!panel) return;
  panel.hidden = !show;
  game?.setFinished(show);
}

function renderSuggestions(stage) {
  const wrapper = root.querySelector('[data-suggestions]');
  const list = root.querySelector('[data-suggestion-list]');
  list.replaceChildren();
  wrapper.hidden = !stage.suggestions?.length;
  if (!stage.suggestions?.length) return;

  stage.suggestions.forEach(([label, target]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    button.dataset.suggestion = label;
    button.dataset.suggestionTarget = target;
    button.textContent = label;
    list.append(button);
  });
}

function findSuggestionTarget(targetName) {
  if (targetName.startsWith('action-')) {
    return root.querySelector(`[data-action-index="${targetName.slice(7)}"]`);
  }
  return root.querySelector(`#${targetName}`);
}

function handleField(event) {
  const target = event.target;
  if (target.dataset.actionComplete !== undefined) {
    plan = completeAction(plan, Number(target.dataset.actionComplete), target.checked);
  } else if (target.dataset.actionIndex) {
    plan = updateAction(plan, Number(target.dataset.actionIndex), target.value);
  } else if (target.name) {
    plan = updatePlan(plan, { [target.name]: target.value });
  }
  savePlan();
  game?.setAnswered(hasStageAnswer(getStage(plan).id));
}

root?.addEventListener('input', handleField);
root?.addEventListener('change', handleField);
root?.addEventListener('click', (event) => {
  const suggestion = event.target.closest('[data-suggestion]');
  if (suggestion) {
    const target = findSuggestionTarget(suggestion.dataset.suggestionTarget);
    if (target) {
      target.value = suggestion.dataset.suggestion;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.focus();
    }
    return;
  }

  const stageButton = event.target.closest('[data-stage]');
  if (stageButton) {
    plan = updatePlan(plan, { currentStage: stageButton.dataset.stage });
    savePlan();
    render();
    return;
  }

  if (event.target.closest('#nextStage')) {
    if (getStage(plan).id === 'next') {
      plan = completePlan(plan);
      savePlan();
      render();
      showFinishPanel(true);
      setStatus('🏆 Congratulations! You completed this Life Upgrade.');
      return;
    }
    plan = nextStage(plan);
    savePlan();
    render();
    root.querySelector('[data-stage-field]:not([hidden]) input, [data-stage-field]:not([hidden]) textarea')?.focus();
  }

  if (event.target.closest('[data-start-another]')) {
    try {
      const completed = JSON.parse(window.localStorage.getItem(COMPLETED_STORAGE_KEY) || '[]');
      completed.push(plan);
      window.localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(completed.slice(-12)));
    } catch {
      // The active plan can still be restarted if archive storage is unavailable.
    }
    sync.saveCompleted(plan);
    plan = createPlan();
    savePlan();
    showFinishPanel(false);
    game?.replay();
    render();
    setStatus('New gate ready. Fly to the first gate.');
    return;
  }

  if (event.target.closest('#resetPlan')) {
    if (hasProgress(plan) && !window.confirm('Start over and replace this Life Upgrade plan?')) return;
    plan = createPlan();
    savePlan();
    render();
    return;
  }

  if (event.target.closest('#deleteAll')) {
    if (window.confirm('Delete all Life Upgrade data saved in this browser? This cannot be undone.')) {
      let deleted = false;
      try {
        deleted = deleteStoredPlan(window.localStorage);
      } catch {
        deleted = false;
      }
      if (!deleted) {
        setStatus('Could not delete saved data from this browser. Please try again.');
        return;
      }
      plan = createPlan();
      render();
      storageAvailable = true;
      setStatus('All Life Upgrade data was deleted from this browser.');
    }
  }
});

render();
if (!storageAvailable) {
  setStatus('Private browser storage is unavailable. Your changes remain on this page until you leave.');
}
