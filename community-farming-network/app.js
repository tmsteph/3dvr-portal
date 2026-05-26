const FARMING_ROOT = 'communityFarmingNetwork';
const LOCAL_KEY = '3dvr-community-farming-network';

const state = {
  entries: new Map(),
  filter: 'all',
};

const els = {
  form: document.getElementById('shareForm'),
  type: document.getElementById('entryType'),
  title: document.getElementById('entryTitle'),
  neighborhood: document.getElementById('entryNeighborhood'),
  timing: document.getElementById('entryTiming'),
  details: document.getElementById('entryDetails'),
  list: document.getElementById('entryList'),
  status: document.getElementById('syncStatus'),
  filters: Array.from(document.querySelectorAll('[data-filter]')),
};

function clean(value) {
  return String(value || '').trim();
}

function createId() {
  return `farm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function getGunRoot() {
  if (typeof window.Gun !== 'function') {
    els.status.textContent = 'Gun is not available. Saving locally in this browser.';
    return null;
  }

  const gun = window.gun || window.Gun(window.__GUN_PEERS__ || ['https://gun-relay-3dvr.fly.dev/gun']);
  window.gun = gun;
  els.status.textContent = 'Connected to the portal Gun graph.';

  // Future backend hook:
  // gun.get('3dvr-portal').get('communityFarmingNetwork').get('entries').get(id)
  return gun.get('3dvr-portal').get(FARMING_ROOT);
}

const root = getGunRoot();

function saveLocalBackup() {
  try {
    const entries = Array.from(state.entries.values());
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries));
  } catch (_error) {
    // Gun remains the primary shared store when available.
  }
}

function loadLocalBackup() {
  try {
    const entries = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    if (!Array.isArray(entries)) return;
    entries.forEach(entry => {
      if (entry && entry.id && entry.title) state.entries.set(entry.id, entry);
    });
  } catch (_error) {
    // Ignore malformed local drafts.
  }
}

function typeLabel(value) {
  const labels = {
    harvest: 'Harvest',
    garden: 'Garden',
    labor: 'Labor',
    resource: 'Tool',
  };
  return labels[value] || 'Post';
}

function formatDate(timestamp) {
  const date = new Date(Number(timestamp || 0));
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderEntries() {
  const entries = Array.from(state.entries.values())
    .filter(entry => entry && entry.title)
    .filter(entry => state.filter === 'all' || entry.type === state.filter)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  els.list.innerHTML = '';
  if (!entries.length) {
    els.list.innerHTML = '<article class="entry-card"><p>No posts in this lane yet. Add the first food, labor, land, or tool note.</p></article>';
    return;
  }

  entries.slice(0, 30).forEach(entry => {
    const card = document.createElement('article');
    card.className = 'entry-card';
    card.innerHTML = `
      <div class="entry-card__top">
        <div>
          <span class="entry-type"></span>
          <h3></h3>
        </div>
        <small></small>
      </div>
      <p></p>
      <div class="entry-meta"></div>
    `;
    card.querySelector('.entry-type').textContent = typeLabel(entry.type);
    card.querySelector('h3').textContent = entry.title;
    card.querySelector('small').textContent = formatDate(entry.createdAt);
    card.querySelector('p').textContent = entry.details || 'No details yet.';

    const meta = card.querySelector('.entry-meta');
    [entry.neighborhood, entry.timing].filter(Boolean).forEach(value => {
      const chip = document.createElement('span');
      chip.textContent = value;
      meta.append(chip);
    });

    els.list.append(card);
  });
}

function addEntry(event) {
  event.preventDefault();
  const entry = {
    id: createId(),
    type: clean(els.type.value) || 'harvest',
    title: clean(els.title.value),
    neighborhood: clean(els.neighborhood.value),
    timing: clean(els.timing.value),
    details: clean(els.details.value),
    createdAt: Date.now(),
  };

  if (!entry.title) return;
  state.entries.set(entry.id, entry);
  saveLocalBackup();
  renderEntries();
  root?.get('entries').get(entry.id).put(entry);
  els.form.reset();
  els.status.textContent = root ? 'Saved to the Community Farming Network.' : 'Saved locally.';
}

function bindFilters() {
  els.filters.forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter || 'all';
      els.filters.forEach(item => item.classList.toggle('active', item === button));
      renderEntries();
    });
  });
}

function bindGun() {
  if (!root) return;
  root.get('entries').map().on((entry, id) => {
    if (!entry || !entry.title) return;
    state.entries.set(entry.id || id, { ...entry, id: entry.id || id });
    saveLocalBackup();
    renderEntries();
  });
}

loadLocalBackup();
bindFilters();
els.form.addEventListener('submit', addEntry);
renderEntries();
bindGun();
