import { STORAGE_KEY, normalizeAssemblyState } from './data.js';
import { deriveAssemblyFocus } from './focus.js';

function readState() {
  try {
    return normalizeAssemblyState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return normalizeAssemblyState(null);
  }
}

function makePanel() {
  const section = document.createElement('section');
  section.className = 'focus-board panel';
  section.setAttribute('aria-labelledby', 'focusBoardTitle');
  section.innerHTML = `
    <div class="focus-head">
      <div>
        <p class="eyebrow">Focus board</p>
        <h2 id="focusBoardTitle">Now / Next / Waiting</h2>
      </div>
      <p>Derived from commitments, initiatives, decisions, and needs. Nothing new to maintain.</p>
    </div>
    <div class="focus-columns">
      <article><h3>Now</h3><div id="focusNow" class="focus-list"></div></article>
      <article><h3>Next</h3><div id="focusNext" class="focus-list"></div></article>
      <article><h3>Waiting</h3><div id="focusWaiting" class="focus-list"></div></article>
    </div>`;
  document.querySelector('.section-tabs')?.before(section);
  return section;
}

function renderList(target, items, emptyText) {
  target.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'focus-empty';
    empty.textContent = emptyText;
    target.append(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = `focus-item focus-item--${item.kind}`;
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = item.title;
    meta.textContent = item.meta;
    row.append(title, meta);
    target.append(row);
  }
}

function renderFocus() {
  if (!document.getElementById('focusBoardTitle')) makePanel();
  const focus = deriveAssemblyFocus(readState());
  renderList(document.getElementById('focusNow'), focus.now, 'No active commitments.');
  renderList(document.getElementById('focusNext'), focus.next, 'Nothing queued next.');
  renderList(document.getElementById('focusWaiting'), focus.waiting, 'Nothing is waiting on a decision or need.');
}

const scheduleRender = () => window.setTimeout(renderFocus, 0);
document.addEventListener('submit', scheduleRender);
document.addEventListener('click', event => {
  if (event.target.closest('[data-action]')) scheduleRender();
});
document.addEventListener('change', event => {
  if (event.target.id === 'importAssembly') scheduleRender();
});
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) renderFocus();
});

renderFocus();
