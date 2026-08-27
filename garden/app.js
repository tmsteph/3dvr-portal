const STORAGE_KEY = '3dvr.ideaGarden.v2';
const LEGACY_STORAGE_KEY = '3dvr.ideaGarden.v1';
const STAGES = ['seed', 'exploring', 'project', 'done'];

const stageLabels = {
  seed: '🌱 Seed',
  exploring: '✨ Exploring',
  project: '🛠 Project',
  done: '✓ Finished',
};

const stageNudges = {
  seed: 'It can rest here. If it keeps pulling at you, write why it matters.',
  exploring: 'Make it smaller. What could you learn from one tiny experiment?',
  project: 'A project only needs one clear next move. Keep the next step tiny.',
  done: 'Keep the lesson. Finished ideas can feed whatever you grow next.',
};

const form = document.querySelector('#ideaForm');
const input = document.querySelector('#ideaInput');
const list = document.querySelector('#ideaList');
const emptyState = document.querySelector('#emptyState');
const noMatches = document.querySelector('#noMatches');
const clearDone = document.querySelector('#clearDone');
const downloadButton = document.querySelector('#downloadGarden');
const searchInput = document.querySelector('#gardenSearch');
const filterButtons = Array.from(document.querySelectorAll('[data-garden-filter]'));
const status = document.querySelector('#gardenStatus');
const summary = document.querySelector('#gardenSummary');
const focusShelf = document.querySelector('#focusShelf');
const focusIdea = document.querySelector('#focusIdea');
const focusNext = document.querySelector('#focusNext');
const openFocus = document.querySelector('#openFocus');

let ideas = loadIdeas();
let activeFilter = 'all';
let searchTerm = '';

syncFilterButtons();
render();

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = clean(input.value);
  if (!text) return;

  ideas.unshift(normalizeIdea({
    id: createId(),
    text,
    stage: 'seed',
    why: '',
    nextStep: '',
    focused: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  persist('Planted. You can leave it alone or nurture it whenever you are ready.');
  input.value = '';
  input.focus();
  activeFilter = 'all';
  syncFilterButtons();
  render();
});

clearDone.addEventListener('click', () => {
  const finished = ideas.filter((idea) => idea.stage === 'done');
  if (!finished.length) return;
  if (!window.confirm(`Remove ${finished.length} finished idea${finished.length === 1 ? '' : 's'} from this browser?`)) return;

  ideas = ideas.filter((idea) => idea.stage !== 'done');
  persist('Finished ideas cleared.');
  render();
});

downloadButton.addEventListener('click', downloadGarden);

searchInput.addEventListener('input', () => {
  searchTerm = clean(searchInput.value).toLowerCase();
  renderIdeas();
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.gardenFilter || 'all';
    syncFilterButtons();
    renderIdeas();
  });
});

openFocus.addEventListener('click', () => {
  const focused = ideas.find((idea) => idea.focused);
  if (!focused) return;
  activeFilter = 'all';
  searchTerm = '';
  searchInput.value = '';
  syncFilterButtons();
  renderIdeas();
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-idea-id="${escapeSelector(focused.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});

list.addEventListener('change', (event) => {
  const target = event.target;

  if (target.matches('select[data-stage-id]')) {
    updateIdea(target.dataset.stageId, (idea) => {
      idea.stage = STAGES.includes(target.value) ? target.value : 'seed';
      if (idea.stage === 'done') idea.focused = false;
    }, 'Stage updated.');
    return;
  }

  if (target.matches('textarea[data-field][data-id]')) {
    updateIdea(target.dataset.id, (idea) => {
      const field = target.dataset.field;
      if (field === 'why' || field === 'nextStep') {
        idea[field] = clean(target.value);
      }
    }, 'Idea saved.');
  }
});

list.addEventListener('click', (event) => {
  const focusButton = event.target.closest('button[data-focus]');
  if (focusButton) {
    setFocus(focusButton.dataset.focus);
    return;
  }

  const deleteButton = event.target.closest('button[data-delete]');
  if (deleteButton) {
    const idea = ideas.find((item) => item.id === deleteButton.dataset.delete);
    if (!idea) return;
    if (!window.confirm('Remove this idea from this browser?')) return;
    ideas = ideas.filter((item) => item.id !== idea.id);
    persist('Idea removed.');
    render();
  }
});

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeSelector(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function normalizeIdea(value = {}) {
  const createdAt = clean(value.createdAt) || new Date().toISOString();
  return {
    id: clean(value.id) || createId(),
    text: clean(value.text),
    stage: STAGES.includes(value.stage) ? value.stage : 'seed',
    why: clean(value.why),
    nextStep: clean(value.nextStep),
    focused: Boolean(value.focused) && value.stage !== 'done',
    createdAt,
    updatedAt: clean(value.updatedAt) || createdAt,
  };
}

function migrateLegacyIdeas(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((idea) => normalizeIdea({ ...idea, why: '', nextStep: '', focused: false }))
    .filter((idea) => idea.text);
}

function safeRead(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function loadIdeas() {
  try {
    const current = safeRead(STORAGE_KEY);
    if (current) {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) {
        return normalizeFocus(parsed.map(normalizeIdea).filter((idea) => idea.text));
      }
    }

    const legacy = safeRead(LEGACY_STORAGE_KEY);
    if (!legacy) return [];
    const migrated = migrateLegacyIdeas(JSON.parse(legacy));
    if (migrated.length) {
      safeWrite(STORAGE_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return [];
  }
}

function normalizeFocus(items) {
  let foundFocus = false;
  return items.map((idea) => {
    if (idea.focused && !foundFocus && idea.stage !== 'done') {
      foundFocus = true;
      return idea;
    }
    return { ...idea, focused: false };
  });
}

function persist(message = 'Saved locally in this browser.') {
  const ok = safeWrite(STORAGE_KEY, JSON.stringify(ideas));
  status.textContent = ok ? message : 'Could not save locally. Download a backup before leaving.';
  return ok;
}

function updateIdea(id, updater, message) {
  const idea = ideas.find((item) => item.id === id);
  if (!idea) return;
  updater(idea);
  idea.updatedAt = new Date().toISOString();
  ideas = normalizeFocus(ideas);
  persist(message);
  render();
}

function setFocus(id) {
  const target = ideas.find((idea) => idea.id === id);
  if (!target || target.stage === 'done') return;
  const wasFocused = target.focused;
  ideas.forEach((idea) => {
    idea.focused = !wasFocused && idea.id === id;
    if (idea.id === id) idea.updatedAt = new Date().toISOString();
  });
  persist(wasFocused ? 'Focus cleared.' : 'Focus set. Keep the next move small.');
  render();
}

function visibleIdeas() {
  return ideas.filter((idea) => {
    const stageMatches = activeFilter === 'all' || idea.stage === activeFilter;
    const haystack = `${idea.text} ${idea.why} ${idea.nextStep}`.toLowerCase();
    return stageMatches && (!searchTerm || haystack.includes(searchTerm));
  });
}

function syncFilterButtons() {
  filterButtons.forEach((button) => {
    const active = button.dataset.gardenFilter === activeFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function render() {
  renderSummary();
  renderFocus();
  renderIdeas();
  clearDone.hidden = !ideas.some((idea) => idea.stage === 'done');
}

function renderSummary() {
  const seeds = ideas.filter((idea) => idea.stage === 'seed').length;
  const active = ideas.filter((idea) => idea.stage === 'exploring' || idea.stage === 'project').length;
  const done = ideas.filter((idea) => idea.stage === 'done').length;

  if (!ideas.length) {
    summary.textContent = 'Seeds can rest. Projects can grow. Finished ideas still count.';
    return;
  }

  summary.textContent = `${ideas.length} idea${ideas.length === 1 ? '' : 's'} · ${seeds} resting · ${active} growing · ${done} finished`;
}

function renderFocus() {
  const focused = ideas.find((idea) => idea.focused && idea.stage !== 'done');
  focusShelf.hidden = !focused;
  if (!focused) return;

  focusIdea.textContent = focused.text;
  focusNext.textContent = focused.nextStep
    ? `Next: ${focused.nextStep}`
    : 'No next step yet. Pick the smallest useful action you could do in one sitting.';
}

function renderIdeas() {
  const visible = visibleIdeas();
  list.replaceChildren();
  emptyState.hidden = ideas.length > 0;
  noMatches.hidden = ideas.length === 0 || visible.length > 0;

  visible.forEach((idea) => list.appendChild(renderIdeaCard(idea)));
}

function renderIdeaCard(idea) {
  const card = document.createElement('article');
  card.className = 'idea-card';
  card.dataset.stage = idea.stage;
  card.dataset.focused = idea.focused ? 'true' : 'false';
  card.dataset.ideaId = idea.id;

  const header = document.createElement('div');
  header.className = 'idea-card-header';

  const copy = document.createElement('div');
  copy.className = 'idea-copy';
  copy.textContent = idea.text;

  const focusButton = document.createElement('button');
  focusButton.type = 'button';
  focusButton.className = `focus-button${idea.focused ? ' active' : ''}`;
  focusButton.dataset.focus = idea.id;
  focusButton.textContent = idea.focused ? 'Focused' : 'Focus';
  focusButton.hidden = idea.stage === 'done';
  focusButton.setAttribute('aria-pressed', idea.focused ? 'true' : 'false');

  header.append(copy, focusButton);

  const nudge = document.createElement('p');
  nudge.className = 'stage-nudge';
  nudge.textContent = stageNudges[idea.stage];

  const nurture = document.createElement('div');
  nurture.className = 'nurture-grid';
  nurture.append(
    makeNurtureField(idea, 'why', 'Why this matters', 'What keeps pulling you back to this?'),
    makeNurtureField(idea, 'nextStep', 'Next tiny step', 'What could you do in one sitting?')
  );

  const actions = document.createElement('div');
  actions.className = 'idea-actions';

  const tool = toolForStage(idea);
  const toolLink = document.createElement('a');
  toolLink.className = 'idea-tool-link';
  toolLink.href = tool.href;
  toolLink.textContent = tool.label;

  const meta = document.createElement('div');
  meta.className = 'idea-meta';

  const date = document.createElement('small');
  date.textContent = `Planted ${formatDate(idea.createdAt)}`;

  const controls = document.createElement('div');
  controls.className = 'idea-controls';

  const select = document.createElement('select');
  select.dataset.stageId = idea.id;
  select.setAttribute('aria-label', `Stage for ${idea.text}`);
  STAGES.forEach((stage) => {
    const option = document.createElement('option');
    option.value = stage;
    option.textContent = stageLabels[stage];
    select.appendChild(option);
  });
  select.value = idea.stage;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'delete-button';
  remove.dataset.delete = idea.id;
  remove.textContent = 'Remove';

  controls.append(select, remove);
  meta.append(date, controls);
  actions.append(toolLink, meta);
  card.append(header, nudge, nurture, actions);
  return card;
}

function makeNurtureField(idea, field, label, placeholder) {
  const wrapper = document.createElement('label');
  wrapper.className = 'nurture-field';

  const title = document.createElement('span');
  title.textContent = label;

  const textarea = document.createElement('textarea');
  textarea.rows = 2;
  textarea.maxLength = 500;
  textarea.placeholder = placeholder;
  textarea.value = idea[field] || '';
  textarea.dataset.field = field;
  textarea.dataset.id = idea.id;

  wrapper.append(title, textarea);
  return wrapper;
}

function toolForStage(idea) {
  if (idea.stage === 'seed') {
    return { label: 'Explore in Forge', href: '../forge/' };
  }
  if (idea.stage === 'exploring') {
    return { label: 'Shape in Launch Room', href: '../launch-room/?mode=start-project' };
  }
  if (idea.stage === 'project') {
    return { label: 'Choose today’s move', href: '../life/' };
  }
  return { label: 'Start another spark', href: '#ideaForm' };
}

function downloadGarden() {
  const payload = {
    format: '3dvr-idea-garden',
    version: 2,
    exportedAt: new Date().toISOString(),
    ideas,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `3dvr-idea-garden-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  status.textContent = 'Garden backup downloaded.';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}
