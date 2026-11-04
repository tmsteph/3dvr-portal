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
    id: 'pool-portrait',
    title: 'Poolside portrait',
    mode: 'Water',
    collection: 'water',
    image: 'assets/pool-portrait.jpg',
    alt: '3DVR Girl smiling by a sunlit pool',
    copy: 'A new poolside frame: cream bikini, linen wrap, bougainvillea, and the 3DVR mark.'
  },
  {
    id: 'courtyard-warrior',
    title: 'Courtyard warrior',
    mode: 'Movement',
    collection: 'movement',
    image: 'assets/courtyard-warrior.jpg',
    alt: '3DVR Girl in a warrior pose in a sunlit courtyard',
    copy: 'The still behind the courtyard flow loop: cream linen, terracotta, and late sun.'
  },
  {
    id: 'meditation-courtyard',
    title: 'Lavender meditation',
    mode: 'Stillness',
    collection: 'stillness',
    image: 'assets/meditation-courtyard.jpg',
    alt: '3DVR Girl seated in meditation among lavender',
    copy: 'The still behind the breathing loop: lavender pots, linen, and a quiet courtyard.'
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
  },
  {
    id: 'garden-portrait-sfw',
    title: 'Garden portrait',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/garden-portrait-sfw.webp',
    alt: '3DVR Girl with a blonde bun and blue streaks smiling in a coastal garden',
    copy: 'A fresh portrait in the current look: freckles, turquoise, cream linen, and golden light.'
  },
  {
    id: 'forest-spirit',
    title: 'Forest spirit',
    mode: 'Forest',
    collection: 'forest',
    image: 'assets/forest-spirit.webp',
    alt: '3DVR Girl in a blue linen top wearing a crown of small antlers and blue flowers in a sunlit forest',
    copy: 'A wilder portrait: antlers, forget-me-nots, and forest light. The spirit of the woods chapter.'
  },
  {
    id: 'beach-cafe',
    title: 'Beach cafe',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/beach-cafe.webp',
    alt: '3DVR Girl laughing in a pale blue sundress at a beach cafe, blonde bun with blue streaks and a turquoise bracelet, the ocean behind her',
    copy: 'Beach day, off duty: lemonade, sea air, and the laugh that starts most of her trouble.'
  },
  {
    id: 'kayla-poolside',
    title: 'Poolside field guide',
    mode: 'Water',
    collection: 'water',
    image: 'assets/kayla-poolside.webp',
    alt: 'Kayla with wet dark hair in a green sundress and a cream field-guide cover-up, smiling beside a sunlit pool',
    copy: 'Kayla between swims: green sundress, compass rose cover-up, and nowhere else to be.'
  },
  {
    id: 'portrait-garden-golden',
    title: 'Golden hour garden',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/portrait-blonde-garden-golden-hour.webp',
    alt: '3DVR Girl with a blonde bun and blue streaks in a cream linen shirt, smiling in a coastal garden at golden hour',
    copy: 'A close portrait in the current look: blue streaks, freckles, turquoise beads, and the sea behind the garden.'
  },
  {
    id: 'portrait-courtyard-blue-hour',
    title: 'Blue hour laugh',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/portrait-blonde-courtyard-blue-hour.webp',
    alt: '3DVR Girl laughing in a terracotta courtyard at blue hour, holding a small potted jasmine plant, blonde bun with blue streaks',
    copy: 'Blue hour in the courtyard: string lights, terracotta, and a jasmine seedling getting more attention than the sunset.'
  },
  {
    id: 'portrait-cliff-gate',
    title: 'The brass key',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/portrait-asian-cliff-gate.webp',
    alt: 'The Asian 3DVR Girl with long black hair in cream linen with teal trim, holding a brass key under a jasmine covered stone arch above the sea',
    copy: 'A gate at the edge of the cliffs, jasmine overhead, and a brass key that clearly belongs to a door somewhere.'
  },
  {
    id: 'portrait-asian-cliff-path',
    title: 'Cliff path, looking back',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/portrait-asian-cliff-path.webp',
    alt: 'The Asian 3DVR Girl with long black hair in cream linen, turning back to smile on a cliff path above the sea',
    copy: 'The cliff path at golden hour: wind in her hair, the garden below, and the whole coastline to herself.'
  },
  {
    id: 'portrait-kayla-trail',
    title: 'Trail portrait',
    mode: 'Forest',
    collection: 'forest',
    image: 'assets/portrait-kayla-trail.webp',
    alt: 'Kayla with long dark hair in field gear with a compass on her pack straps, standing on a forest trail',
    copy: 'The field guide at rest: compass on her straps, plaid and canvas, and the trail waiting behind her.'
  },
  {
    id: 'portrait-kayla-lantern',
    title: 'Lantern trail',
    mode: 'Forest',
    collection: 'forest',
    image: 'assets/portrait-kayla-lantern-trail.webp',
    alt: 'Kayla with dark braided hair in a leather field vest, holding a lit lantern on a forest trail at dusk, turquoise stones lining the path',
    copy: 'Dusk patrol: a lit lantern, a compass at her chest, and turquoise stones marking the way through the trees.'
  },
  {
    id: 'portrait-kayla-marker',
    title: 'Trail marker',
    mode: 'Forest',
    collection: 'forest',
    image: 'assets/portrait-kayla-trail-marker.webp',
    alt: 'Kayla with long dark hair in field gear, kneeling beside a carved trail marker in the forest',
    copy: 'Reading the old marks: Kayla checks a carved trail marker the way other people check a map.'
  },
  {
    id: 'portrait-garden-lavender',
    title: 'Lavender and cliffs',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/portrait-garden-muse-lavender-cliffs.webp',
    alt: 'The garden muse with wavy chestnut hair and freckles in cream linen, smiling among lavender with jasmine and coastal cliffs behind her',
    copy: 'The garden muse in her element: lavender, jasmine, woven gold, and golden light over the water.'
  },
  {
    id: 'portrait-garden-hammock',
    title: 'The copper key',
    mode: 'Stillness',
    collection: 'stillness',
    image: 'assets/portrait-garden-muse-hammock.webp',
    alt: 'The garden muse with wavy chestnut hair resting in a rope hammock above coastal cliffs, holding a copper key',
    copy: 'Off duty in the hammock, copper key in hand, with nowhere she would rather be.'
  },
  {
    id: 'portrait-muse-studio',
    title: 'Studio Muse',
    mode: 'Stillness',
    collection: 'stillness',
    image: 'assets/portrait-muse-studio.webp',
    alt: 'Muse with dark hair and purple streaks in messy buns, wearing an oversized black hoodie among canvases and paint tubes in her art studio',
    copy: 'Muse in her studio: purple streaks, an oversized hoodie, and a wall of half finished weather.'
  },
  {
    id: 'portrait-muse-dusk',
    title: 'Dusk sketchbook',
    mode: 'Stillness',
    collection: 'stillness',
    image: 'assets/portrait-muse-dusk-sketch.webp',
    alt: 'Muse with dark hair and purple streaks in messy buns and an oversized dark top, sketching in the garden at dusk',
    copy: 'Dusk in the garden: Muse mid sketch, halfway between the day she had and the one she is drawing.'
  },
  {
    id: 'portrait-crew-picnic',
    title: 'The Whole Crew, Garden Picnic',
    mode: 'Sun',
    collection: 'sun',
    image: 'assets/portrait-crew-garden-picnic.webp',
    alt: 'All five of the crew, the Asian 3DVR Girl, the blonde 3DVR Girl, Kayla, the garden muse, and Muse, laughing over a picnic blanket in a coastal garden above the ocean cliffs',
    copy: 'Everyone in one frame: the whole crew on one picnic blanket, laughing above the cliffs at golden hour.'
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
  if (window.PortalViewer) {
    const visible = scenes.filter(item => {
      const card = archiveGrid?.querySelector(`[data-scene-id="${item.id}"]`);
      return !card || !card.hidden;
    });
    const list = visible.length ? visible : scenes;
    window.PortalViewer.open(list.map(item => ({
      src: item.image,
      alt: item.alt,
      label: `${item.mode} \u00b7 ${item.title}`,
      copy: item.copy
    })), Math.max(0, list.indexOf(scene)));
    return;
  }
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

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (reduceMotion.matches) {
  document.querySelectorAll('video[autoplay]').forEach(video => {
    video.removeAttribute('autoplay');
    video.pause();
  });
}

const carousel = document.querySelector('#castCarousel');
const carouselSlides = carousel ? [...carousel.querySelectorAll('.carousel__slide')] : [];
const carouselDots = document.querySelector('#carouselDots');
const carouselPrev = document.querySelector('#carouselPrev');
const carouselNext = document.querySelector('#carouselNext');
let carouselIndex = 0;
let carouselTimer = null;

function showSlide(index) {
  if (!carouselSlides.length) return;
  carouselIndex = (index + carouselSlides.length) % carouselSlides.length;
  carouselSlides.forEach((slide, slideIndex) => {
    slide.classList.toggle('is-active', slideIndex === carouselIndex);
  });
  carouselDots?.querySelectorAll('.carousel__dot').forEach((dot, dotIndex) => {
    dot.classList.toggle('is-active', dotIndex === carouselIndex);
    dot.setAttribute('aria-pressed', String(dotIndex === carouselIndex));
  });
}

function startCarousel() {
  if (reduceMotion.matches || carouselSlides.length < 2 || carouselTimer) return;
  carouselTimer = window.setInterval(() => showSlide(carouselIndex + 1), 4500);
}

function stopCarousel() {
  if (!carouselTimer) return;
  window.clearInterval(carouselTimer);
  carouselTimer = null;
}

if (carousel && carouselSlides.length) {
  carouselSlides.forEach((slide, slideIndex) => {
    const dot = document.createElement('button');
    dot.className = 'carousel__dot';
    dot.type = 'button';
    dot.dataset.slideIndex = String(slideIndex);
    dot.setAttribute('aria-label', `Show photo ${slideIndex + 1}`);
    dot.setAttribute('aria-pressed', String(slideIndex === 0));
    dot.addEventListener('click', () => showSlide(slideIndex));
    carouselDots?.append(dot);
  });
  carouselPrev?.addEventListener('click', () => showSlide(carouselIndex - 1));
  carouselNext?.addEventListener('click', () => showSlide(carouselIndex + 1));
  carousel.addEventListener('pointerenter', stopCarousel);
  carousel.addEventListener('pointerleave', startCarousel);
  carousel.addEventListener('focusin', stopCarousel);
  carousel.addEventListener('focusout', startCarousel);
  showSlide(0);
  startCarousel();
}
