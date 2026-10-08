import { createLabAccountSync } from './account-sync.js';
const KEY = '3dvr.cs-build-lab.v1';
const phases = ['learn', 'build', 'explain'];
const $ = id => document.getElementById(id);
let modules = [];
let accountSync;
let state = { version: 1, modules: {} };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.version === 1 && saved.modules && typeof saved.modules === 'object') state = saved;
} catch {
  $('storage-status').textContent = 'Saved progress could not be read. You can still study and export this session.';
}
function save() {
  if (accountSync?.available) { accountSync.save(state); return; }
  if (accountSync?.pub) return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { $('storage-status').textContent = 'Browser storage is unavailable. Export progress before leaving this page.'; }
}
function entry(id) {
  let value = state.modules[id];
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = state.modules[id] = {};
  if (!value.steps || typeof value.steps !== 'object') value.steps = {};
  if (typeof value.notes !== 'string') value.notes = '';
  if (!Number.isFinite(Date.parse(value.completedAt))) value.completedAt = null;
  return value;
}
function update() {
  let count = 0;
  let next;
  for (const m of modules) {
    const e = entry(m.id);
    for (const phase of phases) {
      if (e.steps[phase]) count++;
      else if (!next) next = { m, phase };
    }
    const review = document.querySelector('[data-review="' + m.id + '"]');
    if (review) {
      review.textContent = e.completedAt ? 'Revisit: ' + [1, 7, 30].map(days => {
        const date = new Date(e.completedAt);
        date.setDate(date.getDate() + days);
        return date.toLocaleDateString();
      }).join(' · ') : 'Finish all three steps to set your review dates.';
    }
  }
  $('progress').value = count;
  $('count').textContent = count + ' / 24 steps';
  $('today-title').textContent = next ? next.m.title + ': ' + next.phase : 'Your foundation is growing.';
  $('next-task').textContent = next ? next.m[next.phase] : 'Review a finished module or choose your next real project.';
  $('next-link').href = next ? '#module-' + next.m.id : '#modules';
  const minutes = Number($('minutes').value);
  $('session-plan').textContent = minutes === 15 ? '5 min learn · 7 min practice · 3 min explain' : minutes === 60 ? '10 min learn · 40 min build · 10 min explain' : '5 min learn · 20 min build · 5 min explain';
}
function render() {
  $('modules').replaceChildren();
  modules.forEach((m, i) => {
    const e = entry(m.id);
    const details = document.createElement('details');
    details.id = 'module-' + m.id;
    details.open = i === 0;
    const summary = document.createElement('summary');
    summary.textContent = String(i + 1).padStart(2, '0') + ' / ' + m.title;
    details.append(summary);
    const body = document.createElement('div');
    body.className = 'module-content';
    const context = document.createElement('p');
    context.className = 'connection';
    context.textContent = '3DVR connection: ' + m.connection;
    const concept = document.createElement('p');
    concept.textContent = m.concept;
    body.append(context, concept);
    phases.forEach(phase => {
      const step = document.createElement('div');
      step.className = 'step';
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = e.steps[phase] === true;
      input.dataset.module = m.id;
      input.dataset.phase = phase;
      input.setAttribute('aria-label', m.title + ': ' + phase);
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = phase[0].toUpperCase() + phase.slice(1) + ': ';
      text.append(strong, document.createTextNode(m[phase]));
      label.append(input, text);
      step.append(label);
      input.addEventListener('change', () => {
        const e = entry(m.id);
        e.steps[phase] = input.checked;
        e.completedAt = phases.every(p => e.steps[p]) ? (e.completedAt || new Date().toISOString()) : null;
        save();
        update();
      });
      body.append(step);
    });
    const link = document.createElement('a');
    link.href = m.resource;
    link.textContent = m.label;
    body.append(link);
    const label = document.createElement('label');
    label.htmlFor = 'notes-' + m.id;
    label.textContent = 'Your explanation, result, or PR link';
    const notes = document.createElement('textarea');
    notes.id = label.htmlFor;
    notes.value = typeof e.notes === 'string' ? e.notes : '';
    notes.maxLength = 20000;
    notes.addEventListener('input', () => { entry(m.id).notes = notes.value; save(); });
    const review = document.createElement('p');
    review.className = 'review';
    review.dataset.review = m.id;
    body.append(label, notes, review);
    details.append(body);
    $('modules').append(details);
  });
  update();
}
function guestState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved?.version === 1 && saved.modules ? saved : { version: 1, modules: {} };
  } catch { return { version: 1, modules: {} }; }
}
function connectAccount() {
  accountSync?.stop();
  accountSync = createLabAccountSync({
    windowObj: window,
    ids: modules.map(m => m.id),
    getGuestState: guestState,
    onStatus: message => {
      $('storage-status').textContent = message;
      $('signin').hidden = !/Sign in|Sign-in|Account changed/i.test(message);
    },
    onState: incoming => {
      state = incoming;
      for (const m of modules) {
        const e = entry(m.id);
        for (const phase of phases) {
          const input = document.querySelector('[data-module="' + m.id + '"][data-phase="' + phase + '"]');
          if (input) input.checked = e.steps[phase] === true;
        }
        const notes = $('notes-' + m.id);
        if (notes && document.activeElement !== notes) notes.value = e.notes;
      }
      update();
    }
  });
}
$('retry-sync').addEventListener('click', connectAccount);
$('minutes').addEventListener('change', update);
$('next-link').addEventListener('click', () => {
  const target = document.querySelector($('next-link').getAttribute('href'));
  if (target?.tagName === 'DETAILS') target.open = true;
});
function compare() {
  const n = Number($('size').value);
  let low = 0, high = n - 1, checks = 0;
  while (low <= high) {
    checks++;
    const mid = Math.floor((low + high) / 2);
    if (mid === n - 1) break;
    low = mid + 1;
  }
  $('size-value').textContent = n;
  $('linear').textContent = n + (n === 1 ? ' check' : ' checks');
  $('binary').textContent = checks + (checks === 1 ? ' check' : ' checks');
}
$('size').addEventListener('input', compare);
compare();
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '3dvr-cs-progress.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('transfer-status').textContent = 'Progress exported.';
});
$('import').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('File too large');
    const imported = JSON.parse(await file.text());
    if (imported.version !== 1 || !imported.modules || typeof imported.modules !== 'object') throw new Error('Invalid format');
    // Merge known module IDs only. Completed steps are preserved on both devices.
    for (const m of modules) {
      const incoming = imported.modules[m.id];
      if (!incoming || typeof incoming !== 'object') continue;
      const current = entry(m.id);
      for (const phase of phases) current.steps[phase] = current.steps[phase] === true || incoming.steps?.[phase] === true;
      if (typeof incoming.notes === 'string' && incoming.notes && incoming.notes !== current.notes) {
        current.notes = (current.notes ? current.notes + '\n\nImported notes:\n' : '') + incoming.notes.slice(0, 20000);
      }
      if (phases.every(p => current.steps[p])) {
        const date = incoming.completedAt;
        current.completedAt ||= typeof date === 'string' && Number.isFinite(Date.parse(date)) ? date : new Date().toISOString();
      }
    }
    save();
    render();
    $('transfer-status').textContent = 'Progress merged. Existing completed steps were kept.';
  } catch {
    $('transfer-status').textContent = 'Could not import. Choose a CS Build Lab progress JSON export.';
  }
  event.target.value = '';
});
try {
  const response = await fetch('./curriculum.json');
  if (!response.ok) throw new Error('Curriculum unavailable');
  modules = await response.json();
  render();
  connectAccount();
} catch {
  $('today-title').textContent = 'Learning plan unavailable';
  $('load-error').textContent = 'Reload to try again. Your saved progress remains in this browser.';
}
