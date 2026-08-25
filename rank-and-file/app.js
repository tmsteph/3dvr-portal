import { createGun } from '../src/gun/adapter.js';
import {
  buildInvite,
  buildJoinUrl,
  createPrivateRef,
  mergeRefs,
  parseInvite,
  randomToken,
  refKey,
  removeRef
} from './model.js';

const STORAGE_KEY = '3dvr.rank-file.refs.v1';
const DEVICE_KEY = '3dvr.rank-file.device.v1';
const NAME_KEY = '3dvr.rank-file.name.v1';
const DATA_ROOT = 'rank-and-file-v1';
const SEA = window.SEA;

let context = null;
let refs = loadRefs();
const state = new Map();
const hydrating = new Map();
const deviceId = loadDeviceId();

const $ = selector => document.querySelector(selector);
const committeesEl = $('#committees');
const coalitionsEl = $('#coalitions');
const statusEl = $('#networkStatus');
const toastEl = $('#toast');

function loadRefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (_error) {
    return [];
  }
}

function saveRefs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(refs));
}

function loadDeviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = randomToken(12);
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function preferredName(candidate = '') {
  const clean = String(candidate || '').trim().slice(0, 80);
  if (clean) localStorage.setItem(NAME_KEY, clean);
  return clean || localStorage.getItem(NAME_KEY) || 'Anonymous worker';
}

function showToast(message, error = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', error);
  toastEl.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toastEl.hidden = true; }, 4200);
}

function setBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  button.dataset.originalText ||= button.textContent;
  button.textContent = busy ? 'Working…' : button.dataset.originalText;
}

function nodeFor(ref) {
  if (!context) throw new Error('GUN is still connecting.');
  const bucket = ref.kind === 'committee' ? 'committees' : 'coalitions';
  return context.path(DATA_ROOT, bucket, ref.id);
}

async function encryptPayload(ref, payload) {
  if (!SEA?.encrypt) throw new Error('GUN SEA encryption is unavailable.');
  return SEA.encrypt(JSON.stringify(payload), ref.secret);
}

async function decryptPayload(ref, blob) {
  if (!blob || !SEA?.decrypt) return null;
  const value = await SEA.decrypt(blob, ref.secret);
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_error) { return null; }
}

async function putEncrypted(node, ref, payload) {
  const blob = await encryptPayload(ref, payload);
  await context.put(node, { v: 1, blob });
}

async function readEncrypted(node, ref, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const row = await context.once(node);
    if (row?.blob) {
      const value = await decryptPayload(ref, row.blob);
      if (value) return value;
    }
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 300 + attempt * 350));
  }
  return null;
}

async function writeMeta(ref, meta) {
  await putEncrypted(nodeFor(ref).get('meta'), ref, { ...meta, kind: ref.kind, version: 1 });
}

async function readMeta(ref) {
  return readEncrypted(nodeFor(ref).get('meta'), ref);
}

async function writeEvent(ref, event) {
  const eventId = randomToken(16);
  const payload = { ...event, at: event.at || Date.now(), actor: event.actor || deviceId };
  await putEncrypted(nodeFor(ref).get('events').get(eventId), ref, payload);
  return payload;
}

function hasRef(ref) {
  const key = refKey(ref);
  return refs.some(item => refKey(item) === key);
}

function rememberRef(ref) {
  refs = mergeRefs(refs, ref);
  saveRefs();
  renderAll();
  hydrateRef(ref).catch(error => showToast(error.message, true));
}

function forgetRef(ref) {
  refs = removeRef(refs, ref);
  saveRefs();
  state.delete(refKey(ref));
  renderAll();
}

async function hydrateRef(ref) {
  const key = refKey(ref);
  if (hydrating.has(key)) return hydrating.get(key);
  if (state.get(key)?.subscribed) return state.get(key);

  const task = (async () => {
    const entry = state.get(key) || { ref, meta: null, events: new Map(), subscribed: false, error: '' };
    state.set(key, entry);
    try {
      entry.meta = await readMeta(ref);
      if (!entry.meta) throw new Error(`Could not decrypt this ${ref.kind}. Check the invite key and network connection.`);
      entry.subscribed = true;
      nodeFor(ref).get('events').map().on(async (row, eventId) => {
        if (!row?.blob || !eventId) return;
        const event = await decryptPayload(ref, row.blob);
        if (!event) return;
        entry.events.set(eventId, event);
        if (ref.kind === 'committee' && event.type === 'coalition.linked' && event.coalitionInvite) {
          try {
            const coalitionRef = parseInvite(event.coalitionInvite, 'coalition');
            if (!hasRef(coalitionRef)) rememberRef(coalitionRef);
          } catch (_error) {
            // Ignore malformed historical links.
          }
        }
        renderAll();
      });
      entry.error = '';
      renderAll();
      return entry;
    } catch (error) {
      entry.error = error.message;
      renderAll();
      throw error;
    } finally {
      hydrating.delete(key);
    }
  })();

  hydrating.set(key, task);
  return task;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function sortedEvents(entry) {
  return [...(entry?.events?.values() || [])].sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
}

function activeMembers(events) {
  const members = new Map();
  for (const event of events) {
    if (event.type === 'member.joined' && event.memberId) members.set(event.memberId, event);
    if (event.type === 'member.left' && event.memberId) members.delete(event.memberId);
  }
  return [...members.values()];
}

function uniqueBy(items, keyFn) {
  const map = new Map();
  for (const item of items) map.set(keyFn(item), item);
  return [...map.values()];
}

async function copyInvite(ref) {
  const value = buildJoinUrl(ref, `${location.origin}/rank-and-file/`);
  try {
    await navigator.clipboard.writeText(value);
    showToast('Private invite link copied. Share it only with people you trust.');
  } catch (_error) {
    showToast(value);
  }
}

function addStat(container, text) {
  container.append(createElement('span', 'stat', text));
}

function renderInviteBox(ref) {
  const box = createElement('div', 'invite-box');
  box.append(createElement('strong', '', 'Private invite'));
  const code = createElement('code', '', buildInvite(ref));
  box.append(code);
  const row = createElement('div', 'card-actions');
  const copy = createElement('button', 'secondary', 'Copy invite link');
  copy.type = 'button';
  copy.addEventListener('click', () => copyInvite(ref));
  row.append(copy);
  box.append(row);
  return box;
}

function renderCommitteeCard(ref, entry) {
  const card = createElement('article', 'card');
  if (!entry?.meta) {
    card.append(createElement('p', 'muted', entry?.error || 'Decrypting committee…'));
    return card;
  }

  const events = sortedEvents(entry);
  const members = activeMembers(events);
  const priorities = events.filter(event => event.type === 'priority.added');
  const updates = events.filter(event => event.type === 'update.added');
  const coalitionLinks = uniqueBy(events.filter(event => event.type === 'coalition.linked' && event.coalitionId), event => event.coalitionId);

  const head = createElement('div', 'card-head');
  const titleWrap = createElement('div');
  titleWrap.append(createElement('h3', '', entry.meta.name || 'Unnamed committee'));
  if (entry.meta.scope) titleWrap.append(createElement('p', 'scope', entry.meta.scope));
  head.append(titleWrap);
  card.append(head);
  if (entry.meta.purpose) card.append(createElement('p', 'purpose', entry.meta.purpose));

  const stats = createElement('div', 'stats');
  addStat(stats, `${members.length} worker${members.length === 1 ? '' : 's'}`);
  addStat(stats, `${priorities.length} priorit${priorities.length === 1 ? 'y' : 'ies'}`);
  addStat(stats, `${coalitionLinks.length} coalition${coalitionLinks.length === 1 ? '' : 's'}`);
  card.append(stats);

  if (coalitionLinks.length) {
    const linked = createElement('div', 'linked-list');
    coalitionLinks.forEach(link => linked.append(createElement('span', '', link.coalitionName || 'Coalition')));
    card.append(linked);
  }

  const feedEvents = [...priorities, ...updates].sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).slice(0, 6);
  if (feedEvents.length) {
    const feed = createElement('div', 'feed');
    feedEvents.forEach(event => {
      const item = createElement('div', 'feed-item');
      item.append(createElement('strong', '', event.type === 'priority.added' ? 'Priority' : 'Update'));
      item.append(createElement('p', '', event.text || ''));
      item.append(createElement('small', '', `${event.by || 'Worker'} · ${new Date(event.at).toLocaleString()}`));
      feed.append(item);
    });
    card.append(feed);
  }

  const composer = createElement('div', 'composer');
  const row = createElement('div', 'composer-row');
  const input = createElement('input');
  input.placeholder = 'Add a priority or update…';
  input.maxLength = 500;
  const priorityButton = createElement('button', 'primary', 'Priority');
  priorityButton.type = 'button';
  const updateButton = createElement('button', 'secondary', 'Update');
  updateButton.type = 'button';
  const submit = async type => {
    const text = input.value.trim();
    if (!text) return;
    priorityButton.disabled = true;
    updateButton.disabled = true;
    try {
      await writeEvent(ref, { type, text, by: preferredName() });
      input.value = '';
    } catch (error) {
      showToast(error.message, true);
    } finally {
      priorityButton.disabled = false;
      updateButton.disabled = false;
    }
  };
  priorityButton.addEventListener('click', () => submit('priority.added'));
  updateButton.addEventListener('click', () => submit('update.added'));
  row.append(input, priorityButton, updateButton);
  composer.append(row);
  card.append(composer);

  card.append(renderInviteBox(ref));
  const actions = createElement('div', 'card-actions');
  const forget = createElement('button', 'secondary', 'Remove from this device');
  forget.type = 'button';
  forget.addEventListener('click', () => {
    if (confirm('Remove this committee key from this device? You will need the invite again to recover access.')) forgetRef(ref);
  });
  actions.append(forget);
  card.append(actions);
  return card;
}

function renderCoalitionCard(ref, entry) {
  const card = createElement('article', 'card');
  if (!entry?.meta) {
    card.append(createElement('p', 'muted', entry?.error || 'Decrypting coalition…'));
    return card;
  }
  const events = sortedEvents(entry);
  const committees = uniqueBy(events.filter(event => event.type === 'committee.linked' && event.committeeId), event => event.committeeId);
  card.append(createElement('h3', '', entry.meta.name || 'Unnamed coalition'));
  if (entry.meta.purpose) card.append(createElement('p', 'purpose', entry.meta.purpose));
  const stats = createElement('div', 'stats');
  addStat(stats, `${committees.length} committee${committees.length === 1 ? '' : 's'}`);
  card.append(stats);
  if (committees.length) {
    const linked = createElement('div', 'linked-list');
    committees.forEach(item => linked.append(createElement('span', '', item.committeeName || 'Committee')));
    card.append(linked);
  }
  card.append(renderInviteBox(ref));
  const actions = createElement('div', 'card-actions');
  const forget = createElement('button', 'secondary', 'Remove from this device');
  forget.type = 'button';
  forget.addEventListener('click', () => {
    if (confirm('Remove this coalition key from this device? You will need the invite again to recover access.')) forgetRef(ref);
  });
  actions.append(forget);
  card.append(actions);
  return card;
}

function renderCommitteeChoices(committeeRefs) {
  const choices = $('#coalitionCommitteeChoices');
  const select = $('#coalitionCommitteeSelect');
  choices.replaceChildren();
  select.replaceChildren();
  const placeholder = createElement('option', '', committeeRefs.length ? 'Choose a committee' : 'Join a committee first');
  placeholder.value = '';
  select.append(placeholder);

  if (!committeeRefs.length) {
    choices.append(createElement('span', 'muted', 'Join a committee first.'));
    return;
  }

  committeeRefs.forEach(ref => {
    const entry = state.get(refKey(ref));
    const name = entry?.meta?.name || 'Decrypting committee…';
    const label = createElement('label', 'choice');
    const checkbox = createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'committeeIds';
    checkbox.value = ref.id;
    label.append(checkbox, document.createTextNode(name));
    choices.append(label);

    const option = createElement('option', '', name);
    option.value = ref.id;
    select.append(option);
  });
}

function renderAll() {
  const committeeRefs = refs.filter(ref => ref.kind === 'committee');
  const coalitionRefs = refs.filter(ref => ref.kind === 'coalition');
  $('#committeeCount').textContent = String(committeeRefs.length);
  $('#coalitionCount').textContent = String(coalitionRefs.length);

  committeesEl.replaceChildren();
  if (!committeeRefs.length) committeesEl.append(createElement('p', 'empty', 'Create or join your first committee.'));
  committeeRefs.forEach(ref => committeesEl.append(renderCommitteeCard(ref, state.get(refKey(ref)))));

  coalitionsEl.replaceChildren();
  if (!coalitionRefs.length) coalitionsEl.append(createElement('p', 'empty', 'No coalitions on this device yet.'));
  coalitionRefs.forEach(ref => coalitionsEl.append(renderCoalitionCard(ref, state.get(refKey(ref)))));

  renderCommitteeChoices(committeeRefs);
}

async function linkCommitteeToCoalition(committeeRef, coalitionRef, coalitionMeta) {
  const committeeMeta = state.get(refKey(committeeRef))?.meta || await readMeta(committeeRef);
  if (!committeeMeta) throw new Error('Could not decrypt the selected committee.');
  const coalitionInvite = buildInvite(coalitionRef);
  await Promise.all([
    writeEvent(coalitionRef, {
      type: 'committee.linked',
      committeeId: committeeRef.id,
      committeeName: committeeMeta.name || 'Committee'
    }),
    writeEvent(committeeRef, {
      type: 'coalition.linked',
      coalitionId: coalitionRef.id,
      coalitionName: coalitionMeta.name || 'Coalition',
      coalitionInvite
    })
  ]);
}

$('#createCommitteeForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    const data = new FormData(form);
    const ref = createPrivateRef('committee');
    const meta = {
      name: String(data.get('name') || '').trim(),
      purpose: String(data.get('purpose') || '').trim(),
      scope: String(data.get('scope') || '').trim(),
      createdAt: Date.now()
    };
    const name = preferredName(data.get('displayName'));
    await writeMeta(ref, meta);
    await writeEvent(ref, { type: 'member.joined', memberId: deviceId, name });
    rememberRef(ref);
    form.reset();
    showToast('Committee created. Copy its private invite link from the card.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(form, false);
  }
});

$('#joinCommitteeForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    const data = new FormData(form);
    const ref = parseInvite(data.get('invite'), 'committee');
    const meta = await readMeta(ref);
    if (!meta) throw new Error('Could not open that committee. The invite may be wrong or the network may still be syncing.');
    const name = preferredName(data.get('displayName'));
    rememberRef(ref);
    await writeEvent(ref, { type: 'member.joined', memberId: deviceId, name });
    form.reset();
    showToast(`Joined ${meta.name || 'committee'}.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(form, false);
  }
});

$('#createCoalitionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    const data = new FormData(form);
    const selectedIds = data.getAll('committeeIds').map(String);
    if (!selectedIds.length) throw new Error('Choose at least one committee to start the coalition.');
    const committeeRefs = refs.filter(ref => ref.kind === 'committee' && selectedIds.includes(ref.id));
    const ref = createPrivateRef('coalition');
    const meta = {
      name: String(data.get('name') || '').trim(),
      purpose: String(data.get('purpose') || '').trim(),
      createdAt: Date.now()
    };
    await writeMeta(ref, meta);
    for (const committeeRef of committeeRefs) await linkCommitteeToCoalition(committeeRef, ref, meta);
    rememberRef(ref);
    form.reset();
    showToast('Coalition created and linked. Its committees remain independent.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(form, false);
  }
});

$('#joinCoalitionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    const data = new FormData(form);
    const coalitionRef = parseInvite(data.get('invite'), 'coalition');
    const coalitionMeta = await readMeta(coalitionRef);
    if (!coalitionMeta) throw new Error('Could not open that coalition. The invite may be wrong or still syncing.');
    const committeeRef = refs.find(ref => ref.kind === 'committee' && ref.id === String(data.get('committeeId')));
    if (!committeeRef) throw new Error('Choose a committee you can access.');
    await linkCommitteeToCoalition(committeeRef, coalitionRef, coalitionMeta);
    rememberRef(coalitionRef);
    form.reset();
    showToast(`Linked your committee to ${coalitionMeta.name || 'the coalition'}.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(form, false);
  }
});

function prefillInviteFromHash() {
  if (!location.hash.includes('join=')) return;
  try {
    const ref = parseInvite(location.href);
    const invite = buildInvite(ref);
    if (ref.kind === 'committee') {
      $('#committeeInviteInput').value = invite;
      $('#joinCommitteePanel').open = true;
    } else {
      $('#coalitionInviteInput').value = invite;
      $('#joinCoalitionPanel').open = true;
    }
  } catch (_error) {
    // Ignore unrelated fragments.
  }
}

async function init() {
  renderAll();
  prefillInviteFromHash();
  if (!SEA?.encrypt || !SEA?.decrypt) {
    statusEl.textContent = 'Encryption unavailable';
    showToast('GUN SEA encryption did not load. Refresh before using organizing data.', true);
    return;
  }
  try {
    context = await createGun();
    statusEl.textContent = 'GUN encrypted sync ready';
    await Promise.allSettled(refs.map(ref => hydrateRef(ref)));
  } catch (error) {
    statusEl.textContent = 'Offline / retry needed';
    showToast(`Could not connect to GUN: ${error.message}`, true);
  }
}

init();
