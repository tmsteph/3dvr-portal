// Renders a character site entirely from ../characters.js data.
// The character is chosen with ?c=<id> and defaults to the first entry;
// adding a character to the data adds her site and switcher link here.
import { characters, getCharacter, defaultCharacter } from '../characters.js';
import { AFTER_DARK_PAYWALL, readAfterDarkEntitlement, resolveAfterDarkAccess } from './access.js';

const params = new URLSearchParams(location.search);
const character = getCharacter(params.get('c')) || defaultCharacter();
const asset = path => `../${path}`;

const $ = id => document.getElementById(id);

document.title = `${character.name} — Her Site · 3DVR`;
$('pageTitle').textContent = character.name;
$('heroEyebrow').textContent = character.heroEyebrow;
$('heroTagline').textContent = character.tagline;
$('heroImage').src = asset(character.heroImage.src);
$('heroImage').alt = character.heroImage.alt;
$('heroTags').replaceChildren(...character.tags.map(tag => {
  const span = document.createElement('span');
  span.textContent = tag;
  return span;
}));

const switcher = $('characterSwitcher');
if (characters.length > 1) {
  switcher.hidden = false;
  const label = document.createElement('span');
  label.textContent = 'Character sites:';
  switcher.append(label);
  for (const entry of characters) {
    const link = document.createElement('a');
    link.href = `?c=${encodeURIComponent(entry.id)}`;
    link.textContent = entry.name;
    if (entry.id === character.id) link.setAttribute('aria-current', 'page');
    switcher.append(link);
  }
}

$('aboutTitle').innerHTML = character.aboutTitle;
$('aboutCopy').replaceChildren(...character.about.map(text => {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}));
$('fieldNotes').replaceChildren(...character.fieldNotes.map(([term, value]) => {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}));

$('worldGrid').replaceChildren(...character.worlds.map((world, index) => {
  const figure = document.createElement('figure');
  figure.className = `world-card${index % 3 === 0 ? ' world-card--wide' : ''}`;
  const img = document.createElement('img');
  img.src = asset(world.image);
  img.alt = world.alt;
  img.loading = 'lazy';
  const caption = document.createElement('figcaption');
  const span = document.createElement('span');
  span.textContent = String(index + 1).padStart(2, '0');
  const strong = document.createElement('strong');
  strong.textContent = world.name;
  const small = document.createElement('small');
  small.textContent = world.copy;
  caption.append(span, strong, small);
  figure.append(img, caption);
  return figure;
}));

/* ---------- Lightbox: full-screen viewer for the scene + private grids.
   Prev/next buttons, arrow keys, and swipe; the anchor hrefs stay in
   place so a card still opens its photo without this script. ---------- */
const lightbox = {
  dialog: $('lightbox'),
  image: $('lightboxImage'),
  caption: $('lightboxCaption'),
  counter: $('lightboxCounter'),
  copy: $('lightboxCopy'),
  items: [],
  index: 0
};

function renderLightbox() {
  const item = lightbox.items[lightbox.index];
  if (!item) return;
  lightbox.image.src = item.src;
  lightbox.image.alt = item.alt || '';
  lightbox.caption.textContent = item.label || '';
  lightbox.counter.textContent = lightbox.items.length > 1
    ? `${lightbox.index + 1} / ${lightbox.items.length}` : '';
  lightbox.copy.textContent = item.copy || '';
  lightbox.copy.hidden = !item.copy;
  [lightbox.index - 1, lightbox.index + 1].forEach(i => {
    if (lightbox.items[i]) {
      const pre = new Image();
      pre.src = lightbox.items[i].src;
    }
  });
}

function openLightbox(items, index) {
  if (!items.length) return;
  lightbox.items = items;
  lightbox.index = Math.min(Math.max(index || 0, 0), items.length - 1);
  renderLightbox();
  if (!lightbox.dialog.open) lightbox.dialog.showModal();
}

function stepLightbox(delta) {
  if (lightbox.items.length < 2) return;
  lightbox.index = (lightbox.index + delta + lightbox.items.length) % lightbox.items.length;
  renderLightbox();
}

$('lightboxClose').addEventListener('click', () => lightbox.dialog.close());
$('lightboxPrev').addEventListener('click', () => stepLightbox(-1));
$('lightboxNext').addEventListener('click', () => stepLightbox(1));
lightbox.dialog.addEventListener('click', event => {
  if (event.target === lightbox.dialog) lightbox.dialog.close();
});
document.addEventListener('keydown', event => {
  if (!lightbox.dialog.open) return;
  if (event.key === 'ArrowLeft') stepLightbox(-1);
  if (event.key === 'ArrowRight') stepLightbox(1);
});
let lightboxTouchX = null;
lightbox.image.addEventListener('pointerdown', event => { lightboxTouchX = event.clientX; });
lightbox.image.addEventListener('pointerup', event => {
  if (lightboxTouchX === null) return;
  const dx = event.clientX - lightboxTouchX;
  lightboxTouchX = null;
  if (Math.abs(dx) > 42) stepLightbox(dx < 0 ? 1 : -1);
});

/* ---------- Show more: long grids reveal in chunks instead of one
   endless scroll. Cards past the chunk stay hidden (and unloaded)
   until the visitor asks for them. ---------- */
function paginate(grid, cards, pageSize) {
  grid.parentElement?.querySelector(':scope > .show-more-row')?.remove();
  let shown = Math.min(pageSize, cards.length);
  const apply = () => cards.forEach((card, i) => { card.hidden = i >= shown; });
  apply();
  if (cards.length <= pageSize) return;
  const row = document.createElement('div');
  row.className = 'show-more-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--quiet';
  const update = () => { button.textContent = `Show more · ${cards.length - shown} more`; };
  update();
  button.addEventListener('click', () => {
    shown = Math.min(cards.length, shown + pageSize);
    apply();
    update();
    if (shown >= cards.length) row.remove();
  });
  row.append(button);
  grid.after(row);
}

function visibleItems(cards, read) {
  return cards.filter(card => !card.hidden).map(read);
}

const galleryCards = character.gallery.map(scene => {
  const link = document.createElement('a');
  link.className = 'gallery-card';
  link.href = asset(scene.src);
  link.rel = 'noopener';
  const img = document.createElement('img');
  img.src = asset(scene.src);
  img.alt = scene.alt;
  img.loading = 'lazy';
  const caption = document.createElement('span');
  caption.className = 'gallery-card__caption';
  const mode = document.createElement('span');
  mode.textContent = scene.mode;
  const strong = document.createElement('strong');
  strong.textContent = scene.title;
  const copy = document.createElement('small');
  copy.textContent = scene.copy;
  caption.append(mode, strong, copy);
  link.append(img, caption);
  return link;
});
$('galleryGrid').replaceChildren(...galleryCards);
galleryCards.forEach(card => {
  card.addEventListener('click', event => {
    event.preventDefault();
    const items = visibleItems(galleryCards, link => {
      const img = link.querySelector('img');
      const mode = link.querySelector('.gallery-card__caption span')?.textContent || '';
      const strong = link.querySelector('.gallery-card__caption strong')?.textContent || '';
      const small = link.querySelector('.gallery-card__caption small')?.textContent || '';
      return {
        src: link.getAttribute('href'),
        alt: img?.getAttribute('alt') || '',
        label: [mode, strong].filter(Boolean).join(' · '),
        copy: small
      };
    });
    const visible = galleryCards.filter(entry => !entry.hidden);
    openLightbox(items, visible.indexOf(card));
  });
});
paginate($('galleryGrid'), galleryCards, 8);

/* ---------- Golden hour: her in-between shelf. Public like her scenes
   (no lock, no blur), sexier than them. Photos share the scene
   lightbox; clips play in place, tap to play. ---------- */
const goldenHourCards = (character.goldenHour || []).map(item => {
  const caption = document.createElement('span');
  caption.className = 'gallery-card__caption';
  const mode = document.createElement('span');
  mode.textContent = item.mode;
  const strong = document.createElement('strong');
  strong.textContent = item.title;
  const copy = document.createElement('small');
  copy.textContent = item.copy;
  caption.append(mode, strong, copy);
  if (item.video) {
    const card = document.createElement('article');
    card.className = 'gallery-card gallery-card--video';
    const video = document.createElement('video');
    video.src = asset(item.src);
    video.poster = asset(item.poster);
    video.controls = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('aria-label', item.alt);
    card.append(video, caption);
    return card;
  }
  const link = document.createElement('a');
  link.className = 'gallery-card';
  link.href = asset(item.src);
  link.rel = 'noopener';
  const img = document.createElement('img');
  img.src = asset(item.src);
  img.alt = item.alt;
  img.loading = 'lazy';
  link.append(img, caption);
  return link;
});
if (!goldenHourCards.length) {
  document.querySelector('[data-tab-panel="goldenhour"]')?.remove();
  document.querySelectorAll('[data-tab="goldenhour"]').forEach(link => link.remove());
} else {
  $('goldenHourGrid').replaceChildren(...goldenHourCards);
  goldenHourCards.forEach(card => {
    if (card.tagName !== 'A') return;
    card.addEventListener('click', event => {
      event.preventDefault();
      const photos = goldenHourCards.filter(entry => entry.tagName === 'A');
      const items = visibleItems(photos, link => {
        const img = link.querySelector('img');
        const mode = link.querySelector('.gallery-card__caption span')?.textContent || '';
        const strong = link.querySelector('.gallery-card__caption strong')?.textContent || '';
        const small = link.querySelector('.gallery-card__caption small')?.textContent || '';
        return {
          src: link.getAttribute('href'),
          alt: img?.getAttribute('alt') || '',
          label: [mode, strong].filter(Boolean).join(' · '),
          copy: small
        };
      });
      const visible = photos.filter(entry => !entry.hidden);
      openLightbox(items, visible.indexOf(card));
    });
  });
  paginate($('goldenHourGrid'), goldenHourCards, 8);
}


// After Dark: her private frames. The paywall decision lives in
// access.js (resolveAfterDarkAccess); this only renders its answer.
// Locked visitors get blurred previews and the unlock prompt — the same
// curtain model as the world page, never a vault. Open visitors get the
// frames as ordinary gallery cards.
function renderAfterDark() {
  const section = $('after-dark');
  if (!section) return;
  const frames = character.afterDark || [];
  if (!frames.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  let signedIn = false;
  try { signedIn = localStorage.getItem('signedIn') === 'true'; } catch {}
  const open = resolveAfterDarkAccess({ signedIn, entitled: readAfterDarkEntitlement() }) !== 'locked';
  const lock = $('afterDarkLock');
  lock.hidden = open;
  if (!open) {
    const unlock = $('afterDarkUnlock');
    const copy = $('afterDarkLockCopy');
    if (AFTER_DARK_PAYWALL.paymentLink) {
      unlock.hidden = false;
      unlock.href = AFTER_DARK_PAYWALL.paymentLink;
      unlock.textContent = AFTER_DARK_PAYWALL.priceLabel
        ? `${AFTER_DARK_PAYWALL.unlockLabel} — ${AFTER_DARK_PAYWALL.priceLabel}`
        : AFTER_DARK_PAYWALL.unlockLabel;
      copy.textContent = 'One unlock opens the private frames on every character site.';
    } else {
      // No payment link yet (Thomas's pricing call): show the button as
      // honestly pending instead of a link that goes nowhere.
      unlock.hidden = false;
      unlock.classList.add('button--pending');
      unlock.setAttribute('aria-disabled', 'true');
      unlock.textContent = `${AFTER_DARK_PAYWALL.unlockLabel} — coming soon`;
      unlock.onclick = event => event.preventDefault();
      copy.textContent = 'Members will be able to unlock these frames here. The owner sees them open.';
    }
  }
  const afterDarkCards = frames.map(frame => {
    const figure = document.createElement('figure');
    figure.className = 'gallery-card private-card';
    const img = document.createElement('img');
    img.src = asset(frame.src);
    img.alt = open ? frame.alt : '';
    img.loading = 'lazy';
    if (!open) img.className = 'is-blurred';
    const caption = document.createElement('figcaption');
    caption.className = 'gallery-card__caption';
    const mode = document.createElement('span');
    mode.textContent = 'After dark';
    const strong = document.createElement('strong');
    strong.textContent = frame.title;
    caption.append(mode, strong);
    if (open) {
      const link = document.createElement('a');
      link.href = asset(frame.src);
      link.rel = 'noopener';
      link.append(img);
      figure.append(link, caption);
    } else {
      figure.append(img, caption);
    }
    return figure;
  });
  $('afterDarkGrid').replaceChildren(...afterDarkCards);
  if (open) {
    afterDarkCards.forEach(card => {
      const link = card.querySelector('a');
      link?.addEventListener('click', event => {
        event.preventDefault();
        const items = visibleItems(afterDarkCards, entry => {
          const entryLink = entry.querySelector('a');
          const entryImg = entry.querySelector('img');
          const title = entry.querySelector('figcaption strong')?.textContent || '';
          return {
            src: entryLink?.getAttribute('href') || '',
            alt: entryImg?.getAttribute('alt') || '',
            label: ['After dark', title].filter(Boolean).join(' · '),
            copy: ''
          };
        });
        const visible = afterDarkCards.filter(entry => !entry.hidden);
        openLightbox(items, visible.indexOf(card));
      });
    });
  }
  paginate($('afterDarkGrid'), afterDarkCards, 12);
}
renderAfterDark();
window.addEventListener('storage', renderAfterDark);
window.addEventListener('focus', renderAfterDark);

$('storiesNote').textContent = character.storiesNote;
$('storyGrid').replaceChildren(...character.stories.map(story => {
  const link = document.createElement('a');
  link.className = 'story-card';
  link.href = `../${story.href}`;
  const img = document.createElement('img');
  img.src = asset(story.cover);
  img.alt = story.coverAlt;
  img.loading = 'lazy';
  const label = document.createElement('span');
  label.textContent = story.label;
  const strong = document.createElement('strong');
  strong.textContent = story.title;
  link.append(img, label, strong);
  return link;
}));

$('chatTitle').textContent = character.chat.heading;
$('chatNote').textContent = character.chat.privateNote;
$('chatMessage').placeholder = character.chat.placeholder;

/* ---------- Tabs: one section at a time instead of one long page.
   The panels carry the sections; the header links (and the hero
   buttons) switch between them. Hashes keep their meaning: #gallery,
   #after-dark, #stories, #chat open the matching tab, and #worlds is
   the About tab. Without this script every panel simply shows. ---------- */
const TAB_BY_SECTION = {
  worlds: 'about',
  gallery: 'scenes',
  'golden-hour': 'goldenhour',
  'after-dark': 'afterdark',
  stories: 'stories',
  chat: 'chat'
};
const SECTION_BY_TAB = {
  about: 'worlds',
  scenes: 'gallery',
  goldenhour: 'golden-hour',
  afterdark: 'after-dark',
  stories: 'stories',
  chat: 'chat'
};
const tabPanels = [...document.querySelectorAll('[data-tab-panel]')];
const tabLinks = [...document.querySelectorAll('[data-tab]')];

function activateTab(name, { scroll = false } = {}) {
  if (!tabPanels.some(panel => panel.dataset.tabPanel === name)) name = 'about';
  tabPanels.forEach(panel => { panel.hidden = panel.dataset.tabPanel !== name; });
  tabLinks.forEach(link => {
    const on = link.dataset.tab === name;
    link.classList.toggle('is-active', on);
    if (link.closest('.topbar__nav')) {
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  });
  if (scroll) {
    const panel = tabPanels.find(entry => entry.dataset.tabPanel === name);
    panel?.scrollIntoView({ block: 'start' });
  }
  return name;
}

function tabFromHash() {
  const id = location.hash.replace(/^#/, '');
  return TAB_BY_SECTION[id] || null;
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const tab = link.dataset.tab || TAB_BY_SECTION[link.getAttribute('href').slice(1)];
  if (!tab) return;
  event.preventDefault();
  activateTab(tab, { scroll: true });
  const target = `#${SECTION_BY_TAB[tab]}`;
  if (location.hash !== target) history.replaceState(null, '', target);
});

activateTab(tabFromHash() || 'about');
window.addEventListener('hashchange', () => {
  const tab = tabFromHash();
  if (tab) activateTab(tab, { scroll: true });
});

/* ---------- Back to top ---------- */
const backToTop = $('backToTop');
window.addEventListener('scroll', () => {
  backToTop.hidden = window.scrollY < 600;
}, { passive: true });
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
