const STORAGE_KEY = '3dvr.assembly.v1';

const emptyState = () => ({
  identity: { name: '', purpose: '' },
  people: [],
  commitments: [],
  decisions: [],
  needs: [],
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved && typeof saved === 'object' ? { ...emptyState(), ...saved } : emptyState();
  } catch {
    return emptyState();
  }
}

let state = loadState();

const $ = id => document.getElementById(id);
const clean = value => String(value || '').trim();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function makeButton(label, action, id, className = 'record-action') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

function emptyMessage(text) {
  const item = document.createElement('div');
  item.className = 'empty-record';
  item.textContent = text;
  return item;
}

function renderPeople() {
  const list = $('peopleList');
  list.replaceChildren();
  if (!state.people.length) return list.append(emptyMessage('No people yet. Add the first person.'));

  for (const person of state.people) {
    const item = document.createElement('article');
    item.className = 'record';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = person.name;
    meta.textContent = person.role || 'Member';
    copy.append(title, meta);
    item.append(copy, makeButton('Remove', 'remove-person', person.id));
    list.append(item);
  }
}

function renderWork() {
  const configs = [
    ['commitmentList', state.commitments, 'No open commitments.', 'complete-commitment', item => [item.text, [item.owner, item.due].filter(Boolean).join(' · ') || 'Owner not set']],
    ['decisionList', state.decisions, 'No open decisions.', 'resolve-decision', item => [item.text, item.owner ? `Decision owner: ${item.owner}` : 'Decision owner not set']],
    ['needList', state.needs, 'No open needs.', 'resolve-need', item => [item.text, item.owner ? `Needed by: ${item.owner}` : 'Owner not set']],
  ];

  for (const [listId, records, emptyText, action, describe] of configs) {
    const list = $(listId);
    list.replaceChildren();
    const open = records.filter(record => !record.done);
    if (!open.length) {
      list.append(emptyMessage(emptyText));
      continue;
    }
    for (const record of open) {
      const [heading, detail] = describe(record);
      const item = document.createElement('article');
      item.className = 'record';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      const meta = document.createElement('span');
      title.textContent = heading;
      meta.textContent = detail;
      copy.append(title, meta);
      item.append(copy, makeButton('Done', action, record.id, 'record-action done'));
      list.append(item);
    }
  }
}

function render() {
  $('assemblyName').value = state.identity.name || '';
  $('assemblyPurpose').value = state.identity.purpose || '';
  $('peopleCount').textContent = state.people.length;
  $('nowCount').textContent = state.commitments.filter(item => !item.done).length;
  $('decisionCount').textContent = state.decisions.filter(item => !item.done).length;
  $('needCount').textContent = state.needs.filter(item => !item.done).length;
  renderPeople();
  renderWork();
}

$('identityForm').addEventListener('submit', event => {
  event.preventDefault();
  state.identity = { name: clean($('assemblyName').value), purpose: clean($('assemblyPurpose').value) };
  save();
});

$('personForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = clean($('personName').value);
  if (!name) return;
  state.people.push({ id: uid(), name, role: clean($('personRole').value), createdAt: Date.now() });
  event.currentTarget.reset();
  save();
});

$('commitmentForm').addEventListener('submit', event => {
  event.preventDefault();
  const text = clean($('commitmentText').value);
  if (!text) return;
  state.commitments.push({ id: uid(), text, owner: clean($('commitmentOwner').value), due: $('commitmentDue').value, done: false, createdAt: Date.now() });
  event.currentTarget.reset();
  save();
});

$('decisionForm').addEventListener('submit', event => {
  event.preventDefault();
  const text = clean($('decisionText').value);
  if (!text) return;
  state.decisions.push({ id: uid(), text, owner: clean($('decisionOwner').value), done: false, createdAt: Date.now() });
  event.currentTarget.reset();
  save();
});

$('needForm').addEventListener('submit', event => {
  event.preventDefault();
  const text = clean($('needText').value);
  if (!text) return;
  state.needs.push({ id: uid(), text, owner: clean($('needOwner').value), done: false, createdAt: Date.now() });
  event.currentTarget.reset();
  save();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'remove-person') state.people = state.people.filter(item => item.id !== id);
  if (action === 'complete-commitment') state.commitments = state.commitments.map(item => item.id === id ? { ...item, done: true } : item);
  if (action === 'resolve-decision') state.decisions = state.decisions.map(item => item.id === id ? { ...item, done: true } : item);
  if (action === 'resolve-need') state.needs = state.needs.map(item => item.id === id ? { ...item, done: true } : item);
  save();
});

render();
