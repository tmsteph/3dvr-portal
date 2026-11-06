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

$('galleryGrid').replaceChildren(...character.gallery.map(scene => {
  const link = document.createElement('a');
  link.className = 'gallery-card';
  link.href = asset(scene.src);
  link.target = '_blank';
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
}));


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
      unlock.hidden = true;
      copy.textContent = 'Members will be able to unlock these frames here. The owner sees them open.';
    }
  }
  $('afterDarkGrid').replaceChildren(...frames.map(frame => {
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
      link.target = '_blank';
      link.rel = 'noopener';
      link.append(img);
      figure.append(link, caption);
    } else {
      figure.append(img, caption);
    }
    return figure;
  }));
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
