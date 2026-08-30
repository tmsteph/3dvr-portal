const scenes = [
  {
    id: 'woods-duo',
    title: 'Root Network',
    mode: 'Forest',
    collection: 'forest',
    image: 'assets/3dvr-girl-kala-forest.webp',
    alt: '3DVR Girl and Kala standing together on a wooded trail',
    copy: 'The first Woods Chapter frame: 3DVR Girl meets Kala beyond the last mapped node.'
  },
  {
    id: 'festival-dance',
    title: 'Festival pulse',
    mode: 'Movement',
    collection: 'movement',
    image: 'assets/festival-dance.jpg',
    alt: '3DVR Girl dancing at an outdoor festival',
    copy: 'Warm crowd energy, motion, music, and the less-polished side of the 3DVR world.'
  },
  {
    id: 'warrior-flow',
    title: 'Warrior flow',
    mode: 'Movement',
    collection: 'movement',
    image: 'assets/warrior-flow.jpg',
    alt: '3DVR Girl holding a wide warrior stance',
    copy: 'A grounded movement frame built around balance, focus, and physical presence.'
  },
  {
    id: 'wide-flow',
    title: 'Open stance',
    mode: 'Movement',
    collection: 'movement',
    image: 'assets/wide-flow.jpg',
    alt: '3DVR Girl holding a wide movement pose',
    copy: 'A wider posture that gives the character space to feel active rather than posed.'
  },
  {
    id: 'downward-flow',
    title: 'Grounded arc',
    mode: 'Movement',
    collection: 'movement',
    image: 'assets/downward-flow.jpg',
    alt: '3DVR Girl in a downward stretch',
    copy: 'Recovery, breath, and nervous-system reset before the next jump.'
  },
  {
    id: 'pool-welcome',
    title: 'Waterline',
    mode: 'Water',
    collection: 'water',
    image: 'assets/pool-welcome.png',
    alt: '3DVR Girl smiling from a sunlit pool',
    copy: 'Bright water and bougainvillea: a simple summer reset with almost no interface at all.'
  },
  {
    id: 'pool-stand',
    title: 'Sunlit reset',
    mode: 'Water',
    collection: 'water',
    image: 'assets/pool-stand.png',
    alt: '3DVR Girl standing in a blue swimming pool',
    copy: 'A clean open-water frame for the restorative side of the character.'
  },
  {
    id: 'pool-signal',
    title: 'Pool signal',
    mode: 'Water',
    collection: 'water',
    image: 'assets/pool-signal.jpg',
    alt: '3DVR Girl in a bright pool scene',
    copy: 'A lighter lifestyle frame where the 3DVR signal stays in the background.'
  },
  {
    id: 'meditation-seat',
    title: 'Meditation seat',
    mode: 'Stillness',
    collection: 'stillness',
    image: 'assets/meditation-seat.png',
    alt: '3DVR Girl seated in meditation',
    copy: 'Quiet body, quiet interface. The portal can wait.'
  },
  {
    id: 'courtyard-meditation',
    title: 'Courtyard calm',
    mode: 'Stillness',
    collection: 'stillness',
    image: 'assets/courtyard-meditation.jpg',
    alt: '3DVR Girl sitting cross-legged in a courtyard',
    copy: 'A softer courtyard frame for breathwork, reflection, and daily ritual.'
  },
  {
    id: 'tree-prayer',
    title: 'Prayer balance',
    mode: 'Stillness',
    collection: 'stillness',
    image: 'assets/tree-prayer.jpg',
    alt: '3DVR Girl balancing in tree pose with hands in prayer',
    copy: 'Balance as a practice instead of a dashboard metric.'
  },
  {
    id: 'balance-tree',
    title: 'Balance protocol',
    mode: 'Stillness',
    collection: 'stillness',
    image: 'assets/balance-tree.jpg',
    alt: '3DVR Girl balancing in a sunny courtyard',
    copy: 'Warm natural light and a ritual posture for slower moments.'
  },
  {
    id: 'courtyard-profile',
    title: 'Courtyard profile',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/courtyard-profile.jpg',
    alt: '3DVR Girl standing in profile in a sunlit courtyard',
    copy: 'Simple architecture, natural light, and the recognizable blue-accented silhouette.'
  },
  {
    id: 'courtyard-stand',
    title: 'Soft launch',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/courtyard-stand.jpg',
    alt: '3DVR Girl standing in a warm courtyard',
    copy: 'A full-body lifestyle frame with almost nothing competing for attention.'
  },
  {
    id: 'sunlit-crouch',
    title: 'Low sun signal',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/sunlit-crouch.jpg',
    alt: '3DVR Girl crouching in warm courtyard light',
    copy: 'Relaxed, playful, and intentionally less like a polished tech ad.'
  },
  {
    id: 'sunlit-curve',
    title: 'Golden-hour line',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/sunlit-curve.jpg',
    alt: '3DVR Girl in warm sunlit shadows',
    copy: 'A motion portrait built from shadow, shape, and late-day warmth.'
  },
  {
    id: 'over-shoulder',
    title: 'Afterimage',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/over-shoulder.jpg',
    alt: '3DVR Girl looking back over her shoulder',
    copy: 'A quieter transition frame for memory, mystery, and leaving one scene for another.'
  },
  {
    id: 'portal-arrival',
    title: 'Portal arrival',
    mode: 'Portal',
    collection: 'portal',
    image: 'assets/portal-arrival.png',
    alt: '3DVR Girl standing inside a blue portal ring',
    copy: 'The overtly futuristic mode — useful when the story really needs the portal to be visible.'
  },
  {
    id: 'blue-portal-stance',
    title: 'Blue portal stance',
    mode: 'Portal',
    collection: 'portal',
    image: 'assets/blue-portal-stance.jpg',
    alt: '3DVR Girl standing in a bright blue portal',
    copy: 'The highest-tech frame in the archive, kept as a contrast to the more grounded scenes.'
  }
];

const filters = [
  ['all', 'All'],
  ['forest', 'Forest'],
  ['sun', 'Sun'],
  ['water', 'Water'],
  ['movement', 'Movement'],
  ['stillness', 'Stillness'],
  ['portal', 'Portal']
];

const archiveGrid = document.querySelector('#archiveGrid');
const sceneFilters = document.querySelector('#sceneFilters');
const sceneDialog = document.querySelector('#sceneDialog');
const dialogClose = document.querySelector('#dialogClose');
const dialogImage = document.querySelector('#dialogImage');
const dialogMode = document.querySelector('#dialogMode');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogCopy = document.querySelector('#dialogCopy');

function createArchiveCard(scene) {
  const button = document.createElement('button');
  button.className = 'archive-card';
  button.type = 'button';
  button.dataset.collection = scene.collection;
  button.dataset.sceneId = scene.id;
  button.setAttribute('aria-label', `Open ${scene.title}`);

  const image = document.createElement('img');
  image.src = scene.image;
  image.alt = scene.alt;
  image.loading = 'lazy';

  const caption = document.createElement('span');
  caption.className = 'archive-card__caption';

  const mode = document.createElement('span');
  mode.textContent = scene.mode;

  const title = document.createElement('strong');
  title.textContent = scene.title;

  caption.append(mode, title);
  button.append(image, caption);
  button.addEventListener('click', () => openScene(scene));
  return button;
}

function openScene(scene) {
  if (!sceneDialog || !dialogImage) return;
  dialogImage.src = scene.image;
  dialogImage.alt = scene.alt;
  dialogMode.textContent = scene.mode;
  dialogTitle.textContent = scene.title;
  dialogCopy.textContent = scene.copy;
  sceneDialog.showModal();
}

function setFilter(collection) {
  document.querySelectorAll('.filter-button').forEach(button => {
    const active = button.dataset.collection === collection;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  document.querySelectorAll('.archive-card').forEach(card => {
    card.hidden = collection !== 'all' && card.dataset.collection !== collection;
  });
}

if (archiveGrid) {
  scenes.forEach(scene => archiveGrid.append(createArchiveCard(scene)));
}

if (sceneFilters) {
  filters.forEach(([id, label]) => {
    const button = document.createElement('button');
    button.className = 'filter-button';
    button.type = 'button';
    button.dataset.collection = id;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = label;
    button.addEventListener('click', () => setFilter(id));
    sceneFilters.append(button);
  });
  setFilter('all');
}

dialogClose?.addEventListener('click', () => sceneDialog?.close());
sceneDialog?.addEventListener('click', event => {
  if (event.target === sceneDialog) sceneDialog.close();
});
