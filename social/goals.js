const socialGun = window.SocialGun || {};
const scoreSystem = window.ScoreSystem || {};

const resolveGunNodeStub = typeof socialGun.resolveGunNodeStub === 'function'
  ? socialGun.resolveGunNodeStub
  : createBasicGunNodeStub;
const resolveGunUserStub = typeof socialGun.resolveGunUserStub === 'function'
  ? socialGun.resolveGunUserStub
  : createBasicGunUserStub;
const ensureGunContext = typeof socialGun.ensureGunContext === 'function'
  ? socialGun.ensureGunContext
  : createBasicGunContext;
const recallUserSessionIfAvailable = typeof socialGun.recallUserSessionIfAvailable === 'function'
  ? socialGun.recallUserSessionIfAvailable
  : function() {};

const goalForm = document.getElementById('goalForm');
const goalList = document.getElementById('goalList');
const goalEmpty = document.getElementById('goalEmpty');
const goalStatusSelect = document.getElementById('goalStatus');

const goalRecords = new Map();

const urlParams = new URLSearchParams(window.location.search);
const requestedGoalId = urlParams.get('goalId');

const gunContext = ensureGunContext(() => (typeof Gun === 'function'
  ? Gun(window.__GUN_PEERS__ || [
      'wss://relay.3dvr.tech/gun',
      'wss://gun-relay-3dvr.fly.dev/gun'
    ])
  : null), { label: 'social-goals' });

const gun = gunContext.gun;
const user = gunContext.user;
const socialRoot = gun && typeof gun.get === 'function'
  ? gun.get('social-media')
  : resolveGunNodeStub();
// Node shape: social-media/goals/<id> -> { title, description, metrics, status, createdAt, updatedAt }
const goalsNode = socialRoot && typeof socialRoot.get === 'function'
  ? socialRoot.get('goals')
  : resolveGunNodeStub();

recallUserSessionIfAvailable(user);

if (scoreSystem && typeof scoreSystem.ensureGuestIdentity === 'function') {
  try {
    scoreSystem.ensureGuestIdentity();
  } catch (err) {
    console.warn('Failed to ensure guest identity for goals', err);
  }
}

if (goalStatusSelect) {
  goalStatusSelect.value = 'active';
}

if (goalForm) {
  goalForm.addEventListener('submit', handleGoalSubmit);
}

if (goalList) {
  goalList.addEventListener('change', handleGoalListChange);
  goalList.addEventListener('click', handleGoalListClick);
  goalList.addEventListener('submit', handleGoalEditSubmit);
}

if (goalsNode && typeof goalsNode.map === 'function') {
  goalsNode.map().on((data, id) => {
    handleGoalUpdate(data, id);
  }, { change: true });
}

function createBasicGunNodeStub() {
  const node = {
    __isGunStub: true,
    get() {
      return createBasicGunNodeStub();
    },
    put() {
      return node;
    },
    map() {
      return {
        on() {
          return { off() {} };
        }
      };
    },
    set() {
      return node;
    }
  };
  return node;
}

function createBasicGunUserStub(node) {
  return node || createBasicGunNodeStub();
}

function createBasicGunContext(factory) {
  let instance = null;
  if (typeof factory === 'function') {
    try {
      instance = factory();
    } catch (err) {
      console.warn('Failed to initialize Gun for goals', err);
    }
  }

  if (instance) {
    const resolvedUser = typeof instance.user === 'function'
      ? instance.user()
      : resolveGunUserStub(instance);
    return {
      gun: instance,
      user: resolvedUser,
      isStub: !!instance.__isGunStub
    };
  }

  const stubGun = {
    __isGunStub: true,
    get() {
      return resolveGunNodeStub();
    },
    user() {
      return resolveGunUserStub();
    }
  };
  return { gun: stubGun, user: stubGun.user(), isStub: true };
}

function handleGoalSubmit(event) {
  event.preventDefault();
  if (!goalForm) return;

  const title = goalForm.goalTitle.value.trim();
  if (!title) {
    goalForm.reportValidity();
    return;
  }

  const record = {
    title,
    owner: goalForm.goalOwner.value.trim(),
    targetDate: goalForm.goalTargetDate.value,
    status: goalForm.goalStatus.value || 'active',
    description: goalForm.goalDescription.value.trim(),
    metrics: goalForm.goalMetrics.value.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const id = `goal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  goalsNode.get(id).put(record);
  handleGoalUpdate(record, id);
  goalForm.reset();
  if (goalStatusSelect) {
    goalStatusSelect.value = 'active';
  }
}

function handleGoalUpdate(data, id) {
  const record = sanitizeRecord(data);
  if (!record) {
    goalRecords.delete(id);
    removeGoalCard(id);
    updateGoalEmptyState();
    return;
  }
  goalRecords.set(id, record);
  const card = ensureGoalCard(id);
  renderGoalCard(card, record, id);
  updateGoalEmptyState();
}

function handleGoalListChange(event) {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.dataset.goalId) {
    const id = target.dataset.goalId;
    goalsNode.get(id).put({ status: target.value, updatedAt: Date.now() });
  }
}

function handleGoalListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.goalId;
  if (!id) return;

  if (action === 'delete-goal') {
    goalsNode.get(id).put(null);
    handleGoalUpdate(null, id);
  }

  if (action === 'edit-goal') {
    toggleGoalEditForm(id, true);
  }

  if (action === 'cancel-edit-goal') {
    toggleGoalEditForm(id, false);
  }
}

function handleGoalEditSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const id = form.dataset.goalId;
  if (!id) return;

  event.preventDefault();

  const titleInput = form.querySelector('[data-role="editTitle"]');
  if (!(titleInput instanceof HTMLInputElement)) return;
  const title = titleInput.value.trim();
  if (!title) {
    form.reportValidity();
    return;
  }

  const ownerInput = form.querySelector('[data-role="editOwner"]');
  const targetDateInput = form.querySelector('[data-role="editTargetDate"]');
  const descriptionInput = form.querySelector('[data-role="editDescription"]');
  const metricsInput = form.querySelector('[data-role="editMetrics"]');

  const updates = {
    title,
    owner: ownerInput instanceof HTMLInputElement ? ownerInput.value.trim() : '',
    targetDate: targetDateInput instanceof HTMLInputElement ? targetDateInput.value : '',
    description: descriptionInput instanceof HTMLTextAreaElement ? descriptionInput.value.trim() : '',
    metrics: metricsInput instanceof HTMLInputElement ? metricsInput.value.trim() : '',
    updatedAt: Date.now()
  };

  goalsNode.get(id).put(updates);
  handleGoalUpdate({ ...(goalRecords.get(id) || {}), ...updates }, id);
  toggleGoalEditForm(id, false);
}

function ensureGoalCard(id) {
  let card = goalList.querySelector(`[data-goal-id="${id}"]`);
  if (card) return card;
  card = createGoalCard(id);
  goalList.prepend(card);
  return card;
}

function createGoalCard(id) {
  const card = document.createElement('div');
  card.className = 'list-card';
  card.dataset.goalId = id;

  const createLabeledField = (labelText, inputEl) => {
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.className = 'field__label';
    span.textContent = labelText;
    label.append(span, inputEl);
    return label;
  };

  const title = document.createElement('h3');
  title.className = 'list-card__title';
  title.dataset.role = 'goalTitle';
  card.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'list-card__meta';
  meta.dataset.role = 'goalMeta';
  card.appendChild(meta);

  const description = document.createElement('p');
  description.className = 'list-card__meta';
  description.dataset.role = 'goalDescription';
  card.appendChild(description);

  const statusField = document.createElement('label');
  statusField.className = 'field';
  const statusLabel = document.createElement('span');
  statusLabel.className = 'field__label';
  statusLabel.textContent = 'Status';
  const statusSelect = document.createElement('select');
  statusSelect.dataset.goalId = id;
  ['active', 'in-review', 'complete'].forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value.replace('-', ' ');
    statusSelect.appendChild(option);
  });
  statusField.append(statusLabel, statusSelect);
  card.appendChild(statusField);

  const editForm = document.createElement('form');
  editForm.className = 'card-edit list-card__form';
  editForm.dataset.goalId = id;
  editForm.hidden = true;

  const editGrid = document.createElement('div');
  editGrid.className = 'form-grid';

  const editTitleInput = document.createElement('input');
  editTitleInput.required = true;
  editTitleInput.dataset.role = 'editTitle';
  editTitleInput.placeholder = 'Goal title';

  const editOwnerInput = document.createElement('input');
  editOwnerInput.dataset.role = 'editOwner';
  editOwnerInput.placeholder = 'Owner';

  const editTargetDateInput = document.createElement('input');
  editTargetDateInput.type = 'date';
  editTargetDateInput.dataset.role = 'editTargetDate';

  editGrid.append(
    createLabeledField('Goal title', editTitleInput),
    createLabeledField('Owner', editOwnerInput),
    createLabeledField('Target date', editTargetDateInput)
  );

  const editDescriptionInput = document.createElement('textarea');
  editDescriptionInput.rows = 3;
  editDescriptionInput.dataset.role = 'editDescription';
  editDescriptionInput.placeholder = 'Describe the outcome and why it matters';

  const editMetricsInput = document.createElement('input');
  editMetricsInput.dataset.role = 'editMetrics';
  editMetricsInput.placeholder = 'Success metrics';

  const editActions = document.createElement('div');
  editActions.className = 'card-actions';

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'primary-action';
  saveButton.textContent = 'Save changes';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'ghost-action';
  cancelButton.dataset.action = 'cancel-edit-goal';
  cancelButton.dataset.goalId = id;
  cancelButton.textContent = 'Cancel';

  editActions.append(saveButton, cancelButton);
  editForm.append(
    editGrid,
    createLabeledField('Goal description', editDescriptionInput),
    createLabeledField('Success metrics', editMetricsInput),
    editActions
  );

  card.appendChild(editForm);

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const ideationLink = document.createElement('a');
  ideationLink.className = 'ghost-action';
  ideationLink.dataset.action = 'open-ideation';
  ideationLink.textContent = 'Start ideation';

  const resultsLink = document.createElement('a');
  resultsLink.className = 'ghost-action';
  resultsLink.dataset.action = 'open-results';
  resultsLink.textContent = 'Log results';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'ghost-action';
  editButton.dataset.action = 'edit-goal';
  editButton.dataset.goalId = id;
  editButton.textContent = 'Edit';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete-button';
  deleteButton.dataset.action = 'delete-goal';
  deleteButton.dataset.goalId = id;
  deleteButton.textContent = 'Delete';
  actions.append(ideationLink, resultsLink, editButton, deleteButton);
  card.appendChild(actions);

  card.titleEl = title;
  card.metaEl = meta;
  card.descriptionEl = description;
  card.statusSelect = statusSelect;
  card.ideationLink = ideationLink;
  card.resultsLink = resultsLink;
  card.editForm = editForm;
  card.editTitleInput = editTitleInput;
  card.editOwnerInput = editOwnerInput;
  card.editTargetDateInput = editTargetDateInput;
  card.editDescriptionInput = editDescriptionInput;
  card.editMetricsInput = editMetricsInput;

  return card;
}

function renderGoalCard(card, record) {
  card.titleEl.textContent = record.title || 'Untitled goal';
  card.metaEl.textContent = buildGoalMeta(record);
  card.descriptionEl.textContent = record.description || 'No description yet.';
  card.statusSelect.value = record.status || 'active';
  populateGoalEditForm(card, record);
  if (card.ideationLink) {
    card.ideationLink.href = `./ideation.html?goalId=${encodeURIComponent(card.dataset.goalId)}`;
  }
  if (card.resultsLink) {
    card.resultsLink.href = `./results.html?goalId=${encodeURIComponent(card.dataset.goalId)}`;
  }
}

function buildGoalMeta(record) {
  const parts = [];
  if (record.status) parts.push(`Status: ${record.status.replace('-', ' ')}`);
  if (record.owner) parts.push(record.owner);
  if (record.targetDate) parts.push(`Target: ${record.targetDate}`);
  if (record.metrics) parts.push(`Metrics: ${record.metrics}`);
  return parts.join(' · ') || 'No metadata';
}

function populateGoalEditForm(card, record) {
  if (!card || !card.editForm) return;
  if (card.editTitleInput) card.editTitleInput.value = record.title || '';
  if (card.editOwnerInput) card.editOwnerInput.value = record.owner || '';
  if (card.editTargetDateInput) card.editTargetDateInput.value = record.targetDate || '';
  if (card.editDescriptionInput) card.editDescriptionInput.value = record.description || '';
  if (card.editMetricsInput) card.editMetricsInput.value = record.metrics || '';
}

function toggleGoalEditForm(id, shouldShow) {
  const card = goalList.querySelector(`[data-goal-id="${id}"]`);
  if (!card || !card.editForm) return;
  card.editForm.hidden = !shouldShow;
  if (shouldShow && card.editTitleInput) {
    card.editTitleInput.focus();
  }
}

function removeGoalCard(id) {
  const card = goalList.querySelector(`[data-goal-id="${id}"]`);
  if (card) card.remove();
}

function updateGoalEmptyState() {
  if (!goalEmpty) return;
  const hasItems = goalList && goalList.querySelector('[data-goal-id]');
  goalEmpty.hidden = !!hasItems;
}

function sanitizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '_' || typeof value === 'function') continue;
    result[key] = value;
  }
  return result;
}
