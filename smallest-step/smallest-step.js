const PEERS = ['wss://gun-relay-3dvr.fly.dev/gun', 'https://gun-relay-3dvr.fly.dev/gun'];
let counter = 0;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function buildStepRecord(input = {}, identity = {}, now = new Date()) {
  const createdAt = clean(input.createdAt) || now.toISOString();
  const id = clean(identity.id || identity.pub) || 'guest';
  return {
    id: clean(input.id) || makeId(now),
    app: 'smallest-step',
    version: 1,
    createdAt,
    updatedAt: clean(input.updatedAt) || createdAt,
    author: { id, ...(clean(identity.pub) ? { pub: clean(identity.pub) } : {}), isGuest: identity.isGuest ?? !identity.pub },
    vision: clean(input.vision).slice(0, 1200),
    step: clean(input.step).slice(0, 280),
    status: input.status === 'completed' ? 'completed' : 'planned',
    completedAt: input.status === 'completed' ? clean(input.completedAt) || createdAt : '',
  };
}

export function validateStepInput(input = {}) {
  if (!clean(input.vision)) return 'Write a few words about the life you are moving toward.';
  if (!clean(input.step)) return 'Choose one small step you can begin now.';
  return '';
}

export function sortRecentSteps(steps = [], limit = 12) {
  return [...steps].filter(item => item?.app === 'smallest-step' && item.id)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, limit);
}

function makeId(now) {
  if (globalThis.crypto?.randomUUID) return `step-${globalThis.crypto.randomUUID()}`;
  counter += 1;
  return `step-${now.getTime()}-${counter}`;
}

function storage(key) {
  try { return window.localStorage.getItem(key) || ''; } catch { return ''; }
}

function gunContext() {
  const factory = () => typeof window.Gun === 'function'
    ? window.Gun({ peers: Array.isArray(window.__GUN_PEERS__) ? window.__GUN_PEERS__ : PEERS, axe: true }) : null;
  if (window.ScoreSystem?.ensureGun) return window.ScoreSystem.ensureGun(factory, { label: 'smallest-step' });
  const gun = factory();
  return { gun, user: gun?.user?.() || null, isStub: !gun || !!gun.__isGunStub };
}

function author(user) {
  if (user?.is?.pub) return { id: user.is.pub, pub: user.is.pub, isGuest: false };
  return { id: window.ScoreSystem?.ensureGuestIdentity?.() || storage('guestId') || 'guest', isGuest: true };
}

function status(refs, text, warn = false) {
  refs.status.textContent = text;
  refs.status.classList.toggle('warn', warn);
}

function render(refs, state) {
  const items = sortRecentSteps(state.steps.values());
  refs.count.textContent = items.filter(item => item.status === 'completed').length;
  if (!items.length) { refs.list.innerHTML = '<p class="empty">Your first small step will appear here.</p>'; return; }
  refs.list.replaceChildren(...items.map(item => {
    const row = document.createElement('article');
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    const vision = document.createElement('p');
    const button = document.createElement('button');
    title.textContent = item.step;
    vision.textContent = item.vision;
    copy.append(title, vision);
    button.type = 'button';
    button.textContent = item.status === 'completed' ? 'Done ✓' : 'I did it';
    button.disabled = item.status === 'completed';
    button.addEventListener('click', () => {
      const updated = buildStepRecord({ ...item, status: 'completed', completedAt: new Date().toISOString() }, item.author);
      state.steps.set(updated.id, updated);
      state.root?.get('steps').get(updated.id).put(updated);
      render(refs, state);
      status(refs, 'Done. That is proof of movement.');
    });
    row.className = item.status === 'completed' ? 'done' : '';
    row.append(copy, button);
    return row;
  }));
}

function init() {
  const refs = {
    form: document.getElementById('stepForm'), vision: document.getElementById('visionInput'),
    step: document.getElementById('stepInput'), status: document.getElementById('syncStatus'),
    list: document.getElementById('recentSteps'), count: document.getElementById('completedCount'),
  };
  if (!refs.form) return;
  const switchView = name => {
    const next = ['today', 'steps', 'guide'].includes(name) ? name : 'today';
    document.querySelectorAll('[data-view]').forEach(view => {
      const active = view.dataset.view === next;
      view.hidden = !active;
      view.classList.toggle('active', active);
    });
    document.querySelectorAll('[data-view-target]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.viewTarget === next));
    });
    if (history.replaceState) history.replaceState(null, '', `#${next}`);
  };
  document.querySelectorAll('[data-view-target]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewTarget)));
  const context = gunContext();
  const state = { author: author(context.user), root: context.gun?.get('3dvr-portal').get('smallest-step'), steps: new Map() };
  refs.form.addEventListener('submit', event => {
    event.preventDefault();
    const input = { vision: refs.vision.value, step: refs.step.value };
    const error = validateStepInput(input);
    if (error) { status(refs, error, true); return; }
    const record = buildStepRecord(input, state.author);
    state.steps.set(record.id, record);
    state.root?.get('steps').get(record.id).put(record, ack => status(refs, ack?.err ? 'Saved here; sync will retry.' : 'Step saved. Now make it real.', !!ack?.err));
    state.root?.get('authors').get(record.author.id).get('steps').get(record.id).put(true);
    refs.step.value = '';
    render(refs, state);
    switchView('steps');
  });
  document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
    refs.step.value = button.dataset.example;
    switchView('today');
    refs.step.focus();
  }));
  switchView(location.hash.slice(1));
  if (!state.root) { status(refs, 'Offline mode. Sync will resume automatically.', true); return; }
  status(refs, context.isStub ? 'Offline mode. Sync will resume automatically.' : 'GUN sync ready.', context.isStub);
  state.root.get('steps').map().on((record, key) => {
    if (record?.app !== 'smallest-step') return;
    state.steps.set(record.id || key, record);
    render(refs, state);
  });
}

if (typeof document !== 'undefined') {
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
}
