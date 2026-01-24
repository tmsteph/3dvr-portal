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

const ideationForm = document.getElementById('ideationForm');
const addIdeaButton = document.getElementById('addIdea');
const ideaDraftList = document.getElementById('ideaDraftList');
const ideaDraftEmpty = document.getElementById('ideaDraftEmpty');
const ideaBoard = document.getElementById('ideaBoard');
const ideaBoardEmpty = document.getElementById('ideaBoardEmpty');
const goalSelect = document.getElementById('ideaGoalSelect');

const ideaRecords = new Map();
const draftRecords = new Map();

const gunContext = ensureGunContext(() => (typeof Gun === 'function'
  ? Gun(window.__GUN_PEERS__ || [
      'wss://relay.3dvr.tech/gun',
      'wss://gun-relay-3dvr.fly.dev/gun'
    ])
  : null), { label: 'social-ideation' });

const gun = gunContext.gun;
const user = gunContext.user;
const socialRoot = gun && typeof gun.get === 'function'
  ? gun.get('social-media')
  : resolveGunNodeStub();
// Node shape: social-media/ideation/drafts/<id> -> { text, goal, createdAt, updatedAt, ... }
const draftsNode = socialRoot && typeof socialRoot.get === 'function'
  ? socialRoot.get('ideation').get('drafts')
  : resolveGunNodeStub();
// Node shape: social-media/ideation/board/<id> -> { text, goal, status, createdAt, updatedAt, ... }
const boardNode = socialRoot && typeof socialRoot.get === 'function'
  ? socialRoot.get('ideation').get('board')
  : resolveGunNodeStub();
// Node shape: social-media/campaigns/<id> -> { name, platform, objective, status, notes, createdAt, updatedAt }
const campaignsNode = socialRoot && typeof socialRoot.get === 'function'
  ? socialRoot.get('campaigns')
  : resolveGunNodeStub();
// Node shape: social-media/post-schedule/<id> -> { title, platforms, status, scheduledDate, createdAt, updatedAt }
const scheduleNode = socialRoot && typeof socialRoot.get === 'function'
  ? socialRoot.get('post-schedule')
  : resolveGunNodeStub();
// Node shape: social-media/goals/<id> -> { title, description, successMetrics, createdAt }
const goalsNode = socialRoot && typeof socialRoot.get === 'function'
  ? socialRoot.get('goals')
  : resolveGunNodeStub();

recallUserSessionIfAvailable(user);

if (scoreSystem && typeof scoreSystem.ensureGuestIdentity === 'function') {
  try {
    scoreSystem.ensureGuestIdentity();
  } catch (err) {
    console.warn('Failed to ensure guest identity for ideation', err);
  }
}

const urlParams = new URLSearchParams(window.location.search);
const requestedGoalId = urlParams.get('goalId');

if (ideationForm) {
  ideationForm.addEventListener('submit', handleManualIdeaSubmit);
}

if (ideaDraftList) {
  ideaDraftList.addEventListener('click', handleDraftClick);
  ideaDraftList.addEventListener('submit', handleIdeaEditSubmit);
}

if (ideaBoard) {
  ideaBoard.addEventListener('click', handleBoardClick);
  ideaBoard.addEventListener('submit', handleIdeaEditSubmit);
}

if (goalsNode && typeof goalsNode.map === 'function') {
  goalsNode.map().on((data, id) => {
    handleGoalUpdate(data, id);
  }, { change: true });
}

if (draftsNode && typeof draftsNode.map === 'function') {
  draftsNode.map().on((data, id) => {
    handleDraftUpdate(data, id);
  }, { change: true });
}

if (boardNode && typeof boardNode.map === 'function') {
  boardNode.map().on((data, id) => {
    handleBoardUpdate(data, id);
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
      console.warn('Failed to initialize Gun for ideation', err);
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

function handleManualIdeaSubmit(event) {
  event.preventDefault();
  if (!ideationForm) return;
  const manualText = ideationForm.ideaText.value.trim();
  if (!manualText) {
    ideationForm.reportValidity();
    return;
  }
  addDraft(manualText);
  ideationForm.ideaText.value = '';
}

function addDraft(text) {
  if (!text) return;
  const payload = {
    text,
    goal: ideationForm.ideaGoal.value.trim(),
    goalId: goalSelect ? goalSelect.value : '',
    audience: ideationForm.ideaAudience.value.trim(),
    platforms: ideationForm.ideaPlatforms.value.trim(),
    tone: ideationForm.ideaTone.value.trim(),
    format: ideationForm.ideaFormat.value.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const draftId = `draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  draftsNode.get(draftId).put(payload);
  handleDraftUpdate(payload, draftId);
}

function handleDraftUpdate(data, id) {
  const record = sanitizeRecord(data);
  if (!record) {
    draftRecords.delete(id);
    removeCard(ideaDraftList, id, 'draft');
    updateEmptyState(ideaDraftEmpty, ideaDraftList, 'draft');
    return;
  }
  draftRecords.set(id, record);
  const card = ensureCard(ideaDraftList, id, 'draft');
  renderDraftCard(card, record, id);
  updateEmptyState(ideaDraftEmpty, ideaDraftList, 'draft');
}

function handleBoardUpdate(data, id) {
  const record = sanitizeRecord(data);
  if (!record) {
    ideaRecords.delete(id);
    removeCard(ideaBoard, id, 'board');
    updateEmptyState(ideaBoardEmpty, ideaBoard, 'board');
    return;
  }
  ideaRecords.set(id, record);
  const card = ensureCard(ideaBoard, id, 'board');
  renderBoardCard(card, record, id);
  updateEmptyState(ideaBoardEmpty, ideaBoard, 'board');
}

function handleDraftClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.ideaId;
  if (!id) return;

  if (action === 'save-idea') {
    const record = draftRecords.get(id);
    if (!record) return;
    const boardId = `idea-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    boardNode.get(boardId).put({
      ...record,
      status: 'ready',
      updatedAt: Date.now()
    });
    draftsNode.get(id).put(null);
    handleDraftUpdate(null, id);
  }

  if (action === 'send-to-campaign') {
    const record = draftRecords.get(id);
    if (!record) return;
    createCampaignFromIdea(record);
    return;
  }

  if (action === 'send-to-schedule') {
    const record = draftRecords.get(id);
    if (!record) return;
    createScheduleFromIdea(record);
    return;
  }

  if (action === 'delete-draft') {
    draftsNode.get(id).put(null);
    handleDraftUpdate(null, id);
  }

  if (action === 'edit-idea') {
    toggleIdeaEditForm(id, 'draft', true);
  }

  if (action === 'cancel-edit-idea') {
    toggleIdeaEditForm(id, 'draft', false);
  }
}

function handleBoardClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.ideaId;
  if (!id) return;

  if (action === 'delete-idea') {
    boardNode.get(id).put(null);
    handleBoardUpdate(null, id);
  }

  if (action === 'mark-scheduled') {
    boardNode.get(id).put({ status: 'scheduled', updatedAt: Date.now() });
  }

  if (action === 'send-to-campaign') {
    const record = ideaRecords.get(id);
    if (!record) return;
    createCampaignFromIdea(record);
  }

  if (action === 'send-to-schedule') {
    const record = ideaRecords.get(id);
    if (!record) return;
    createScheduleFromIdea(record);
  }

  if (action === 'edit-idea') {
    toggleIdeaEditForm(id, 'board', true);
  }

  if (action === 'cancel-edit-idea') {
    toggleIdeaEditForm(id, 'board', false);
  }
}

function handleIdeaEditSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const id = form.dataset.ideaId;
  const type = form.dataset.ideaType;
  if (!id || !type) return;

  event.preventDefault();

  const textInput = form.querySelector('[data-role="editText"]');
  if (!(textInput instanceof HTMLTextAreaElement)) return;
  const text = textInput.value.trim();
  if (!text) {
    form.reportValidity();
    return;
  }

  const updates = {
    text,
    goal: readEditValue(form, 'editGoal'),
    goalId: readEditValue(form, 'editGoalId'),
    audience: readEditValue(form, 'editAudience'),
    platforms: readEditValue(form, 'editPlatforms'),
    tone: readEditValue(form, 'editTone'),
    format: readEditValue(form, 'editFormat'),
    updatedAt: Date.now()
  };

  const targetNode = type === 'draft' ? draftsNode : boardNode;
  targetNode.get(id).put(updates);

  if (type === 'draft') {
    handleDraftUpdate({ ...(draftRecords.get(id) || {}), ...updates }, id);
  } else {
    handleBoardUpdate({ ...(ideaRecords.get(id) || {}), ...updates }, id);
  }

  toggleIdeaEditForm(id, type, false);
}

function readEditValue(form, role) {
  const field = form.querySelector(`[data-role="${role}"]`);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return field.value.trim();
  }
  return '';
}

function renderDraftCard(card, record, id) {
  card.querySelector('[data-role="idea-text"]').textContent = record.text || 'Untitled idea';
  card.querySelector('[data-role="idea-meta"]').textContent = buildMeta(record);
  card.querySelector('[data-action="save-idea"]').dataset.ideaId = id;
  card.querySelector('[data-action="delete-draft"]').dataset.ideaId = id;
  card.querySelector('[data-action="send-to-campaign"]').dataset.ideaId = id;
  card.querySelector('[data-action="send-to-schedule"]').dataset.ideaId = id;
  card.querySelector('[data-action="edit-idea"]').dataset.ideaId = id;
  populateIdeaEditForm(card, record);
}

function renderBoardCard(card, record, id) {
  card.querySelector('[data-role="idea-text"]').textContent = record.text || 'Untitled idea';
  card.querySelector('[data-role="idea-meta"]').textContent = buildMeta(record);
  card.querySelector('[data-role="idea-status"]').textContent = record.status || 'ready';
  card.querySelector('[data-action="mark-scheduled"]').dataset.ideaId = id;
  card.querySelector('[data-action="delete-idea"]').dataset.ideaId = id;
  card.querySelector('[data-action="send-to-campaign"]').dataset.ideaId = id;
  card.querySelector('[data-action="send-to-schedule"]').dataset.ideaId = id;
  card.querySelector('[data-action="edit-idea"]').dataset.ideaId = id;
  populateIdeaEditForm(card, record);
}

function ensureCard(list, id, type) {
  let card = list.querySelector(`[data-${type}-id="${id}"]`);
  if (card) return card;
  card = document.createElement('div');
  card.className = 'list-card';
  card.dataset[`${type}Id`] = id;

  const createLabeledField = (labelText, inputEl) => {
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.className = 'field__label';
    span.textContent = labelText;
    label.append(span, inputEl);
    return label;
  };

  const text = document.createElement('p');
  text.className = 'list-card__title';
  text.dataset.role = 'idea-text';
  card.appendChild(text);

  const meta = document.createElement('p');
  meta.className = 'list-card__meta';
  meta.dataset.role = 'idea-meta';
  card.appendChild(meta);

  if (type === 'board') {
    const status = document.createElement('span');
    status.className = 'badge';
    status.dataset.role = 'idea-status';
    card.appendChild(status);
  }

  const editForm = document.createElement('form');
  editForm.className = 'card-edit list-card__form';
  editForm.dataset.ideaId = id;
  editForm.dataset.ideaType = type;
  editForm.hidden = true;

  const editText = document.createElement('textarea');
  editText.required = true;
  editText.rows = 3;
  editText.dataset.role = 'editText';
  editText.placeholder = 'Idea text';

  const editGrid = document.createElement('div');
  editGrid.className = 'form-grid';

  const editGoal = document.createElement('input');
  editGoal.dataset.role = 'editGoal';
  editGoal.placeholder = 'Goal';

  const editGoalId = document.createElement('input');
  editGoalId.dataset.role = 'editGoalId';
  editGoalId.placeholder = 'Goal ID';

  const editPlatforms = document.createElement('input');
  editPlatforms.dataset.role = 'editPlatforms';
  editPlatforms.placeholder = 'Platforms';

  const editTone = document.createElement('input');
  editTone.dataset.role = 'editTone';
  editTone.placeholder = 'Tone';

  const editAudience = document.createElement('input');
  editAudience.dataset.role = 'editAudience';
  editAudience.placeholder = 'Audience';

  const editFormat = document.createElement('input');
  editFormat.dataset.role = 'editFormat';
  editFormat.placeholder = 'Format';

  editGrid.append(
    createLabeledField('Goal', editGoal),
    createLabeledField('Goal ID', editGoalId),
    createLabeledField('Platforms', editPlatforms),
    createLabeledField('Tone', editTone),
    createLabeledField('Audience', editAudience),
    createLabeledField('Format', editFormat)
  );

  const editActions = document.createElement('div');
  editActions.className = 'card-actions';

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'primary-action';
  saveButton.textContent = 'Save changes';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'ghost-action';
  cancelButton.dataset.action = 'cancel-edit-idea';
  cancelButton.dataset.ideaId = id;
  cancelButton.textContent = 'Cancel';

  editActions.append(saveButton, cancelButton);
  editForm.append(
    createLabeledField('Idea text', editText),
    editGrid,
    editActions
  );

  card.appendChild(editForm);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  if (type === 'draft') {
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-action';
    saveButton.dataset.action = 'save-idea';
    saveButton.textContent = 'Save to board';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.dataset.action = 'delete-draft';
    deleteButton.textContent = 'Delete';

    const campaignButton = document.createElement('button');
    campaignButton.type = 'button';
    campaignButton.className = 'ghost-action';
    campaignButton.dataset.action = 'send-to-campaign';
    campaignButton.textContent = 'Create campaign';

    const scheduleButton = document.createElement('button');
    scheduleButton.type = 'button';
    scheduleButton.className = 'ghost-action';
    scheduleButton.dataset.action = 'send-to-schedule';
    scheduleButton.textContent = 'Send to scheduler';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'ghost-action';
    editButton.dataset.action = 'edit-idea';
    editButton.textContent = 'Edit';

    actions.append(saveButton, campaignButton, scheduleButton, editButton, deleteButton);
  } else {
    const scheduleButton = document.createElement('button');
    scheduleButton.type = 'button';
    scheduleButton.className = 'ghost-action';
    scheduleButton.dataset.action = 'mark-scheduled';
    scheduleButton.textContent = 'Mark scheduled';

    const campaignButton = document.createElement('button');
    campaignButton.type = 'button';
    campaignButton.className = 'ghost-action';
    campaignButton.dataset.action = 'send-to-campaign';
    campaignButton.textContent = 'Create campaign';

    const plannerButton = document.createElement('button');
    plannerButton.type = 'button';
    plannerButton.className = 'ghost-action';
    plannerButton.dataset.action = 'send-to-schedule';
    plannerButton.textContent = 'Send to scheduler';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.dataset.action = 'delete-idea';
    deleteButton.textContent = 'Delete';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'ghost-action';
    editButton.dataset.action = 'edit-idea';
    editButton.textContent = 'Edit';

    actions.append(scheduleButton, campaignButton, plannerButton, editButton, deleteButton);
  }

  card.appendChild(actions);
  list.prepend(card);

  card.editForm = editForm;
  card.editText = editText;
  card.editGoal = editGoal;
  card.editGoalId = editGoalId;
  card.editPlatforms = editPlatforms;
  card.editTone = editTone;
  card.editAudience = editAudience;
  card.editFormat = editFormat;

  return card;
}

function removeCard(list, id, type) {
  const card = list.querySelector(`[data-${type}-id="${id}"]`);
  if (card) card.remove();
}

function updateEmptyState(emptyEl, list, type) {
  if (!emptyEl) return;
  const hasItems = list && list.querySelector(`[data-${type}-id]`);
  emptyEl.hidden = !!hasItems;
}

function buildMeta(record) {
  const chunks = [];
  if (record.goal) chunks.push(record.goal);
  if (record.platforms) chunks.push(record.platforms);
  if (record.tone) chunks.push(record.tone);
  if (record.audience) chunks.push(record.audience);
  if (record.format) chunks.push(record.format);
  return chunks.join(' · ') || 'No metadata';
}

function populateIdeaEditForm(card, record) {
  if (!card || !card.editForm) return;
  if (card.editText) card.editText.value = record.text || '';
  if (card.editGoal) card.editGoal.value = record.goal || '';
  if (card.editGoalId) card.editGoalId.value = record.goalId || '';
  if (card.editPlatforms) card.editPlatforms.value = record.platforms || '';
  if (card.editTone) card.editTone.value = record.tone || '';
  if (card.editAudience) card.editAudience.value = record.audience || '';
  if (card.editFormat) card.editFormat.value = record.format || '';
}

function toggleIdeaEditForm(id, type, shouldShow) {
  const list = type === 'draft' ? ideaDraftList : ideaBoard;
  if (!list) return;
  const card = list.querySelector(`[data-${type}-id="${id}"]`);
  if (!card || !card.editForm) return;
  card.editForm.hidden = !shouldShow;
  if (shouldShow && card.editText) {
    card.editText.focus();
  }
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

function handleGoalUpdate(data, id) {
  const record = sanitizeRecord(data);
  if (!goalSelect) return;
  const existing = goalSelect.querySelector(`option[value="${id}"]`);
  if (!record) {
    if (existing) existing.remove();
    return;
  }
  if (existing) {
    existing.textContent = record.title || 'Untitled goal';
  } else {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = record.title || 'Untitled goal';
    goalSelect.appendChild(option);
  }

  if (requestedGoalId && requestedGoalId === id) {
    goalSelect.value = id;
    if (ideationForm && !ideationForm.ideaGoal.value.trim()) {
      ideationForm.ideaGoal.value = record.title || '';
    }
  }
}

function createCampaignFromIdea(record) {
  const name = record.goal || record.text || 'New campaign';
  const payload = {
    name: truncate(name, 80),
    platform: record.platforms || '',
    objective: record.goal || '',
    status: 'planning',
    startDate: '',
    endDate: '',
    notes: record.text || '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const id = `campaign-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  campaignsNode.get(id).put(payload);
}

function createScheduleFromIdea(record) {
  const payload = {
    title: record.text || 'Untitled post',
    platforms: record.platforms || '',
    status: 'idea',
    scheduledDate: '',
    scheduledTime: '',
    timezone: '',
    mediaType: record.format || '',
    mediaUrl: '',
    altText: '',
    owner: '',
    caption: '',
    hashtags: '',
    cta: '',
    notes: record.goal ? `Goal: ${record.goal}` : '',
    assets: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const id = `schedule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  scheduleNode.get(id).put(payload);
}

function truncate(value, max) {
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}
