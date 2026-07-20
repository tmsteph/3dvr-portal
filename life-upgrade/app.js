import {
  STAGES,
  STORAGE_KEY,
  createPlan,
  completeAction,
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

const root = document.querySelector('[data-life-upgrade]');
let storageAvailable = true;
let plan = loadPlan();
const game = createGame(root?.querySelector('[data-game-canvas]'));

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

function savePlan() {
  let saved = false;
  try {
    saved = saveStoredPlan(window.localStorage, plan);
  } catch {
    saved = false;
  }
  storageAvailable = saved;
  setStatus(saved
    ? 'Saved privately in this browser.'
    : 'Could not save in this browser. Your changes remain on this page until you leave.');
  return saved;
}

function render() {
  if (!root) return;
  const stage = getStage(plan);
  root.querySelector('[data-stage-label]').textContent = stage.label;
  root.querySelector('[data-stage-prompt]').textContent = stage.prompt;
  root.querySelector('[data-stage-support]').textContent = stage.support;
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
    hasResult: hasUsefulResult(plan)
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
    plan = nextStage(plan);
    savePlan();
    render();
    root.querySelector('[data-stage-field]:not([hidden]) input, [data-stage-field]:not([hidden]) textarea')?.focus();
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
