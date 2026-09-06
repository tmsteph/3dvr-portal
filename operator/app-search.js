const input = document.querySelector('#operator-input');
const panel = document.querySelector('#app-search-results');
const list = document.querySelector('#app-search-list');
const count = document.querySelector('#app-search-count');

const FEATURED = [
  { title: '3DVR Portal', href: '/', description: 'Home and app launcher', aliases: 'home dashboard portal apps' },
  { title: 'Operator', href: '/operator/', description: 'AI operator for 3DVR', aliases: 'assistant ai chat agent' },
  { title: '3DVR Teach', href: '/teach/', description: 'Turn demonstrations into reusable agent skills', aliases: 'teach show me how record workflow skill training demonstration' },
  { title: 'Calendar', href: '/calendar/', description: 'Schedule and events', aliases: 'schedule appointments events booking' },
  { title: 'CRM', href: '/crm/', description: 'Customers and relationships', aliases: 'customers clients sales relationships' },
  { title: 'Contacts', href: '/contacts/', description: 'People and contact records', aliases: 'people address book' },
  { title: 'Life Space', href: '/life-space/', description: 'Notes, ideas, links, and checklists', aliases: 'notes ideas links checklist personal' },
  { title: 'Noteverse', href: '/noteverse/', description: 'Explore Life Space notes in a living 3D constellation', aliases: '3d notes spatial ideas constellation life space productivity' },
  { title: 'Labs', href: '/labs/', description: 'Experimental computing, artificial life, and research prototypes', aliases: 'experiments research life lab digital organism noteverse calendar future weird science' },
  { title: 'Life Lab', href: '/life-lab/', description: 'Evolving 3D organisms with live selection data', aliases: 'artificial life evolution genes lineage science 3d simulation' },
  { title: 'Digital Organism', href: '/digital-organism/', description: 'User-owned memory and continual intelligence research', aliases: 'memory ai agent context continual intelligence research' },
  { title: '13-Month Calendar', href: '/calendar/13/', description: 'A 13 × 28 calendar experiment', aliases: 'calendar time experiment 13 month fixed year' },
  { title: 'Workboard', href: '/workboard/', description: 'Projects, issues, and agent work', aliases: 'projects tasks issues agents jira kanban' },
  { title: 'Meditation', href: '/meditation/', description: 'Relax and explore', aliases: 'relax breathing calm mindfulness trip' },
  { title: 'Body Mode', href: '/body-mode/', description: 'Physical reset and body tools', aliases: 'stretch posture movement wellness' },
  { title: 'Intention Lab', href: '/intention-lab/', description: 'Intentions and direction', aliases: 'manifest goals intention purpose' },
  { title: 'Inner Alignment', href: '/inner-alignment/', description: 'Reflection and alignment', aliases: 'alignment reflection purpose' },
  { title: 'Sky Room', href: '/sky-room/', description: 'Visual space to reset', aliases: 'relax visual room sky' },
  { title: '3DVR Girl', href: '/3dvr-girl/', description: '3DVR character universe', aliases: 'characters kayla story universe' },
  { title: '3DVR Desktop', href: '/3dvr-desktop/', description: 'Web-native desktop environment', aliases: 'desktop os apps launcher computer' },
  { title: '3DVR OS', href: '/3dvr-os/', description: 'Open personal computing', aliases: 'operating system linux open computing' },
  { title: 'AV Operator', href: '/av-operator/', description: 'Tools for audiovisual work', aliases: 'audio video av show event work' },
  { title: 'Business Sites', href: '/business-sites/', description: 'Build and manage business websites', aliases: 'website web builder business' },
  { title: 'New Business Launch', href: '/new-business-launch/', description: 'Start a small business', aliases: 'launch startup business offer' },
  { title: 'Free Page', href: '/free-page/', description: 'Create a simple free website', aliases: 'website page builder free site' },
  { title: 'Open Source CRM', href: '/open-source-crm/', description: 'Open CRM project', aliases: 'crm open source project' }
];

const STOP_WORDS = new Set(['open', 'launch', 'start', 'find', 'show', 'go', 'to', 'the', 'a', 'an', 'app', 'page', '3dvr', 'please']);
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = value => normalize(value).split(/\s+/).filter(Boolean);
const cleanQuery = value => words(value).filter(word => !STOP_WORDS.has(word)).join(' ');
const titleFromPath = href => {
  const path = new URL(href, location.origin).pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return '3DVR Portal';
  return path.split('/').pop().replace(/\.html?$/i, '').split(/[-_]+/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};
const safeInternalHref = href => {
  try {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return null;
    if (/\.(?:js|css|json|xml|map|png|jpe?g|gif|svg|webp|ico|woff2?|txt|md)$/i.test(url.pathname)) return null;
    if (url.pathname.startsWith('/api/')) return null;
    return `${url.pathname}${url.search}`;
  } catch { return null; }
};

function mergeItem(map, item) {
  const href = safeInternalHref(item.href);
  if (!href) return;
  const current = map.get(href) || { href, title: titleFromPath(href), description: '', aliases: '' };
  map.set(href, {
    href,
    title: item.title?.trim() || current.title,
    description: item.description?.trim() || current.description,
    aliases: [current.aliases, item.aliases, item.title, current.title].filter(Boolean).join(' ')
  });
}

async function buildIndex() {
  const map = new Map();
  FEATURED.forEach(item => mergeItem(map, item));

  try {
    const response = await fetch('/sitemap.xml', { cache: 'no-store' });
    if (response.ok) {
      const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
      xml.querySelectorAll('loc').forEach(node => mergeItem(map, { href: node.textContent }));
    }
  } catch {}

  try {
    const response = await fetch('/', { cache: 'no-store' });
    if (response.ok) {
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      doc.querySelectorAll('a[href]').forEach(anchor => {
        const href = safeInternalHref(anchor.getAttribute('href'));
        const label = anchor.textContent.replace(/\s+/g, ' ').trim();
        if (href) mergeItem(map, { href, title: label.length > 1 && label.length < 60 ? label : '', aliases: label });
      });
    }
  } catch {}

  return [...map.values()];
}

let searchIndexPromise = buildIndex();

function score(item, rawQuery) {
  const query = cleanQuery(rawQuery);
  if (!query) return 0;
  const queryWords = words(query);
  const title = normalize(item.title);
  const href = normalize(item.href);
  const haystack = normalize(`${item.title} ${item.description} ${item.aliases} ${item.href}`);
  let value = 0;
  if (title === query) value += 140;
  if (title.startsWith(query)) value += 90;
  if (title.includes(query)) value += 65;
  if (href.includes(query)) value += 35;
  for (const word of queryWords) {
    if (title.split(' ').includes(word)) value += 24;
    else if (title.includes(word)) value += 16;
    if (haystack.includes(word)) value += 8;
    else return 0;
  }
  return value;
}

function hideResults() {
  panel.hidden = true;
  list.innerHTML = '';
}

function renderResults(items, rawQuery) {
  const ranked = items
    .map(item => ({ item, score: score(item, rawQuery) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, 8)
    .map(result => result.item);

  if (!ranked.length) return hideResults();
  count.textContent = `${ranked.length} match${ranked.length === 1 ? '' : 'es'}`;
  list.innerHTML = ranked.map((item, index) => `
    <a class="app-search-result" href="${item.href}" ${index === 0 ? 'data-top-result="true"' : ''}>
      <span class="app-search-icon" aria-hidden="true">↗</span>
      <span><strong>${escapeHtml(item.title)}</strong>${item.description ? `<small>${escapeHtml(item.description)}</small>` : `<small>${escapeHtml(item.href)}</small>`}</span>
    </a>`).join('');
  panel.hidden = false;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function refresh() {
  const query = input.value.trim();
  if (!query || query.length < 2) return hideResults();
  renderResults(await searchIndexPromise, query);
}

input.addEventListener('input', refresh);
input.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !panel.hidden) {
    event.preventDefault();
    hideResults();
    return;
  }
  if (event.key === 'ArrowDown' && !panel.hidden) {
    event.preventDefault();
    list.querySelector('a')?.focus();
  }
});

list.addEventListener('keydown', event => {
  const links = [...list.querySelectorAll('a')];
  const index = links.indexOf(document.activeElement);
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    links[(index + 1) % links.length]?.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (index <= 0) input.focus();
    else links[index - 1]?.focus();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    hideResults();
    input.focus();
  }
});

window.addEventListener('pageshow', refresh);
