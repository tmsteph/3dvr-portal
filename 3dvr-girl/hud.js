// The Ladies HUD: the world page as a game shell. A fixed frame —
// top bar with stage select, a character-select roster rail, and a
// stage that swaps panels in place — so the page itself never
// scrolls; only the stage does. Sections keep their anchors and
// order; each carries a data-stage group, and the stage shows one
// group at a time: the editorial World, the scene Archive, the
// Golden hour shelf, and After dark behind its curtain.
// Without this module every section simply shows, as before.
import { characters } from './characters.js';

const STAGES = ['world', 'archive', 'goldenhour', 'afterdark'];
const STAGE_FOR_SECTION = {
  archive: 'archive',
  'golden-hour': 'goldenhour',
  'after-dark': 'afterdark'
};
const SECTION_FOR_STAGE = {
  world: 'top',
  archive: 'archive',
  goldenhour: 'golden-hour',
  afterdark: 'after-dark'
};

const stageEl = document.querySelector('.hud-stage');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Roster rail: character select. The World chip stays on
   this page; a girl's chip loads her own site, which wears the same
   HUD shell, so the frame never changes — only who is in it. Martha
   rides along as staff, not cast, exactly as the cast strip labels
   her. ---------- */
const rail = document.querySelector('#hudRail');
if (rail) {
  const chip = ({ href, image, alt, name, note, active }) => {
    const link = document.createElement('a');
    link.className = `hud-chip${active ? ' is-active' : ''}`;
    link.href = href;
    if (active) link.setAttribute('aria-current', 'page');
    const img = document.createElement('img');
    img.src = image;
    img.alt = alt;
    img.loading = 'lazy';
    const label = document.createElement('span');
    label.className = 'hud-chip__name';
    label.textContent = name;
    link.append(img, label);
    if (note) {
      const small = document.createElement('small');
      small.textContent = note;
      link.append(small);
    }
    return link;
  };
  rail.append(chip({
    href: '#top',
    image: 'assets/courtyard-warrior.jpg',
    alt: '3DVR Girl in a warrior pose in a sunlit courtyard',
    name: 'World',
    note: 'the whole cast',
    active: true
  }));
  for (const entry of characters) {
    rail.append(chip({
      href: `character/?c=${encodeURIComponent(entry.id)}`,
      image: entry.heroImage.src,
      alt: entry.heroImage.alt,
      name: entry.name,
      note: 'her site'
    }));
  }
  rail.append(chip({
    href: '../martha/',
    image: '../martha/assets/martha-avatar.webp',
    alt: 'Martha, a pineapple character with a green leafy crown, wearing a black dress with red and gold trim',
    name: 'Martha',
    note: 'staff'
  }));
}

/* ---------- Stage select ---------- */
const stageSections = [...document.querySelectorAll('[data-stage]')];
const stageButtons = [...document.querySelectorAll('[data-stage-tab]')];
let currentStage = 'world';

function scrollStageTo(el) {
  if (!stageEl) return;
  if (el) el.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  else stageEl.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function activateStage(name, { scrollTarget = null } = {}) {
  if (!STAGES.includes(name)) name = 'world';
  currentStage = name;
  stageSections.forEach(section => { section.hidden = section.dataset.stage !== name; });
  stageButtons.forEach(button => {
    const on = button.dataset.stageTab === name;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-pressed', String(on));
  });
  scrollStageTo(scrollTarget);
  return name;
}

/* Counts in the stage tabs, counted from the rendered grids so they
   can never drift from what is actually on the shelves. */
const counts = {
  archive: document.querySelectorAll('#archiveGrid .archive-card').length,
  goldenhour: (document.querySelector('#goldenHourGrid')?.childElementCount || 0)
    + (document.querySelector('#danceVideoGrid')?.childElementCount || 0),
  afterdark: document.querySelectorAll('#afterDarkGrid .private-card').length
};
document.querySelectorAll('[data-stage-count]').forEach(el => {
  const n = counts[el.dataset.stageCount];
  if (n) el.textContent = String(n);
});

stageButtons.forEach(button => {
  button.addEventListener('click', () => {
    const name = activateStage(button.dataset.stageTab);
    const target = `#${SECTION_FOR_STAGE[name]}`;
    if (location.hash !== target) history.replaceState(null, '', target);
  });
});

/* Anchors keep their meaning: a link to a section opens its stage
   and scrolls the stage to it, instead of scrolling the page. */
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const id = link.getAttribute('href').slice(1).split('/')[0];
  if (!id) return;
  const el = document.getElementById(id);
  if (id !== 'top' && !el) return;
  event.preventDefault();
  if (id === 'top') {
    activateStage('world');
  } else {
    activateStage(STAGE_FOR_SECTION[id] || 'world', { scrollTarget: el });
  }
  const target = `#${id}`;
  if (location.hash !== target) history.replaceState(null, '', target);
});

function stageFromHash() {
  const id = location.hash.replace(/^#/, '').split('/')[0];
  if (id.startsWith('after-dark')) return 'afterdark';
  return STAGE_FOR_SECTION[id] || 'world';
}

function applyHash() {
  const id = location.hash.replace(/^#/, '').split('/')[0];
  const el = id && id !== 'top' ? document.getElementById(id) : null;
  activateStage(stageFromHash(), { scrollTarget: el });
}

applyHash();
window.addEventListener('hashchange', applyHash);

/* Stage select on the number keys, like a game menu: 1 World,
   2 Archive, 3 Golden hour, 4 After dark. Never while a viewer is
   open or the visitor is typing. */
document.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const target = event.target;
  if (target && (target.matches?.('input, textarea, select') || target.isContentEditable)) return;
  const index = ['1', '2', '3', '4'].indexOf(event.key);
  if (index < 0) return;
  const name = activateStage(STAGES[index]);
  const hash = `#${SECTION_FOR_STAGE[name]}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
});

window.LadiesHud = { activateStage, get stage() { return currentStage; } };
