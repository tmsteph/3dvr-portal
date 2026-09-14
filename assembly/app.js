import {
  STORAGE_KEY,
  createAssemblySnapshot,
  emptyAssemblyState,
  normalizeAssemblyState,
  parseAssemblySnapshot,
} from './data.js';

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return normalizeAssemblyState(saved);
  } catch {
    return emptyAssemblyState();
  }
}

let state = loadState();
const $ = id => document.getElementById(id);
const clean = value => String(value || '').trim();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function save() {
  state = normalizeAssemblyState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function workspaceSlug() {
  return (state.identity.name || 'assembly')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'assembly';
}

function exportWorkspace() {
  const snapshot = createAssemblySnapshot(state);
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${workspaceSlug()}-assembly.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  $('transferStatus').textContent = 'Workspace exported. Keep the file private if the Assembly is private.';
}

async function importWorkspace(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    state = parseAssemblySnapshot(await file.text());
    save();
    $('transferStatus').textContent = `Imported ${file.name} into this device.`;
  } catch (error) {
    $('transferStatus').textContent = error instanceof Error ? error.message : 'Could not import this Assembly file.';
  } finally {
    event.target.value = '';
  }
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

function personName(id) {
  return state.people.find(item => item.id === id)?.name || 'Unknown person';
}

function renderTeams() {
  const list = $('teamList');
  const personSelect = $('assignmentPerson');
  const teamSelect = $('assignmentTeam');
  list.replaceChildren();
  personSelect.replaceChildren(new Option('Choose person', ''));
  teamSelect.replaceChildren(new Option('Choose team', ''));

  for (const person of state.people) personSelect.append(new Option(person.name, person.id));
  for (const team of state.teams) teamSelect.append(new Option(team.name, team.id));

  if (!state.teams.length) {
    list.append(emptyMessage('No teams yet. Create one when the Assembly needs a smaller working group.'));
    return;
  }

  for (const team of state.teams) {
    const card = document.createElement('article');
    card.className = 'team-card';
    const head = document.createElement('div');
    head.className = 'team-card__head';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const purpose = document.createElement('span');
    title.textContent = team.name;
    purpose.textContent = team.purpose || 'Purpose not set';
    copy.append(title, purpose);
    head.append(copy, makeButton('Remove team', 'remove-team', team.id));
    card.append(head);

    const assignments = state.assignments.filter(item => item.teamId === team.id);
    const roles = document.createElement('div');
    roles.className = 'team-roles';
    if (!assignments.length) {
      roles.append(emptyMessage('No roles assigned yet.'));
    } else {
      for (const assignment of assignments) {
        const row = document.createElement('div');
        row.className = 'team-role';
        const label = document.createElement('span');
        label.textContent = `${personName(assignment.personId)} · ${assignment.role}`;
        row.append(label, makeButton('Remove', 'remove-assignment', assignment.id));
        roles.append(row);
      }
    }
    card.append(roles);
    list.append(card);
  }
}

function renderInitiatives() {
  const list = $('initiativeList');
  const select = $('commitmentInitiative');
  list.replaceChildren();
  select.replaceChildren(new Option('General', ''));
  if (!state.initiatives.length) list.append(emptyMessage('No initiatives yet. Commitments can still live in General.'));
  for (const initiative of state.initiatives) {
    const chip = document.createElement('article');
    chip.className = 'initiative-chip';
    const name = document.createElement('strong');
    const lead = document.createElement('span');
    name.textContent = initiative.name;
    lead.textContent = initiative.lead ? `Lead: ${initiative.lead}` : 'Lead not set';
    chip.append(name, lead);
    list.append(chip);
    select.append(new Option(initiative.name, initiative.id));
  }
}

function initiativeName(id) {
  return state.initiatives.find(item => item.id === id)?.name || '';
}

function renderWork() {
  const configs = [
    ['commitmentList', state.commitments, 'No open commitments.', 'complete-commitment', item => {
      const detail = [item.owner, initiativeName(item.initiativeId), item.due].filter(Boolean).join(' · ') || 'Owner not set';
      return [item.text, detail];
    }],
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

function offerName(id) {
  return state.offers.find(item => item.id === id)?.text || '';
}

function renderOffers() {
  const list = $('offerList');
  list.replaceChildren();
  const open = state.offers.filter(item => !item.done);
  if (!open.length) return list.append(emptyMessage('No active offers yet.'));

  for (const offer of open) {
    const item = document.createElement('article');
    item.className = 'record offer-record';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = offer.text;
    meta.textContent = offer.owner ? `Offered by: ${offer.owner}` : 'Provider not set';
    copy.append(title, meta);
    item.append(copy, makeButton('Close', 'close-offer', offer.id));
    list.append(item);
  }
}

function renderNeeds() {
  const list = $('needList');
  list.replaceChildren();
  const openNeeds = state.needs.filter(item => !item.done);
  const openOffers = state.offers.filter(item => !item.done);
  if (!openNeeds.length) return list.append(emptyMessage('No open needs.'));

  for (const need of openNeeds) {
    const item = document.createElement('article');
    item.className = 'record need-record';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = need.text;
    meta.textContent = need.owner ? `Needed by: ${need.owner}` : 'Owner not set';
    copy.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'need-actions';
    if (openOffers.length) {
      const form = document.createElement('form');
      form.className = 'need-match-form';
      form.dataset.needId = need.id;
      const select = document.createElement('select');
      select.name = 'offerId';
      select.required = true;
      select.setAttribute('aria-label', `Offer to match with ${need.text}`);
      select.append(new Option('Match an offer…', ''));
      for (const offer of openOffers) {
        const label = offer.owner ? `${offer.text} · ${offer.owner}` : offer.text;
        select.append(new Option(label, offer.id));
      }
      const button = document.createElement('button');
      button.type = 'submit';
      button.className = 'button primary';
      button.textContent = 'Match';
      form.append(select, button);
      actions.append(form);
    }
    actions.append(makeButton('Resolve', 'resolve-need', need.id));
    item.append(copy, actions);
    list.append(item);
  }
}

function renderSupportHistory() {
  const list = $('supportHistoryList');
  list.replaceChildren();
  const resolved = state.needs
    .filter(item => item.done)
    .sort((a, b) => Number(b.doneAt || 0) - Number(a.doneAt || 0))
    .slice(0, 12);
  if (!resolved.length) return list.append(emptyMessage('Resolved needs will leave support receipts here.'));

  for (const need of resolved) {
    const item = document.createElement('article');
    item.className = 'record support-receipt';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = need.text;
    const matched = offerName(need.matchedOfferId);
    meta.textContent = [need.owner ? `Needed by: ${need.owner}` : '', matched ? `Matched: ${matched}` : 'Resolved directly'].filter(Boolean).join(' · ');
    copy.append(title, meta);
    item.append(copy);
    list.append(item);
  }
}

function renderDecisions() {
  const list = $('decisionList');
  list.replaceChildren();
  const open = state.decisions.filter(item => !item.done);
  if (!open.length) return list.append(emptyMessage('No open decisions.'));

  for (const decision of open) {
    const item = document.createElement('article');
    item.className = 'record decision-record';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = decision.text;
    meta.textContent = decision.owner ? `Decision owner: ${decision.owner}` : 'Decision owner not set';
    copy.append(title, meta);

    const form = document.createElement('form');
    form.className = 'decision-resolution-form';
    form.dataset.decisionId = decision.id;
    const input = document.createElement('input');
    input.name = 'resolution';
    input.required = true;
    input.placeholder = 'What did we decide?';
    input.setAttribute('aria-label', `Resolution for ${decision.text}`);
    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'button primary';
    button.textContent = 'Record decision';
    form.append(input, button);
    item.append(copy, form);
    list.append(item);
  }
}

function renderDecisionHistory() {
  const list = $('decisionHistoryList');
  list.replaceChildren();
  const resolved = state.decisions
    .filter(item => item.done)
    .sort((a, b) => Number(b.doneAt || 0) - Number(a.doneAt || 0))
    .slice(0, 12);
  if (!resolved.length) return list.append(emptyMessage('Resolved choices will stay visible here.'));

  for (const decision of resolved) {
    const item = document.createElement('article');
    item.className = 'record decision-history-record';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = decision.resolution || 'Resolved without a recorded resolution';
    meta.textContent = [`Question: ${decision.text}`, decision.owner].filter(Boolean).join(' · ');
    copy.append(title, meta);
    item.append(copy);
    list.append(item);
  }
}

function renderOutcomes() {
  const list = $('outcomeList');
  list.replaceChildren();
  const outcomes = state.commitments.filter(item => item.done).sort((a, b) => Number(b.doneAt || 0) - Number(a.doneAt || 0)).slice(0, 8);
  if (!outcomes.length) return list.append(emptyMessage('Completed commitments will become outcomes here.'));
  for (const outcome of outcomes) {
    const item = document.createElement('article');
    item.className = 'record outcome-record';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = outcome.text;
    meta.textContent = [outcome.owner, initiativeName(outcome.initiativeId)].filter(Boolean).join(' · ') || 'Completed';
    copy.append(title, meta);
    item.append(copy);
    list.append(item);
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
  renderTeams();
  renderInitiatives();
  renderWork();
  renderNeeds();
  renderOffers();
  renderSupportHistory();
  renderDecisions();
  renderDecisionHistory();
  renderOutcomes();
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

$('teamForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = clean($('teamName').value);
  if (!name) return;
  state.teams.push({ id: uid(), name, purpose: clean($('teamPurpose').value), createdAt: Date.now() });
  event.currentTarget.reset();
  save();
});

$('assignmentForm').addEventListener('submit', event => {
  event.preventDefault();
  const personId = $('assignmentPerson').value;
  const teamId = $('assignmentTeam').value;
  const role = clean($('assignmentRole').value);
  if (!personId || !teamId || !role) return;
  const duplicate = state.assignments.some(item => item.personId === personId && item.teamId === teamId && item.role.toLowerCase() === role.toLowerCase());
  if (!duplicate) state.assignments.push({ id: uid(), personId, teamId, role, createdAt: Date.now() });
  event.currentTarget.reset();
  save();
});

$('initiativeForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = clean($('initiativeName').value);
  if (!name) return;
  state.initiatives.push({ id: uid(), name, lead: clean($('initiativeLead').value), createdAt: Date.now() });
  event.currentTarget.reset();
  save();
});

$('commitmentForm').addEventListener('submit', event => {
  event.preventDefault();
  const text = clean($('commitmentText').value);
  if (!text) return;
  state.commitments.push({
    id: uid(), text, owner: clean($('commitmentOwner').value), initiativeId: $('commitmentInitiative').value,
    due: $('commitmentDue').value, done: false, createdAt: Date.now(),
  });
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
  state.needs.push({ id: uid(), text, owner: clean($('needOwner').value), matchedOfferId: '', done: false, createdAt: Date.now() });
  event.currentTarget.reset();
  save();
});

$('offerForm').addEventListener('submit', event => {
  event.preventDefault();
  const text = clean($('offerText').value);
  if (!text) return;
  state.offers.push({ id: uid(), text, owner: clean($('offerOwner').value), done: false, createdAt: Date.now() });
  event.currentTarget.reset();
  save();
});

document.addEventListener('submit', event => {
  const decisionForm = event.target.closest('.decision-resolution-form');
  if (decisionForm) {
    event.preventDefault();
    const resolution = clean(decisionForm.elements.resolution.value);
    if (!resolution) return;
    const decisionId = decisionForm.dataset.decisionId;
    state.decisions = state.decisions.map(item => item.id === decisionId
      ? { ...item, resolution, done: true, doneAt: Date.now() }
      : item);
    save();
    return;
  }

  const matchForm = event.target.closest('.need-match-form');
  if (!matchForm) return;
  event.preventDefault();
  const offerId = matchForm.elements.offerId.value;
  if (!offerId) return;
  const needId = matchForm.dataset.needId;
  state.needs = state.needs.map(item => item.id === needId
    ? { ...item, matchedOfferId: offerId, done: true, doneAt: Date.now() }
    : item);
  save();
});

$('exportAssembly').addEventListener('click', exportWorkspace);
$('importAssembly').addEventListener('change', importWorkspace);

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'remove-person') {
    state.people = state.people.filter(item => item.id !== id);
    state.assignments = state.assignments.filter(item => item.personId !== id);
  }
  if (action === 'remove-team') {
    state.teams = state.teams.filter(item => item.id !== id);
    state.assignments = state.assignments.filter(item => item.teamId !== id);
  }
  if (action === 'remove-assignment') state.assignments = state.assignments.filter(item => item.id !== id);
  if (action === 'complete-commitment') state.commitments = state.commitments.map(item => item.id === id ? { ...item, done: true, doneAt: Date.now() } : item);
  if (action === 'resolve-need') state.needs = state.needs.map(item => item.id === id ? { ...item, matchedOfferId: '', done: true, doneAt: Date.now() } : item);
  if (action === 'close-offer') state.offers = state.offers.map(item => item.id === id ? { ...item, done: true, doneAt: Date.now() } : item);
  save();
});

render();
