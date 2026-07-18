import {
  STAGES,
  STORAGE_KEY,
  createPlan,
  completeAction,
  deleteStoredPlan,
  getStage,
  hasUsefulResult,
  loadStoredPlan,
  nextStage,
  serializePlan,
  updateAction,
  updatePlan
} from './state.js';

const root = document.querySelector('[data-life-upgrade]');
let plan = loadPlan();

function loadPlan() {
  try {
    return loadStoredPlan(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return createPlan();
  }
}

function savePlan() {
  window.localStorage.setItem(STORAGE_KEY, serializePlan(plan));
  const status = document.querySelector('#saveStatus');
  if (status) status.textContent = 'Saved privately in this browser.';
}

function render() {
  if (!root) return;
  const stage = getStage(plan);
  root.querySelector('[data-stage-label]').textContent = stage.label;
  root.querySelector('[data-stage-prompt]').textContent = stage.prompt;
  root.querySelector('[data-stage-count]').textContent = `${STAGES.findIndex((item) => item.id === stage.id) + 1} of ${STAGES.length}`;
  root.querySelector('[data-progress]').style.width = `${((STAGES.findIndex((item) => item.id === stage.id) + 1) / STAGES.length) * 100}%`;

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
    : 'Your seven-day result will appear here.';
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
  }

  if (event.target.closest('#resetPlan')) {
    plan = createPlan();
    savePlan();
    render();
    return;
  }

  if (event.target.closest('#deleteAll')) {
    if (window.confirm('Delete all Life Upgrade data saved in this browser? This cannot be undone.')) {
      deleteStoredPlan(window.localStorage);
      plan = createPlan();
      render();
      const status = document.querySelector('#saveStatus');
      if (status) status.textContent = 'All Life Upgrade data was deleted from this browser.';
    }
  }
});

render();
