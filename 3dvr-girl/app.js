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
    })), Math.max(0, list.indexOf(scene)), 'archive');
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

/* The scene archive reveals itself as you scroll: the filter picks
   the set, only the first chunk of it is in view (and loading) up
   front, and the next chunk renders on its own as the bottom of the
   grid approaches — no button to click. Scoped to the archive grid
   so the workshop cards in the machine section are never caught
   by it. */
const ARCHIVE_PAGE = 12;
let archiveFilter = 'all';
let archiveShown = ARCHIVE_PAGE;
let archiveSentinel = null;
/* Without IntersectionObserver there is no scroll trigger, so the
   archive simply shows everything the filter selects. */
const archiveRevealAll = !('IntersectionObserver' in window);
let revealArchiveChunks = () => {};

function archiveCards() {
  return archiveGrid ? [...archiveGrid.querySelectorAll('.archive-card')] : [];
}

function applyArchiveVisibility() {
  let seen = 0;
  let total = 0;
  const cards = archiveCards();
  cards.forEach(card => {
    const matches = archiveFilter === 'all' || card.dataset.collection === archiveFilter;
    if (!matches) {
      card.hidden = true;
      return;
    }
    total += 1;
    card.hidden = !archiveRevealAll && seen >= archiveShown;
    seen += 1;
  });
  if (archiveSentinel) archiveSentinel.hidden = archiveRevealAll || total <= archiveShown;
}

function setFilter(collection) {
  sceneFilters?.querySelectorAll('.filter-button').forEach(button => {
    const active = button.dataset.collection === collection;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  archiveFilter = collection;
  archiveShown = ARCHIVE_PAGE;
  applyArchiveVisibility();
  revealArchiveChunks();
}

if (archiveGrid) {
  scenes.forEach(scene => archiveGrid.append(createArchiveCard(scene)));
  archiveSentinel = document.createElement('div');
  archiveSentinel.className = 'scroll-sentinel';
  archiveSentinel.hidden = true;
  archiveSentinel.setAttribute('aria-hidden', 'true');
  archiveGrid.after(archiveSentinel);
  if (!archiveRevealAll) {
    /* Reveal the next chunk whenever the grid's end is near the
       viewport or already past it, so continuous scrolling and
       jumps to the bottom both keep the scenes coming. */
    revealArchiveChunks = () => {
      if (archiveSentinel.hidden || !archiveSentinel.getClientRects().length) return;
      const rect = archiveSentinel.getBoundingClientRect();
      if (rect.top > window.innerHeight + 900) return;
      archiveShown += ARCHIVE_PAGE;
      applyArchiveVisibility();
      revealArchiveChunks();
    };
    const archiveObserver = new IntersectionObserver(() => revealArchiveChunks(), { rootMargin: '900px 0px' });
    archiveObserver.observe(archiveSentinel);
    /* Scrolls can come from the window or from the HUD stage panel;
       a capturing document listener hears both. */
    document.addEventListener('scroll', revealArchiveChunks, { passive: true, capture: true });
  }
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

/* ---------- Golden hour: the in-between shelf. Sexier than the scene
   archive, dressed enough for daylight, and fully public: no lock, no
   blur. Photos open in the shared viewer; the clips ride the same
   living-card handling as the cast videos further down the page. The
   shelf reveals itself as you scroll, like the archive above it. --- */
const goldenHour = [
  {
    kind: 'photo',
    id: 'gh-pool-duo',
    title: 'Pool rules',
    mode: 'Water',
    image: 'assets/golden-hour/duo-pool-swimsuits.webp',
    alt: '3DVR Girl in a turquoise cutout swimsuit and Kayla in a black bikini laughing beside a sunlit pool',
    copy: 'Turquoise cutouts, black bikini, and no plans until the light goes.'
  },
  {
    kind: 'photo',
    id: 'gh-yoga-linen',
    title: 'Linen practice',
    mode: 'Movement',
    image: 'assets/golden-hour/duo-yoga-linen.webp',
    alt: 'Kayla and Muse in linen two-piece workout sets stretching on mats in a garden',
    copy: 'Kayla and Muse take the practice outside: linen sets, bare feet, and mats on the grass.'
  },
  {
    kind: 'photo',
    id: 'gh-courtyard-trio',
    title: 'Courtyard lemonade',
    mode: 'Sun',
    image: 'assets/golden-hour/trio-linen-sundresses.webp',
    alt: '3DVR Girl, the garden muse, and the Explorer in linen sundresses laughing in a sunny courtyard',
    copy: 'Three sundresses and a round of lemonade: golden hour in the courtyard.'
  },
  {
    kind: 'photo',
    id: 'gh-beach-duo',
    title: 'Shoreline hour',
    mode: 'Sun',
    image: 'assets/golden-hour/duo-beach-dresses.webp',
    alt: 'Muse and the Explorer in summer dresses walking a beach at golden hour',
    copy: 'Muse and the Explorer walk the shoreline while the light does the work.'
  },
  {
    kind: 'photo',
    id: 'gh-lavender-solo',
    title: 'Lavender twirl',
    mode: 'Sun',
    image: 'assets/golden-hour/solo-lavender-dress.webp',
    alt: '3DVR Girl twirling in a white linen sundress in a lavender field at golden hour',
    copy: 'A white linen sundress, a lavender field, and one good spin.'
  },
  {
    kind: 'photo',
    id: 'gh-festival-trio',
    title: 'Festival dusk',
    mode: 'Festival',
    image: 'assets/golden-hour/trio-festival-dusk.webp',
    alt: '3DVR Girl, Kayla, and Muse with flower crowns and crochet tops at an outdoor festival at dusk, arms around each other laughing',
    copy: 'Flower crowns, crochet tops, and the stage lighting up: the set starts at dusk.'
  },
  {
    kind: 'photo',
    id: 'gh-festival-duo',
    title: 'Glitter hour',
    mode: 'Festival',
    image: 'assets/golden-hour/duo-festival-golden.webp',
    alt: 'The garden muse and the Explorer laughing at an outdoor festival at golden hour, flower crowns and glitter on their cheeks',
    copy: 'Glitter on their cheeks and the light going gold over the festival flags.'
  },
  {
    kind: 'photo',
    id: 'gh-festival-solo',
    title: 'Festival spin',
    mode: 'Festival',
    image: 'assets/golden-hour/solo-festival-dress.webp',
    alt: '3DVR Girl twirling in a flowing embroidered festival dress, flower crown on, fairy lights glowing behind her at dusk',
    copy: 'Hair out, skirt out: she spins while the fairy lights come on.'
  },
  {
    kind: 'photo',
    id: 'gh-lollipop-3dvr',
    title: 'Candy hour',
    mode: 'Festival',
    image: 'assets/golden-hour/lollipop-3dvr-girl.webp',
    alt: '3DVR Girl with long blonde hair in a pale blue top, holding a pink and blue swirled lollipop at her lips at a harbor festival',
    copy: 'Pink and blue swirl at the harbor stalls: she picked the biggest one they had.'
  },
  {
    kind: 'photo',
    id: 'gh-lollipop-kayla',
    title: 'Trail candy',
    mode: 'Festival',
    image: 'assets/golden-hour/lollipop-kayla.webp',
    alt: 'Kayla with long dark wavy hair and freckles in a green embroidered dress, a red and white swirled lollipop in her mouth at an outdoor festival',
    copy: 'Red and white swirl, festival dust on the path, and no intention of sharing.'
  },
  {
    kind: 'photo',
    id: 'gh-lollipop-muse',
    title: 'Pastel study',
    mode: 'Sun',
    image: 'assets/golden-hour/lollipop-muse.webp',
    alt: 'Muse with dark hair and purple highlights in a white blouse, tasting a pastel rainbow swirled lollipop above the coastal cliffs',
    copy: 'A pastel rainbow over the cliffs: research, she insists, for a painting.'
  },
  {
    kind: 'photo',
    id: 'gh-lollipop-garden',
    title: 'Lavender violet',
    mode: 'Sun',
    image: 'assets/golden-hour/lollipop-garden.webp',
    alt: 'The garden muse with long auburn hair and freckles in a cream linen top, a violet lollipop in her mouth among lavender rows',
    copy: 'Violet on violet: she matched her candy to the lavender again.'
  },
  {
    kind: 'photo',
    id: 'gh-lollipop-explorer',
    title: 'Cove candy',
    mode: 'Sun',
    image: 'assets/golden-hour/lollipop-explorer.webp',
    alt: 'The Explorer with long black hair in a khaki field shirt, grinning with an orange and pink swirled lollipop between her teeth above a coastal cove',
    copy: 'An orange swirl held in her grin at the cove: provisions for the climb back.'
  },
  {
    kind: 'video',
    id: 'gh-pool-video',
    title: 'Pool rules, in motion',
    video: 'assets/golden-hour/video-pool-duo.mp4',
    poster: 'assets/golden-hour/duo-pool-swimsuits.webp',
    alt: '3DVR Girl and Kayla laughing and splashing at the pool'
  },
  {
    kind: 'video',
    id: 'gh-courtyard-video',
    title: 'Courtyard lemonade, in motion',
    video: 'assets/golden-hour/video-sundress-trio.mp4',
    poster: 'assets/golden-hour/trio-linen-sundresses.webp',
    alt: '3DVR Girl, the garden muse, and the Explorer laughing together in a sunny courtyard'
  },
  {
    kind: 'photo',
    id: 'gh-beach-3dvr',
    title: 'Golden waterline',
    mode: 'Water',
    image: 'assets/golden-hour/beach-3dvr-girl.webp',
    alt: '3DVR Girl with blonde hair and blue streaks in a navy swimsuit and cream sarong, smiling at the waterline as the sun sets',
    copy: 'Navy suit, cream sarong, and the whole shoreline going gold behind her.'
  },
  {
    kind: 'photo',
    id: 'gh-gown-kayla',
    title: 'Gala green',
    mode: 'Festival',
    image: 'assets/golden-hour/gown-kayla.webp',
    alt: 'Kayla with long dark wavy hair in a deep green satin gown with leaf embroidery, smiling at a beachside gala under string lights',
    copy: 'Deep green satin and string lights: the gala ran long and she did not mind.'
  },
  {
    kind: 'photo',
    id: 'gh-cliffs-garden',
    title: 'Lavender coast',
    mode: 'Sun',
    image: 'assets/golden-hour/cliffs-garden.webp',
    alt: 'The garden muse with long auburn hair and freckles in a lavender floral sundress, her skirt lifting in the breeze on coastal cliffs above the sea',
    copy: 'Lavender in front of her, lavender on her dress, and the sea doing the rest.'
  },
  {
    kind: 'photo',
    id: 'gh-gown-muse',
    title: 'Gallery midnight',
    mode: 'Festival',
    image: 'assets/golden-hour/gown-muse.webp',
    alt: 'Muse with dark hair and purple highlights in a navy satin dress, holding a champagne flute and smiling over her shoulder on a gallery terrace above the beach',
    copy: 'A glass in hand and the gallery behind her: she came for the art and stayed for the view.'
  },
  {
    kind: 'photo',
    id: 'gh-food-burrito-3dvr',
    title: 'San Diego rules',
    mode: 'Sun',
    image: 'assets/golden-hour/food-burrito-3dvr.webp',
    alt: '3DVR Girl with blonde hair and blue streaks laughing as she holds a huge foil wrapped burrito at a San Diego beach taco stand',
    copy: 'Beans, rice, and guacamole at the beach stand: she ordered the big one and has no regrets.'
  },
  {
    kind: 'photo',
    id: 'gh-food-sandwich-kayla',
    title: 'Trail lunch, her scale',
    mode: 'Field',
    image: 'assets/golden-hour/food-sandwich-kayla.webp',
    alt: 'Kayla with long dark wavy hair taking a huge bite of a tall stacked sandwich on a picnic blanket with mountains behind her',
    copy: 'The sandwich needed both hands and a strategy. The mountains approved.'
  },
  {
    kind: 'photo',
    id: 'gh-food-pizza-garden',
    title: 'The cheese pull',
    mode: 'Sun',
    image: 'assets/golden-hour/food-pizza-garden.webp',
    alt: 'The garden muse with long auburn hair lifting a margherita pizza slice with a long cheese pull at a garden table at golden hour',
    copy: 'She lifted one slice and the cheese made its position clear.'
  },
  {
    kind: 'photo',
    id: 'gh-food-burrito-explorer',
    title: 'Harbor bites',
    mode: 'Sun',
    image: 'assets/golden-hour/food-burrito-explorer.webp',
    alt: 'The Explorer with long black hair taking a wide eyed bite of a big burrito at a harbor food stand with boats behind her',
    copy: 'First bite at the harbor stand: the burrito was bigger than the plan.'
  },
  {
    kind: 'video',
    id: 'gh-beach-video-explorer',
    title: 'Shoreline, in motion',
    video: 'assets/golden-hour/video-beach-explorer.mp4',
    poster: 'assets/golden-hour/video-beach-explorer-poster.webp',
    alt: 'The Explorer walking the shoreline at golden hour in a swimsuit and light cover-up, laughing in the sea breeze'
  },
  {
    kind: 'video',
    id: 'gh-gown-video-3dvr',
    title: 'Red arrival, in motion',
    video: 'assets/golden-hour/video-gown-3dvr.mp4',
    poster: 'assets/golden-hour/video-gown-3dvr-poster.webp',
    alt: '3DVR Girl arriving at an evening gala in a red dress, turning to smile at the camera'
  },
  {
    kind: 'photo',
    id: 'gh-beach-sunset-3dvr',
    title: 'Teal waterline',
    mode: 'Water',
    image: 'assets/golden-hour/beach-sunset-3dvr-girl.webp',
    alt: '3DVR Girl with wet blonde hair in a teal bikini, laughing over her shoulder at the beach as the sun sets',
    copy: 'Teal bikini, wet hair, and the sun dropping behind the water: she is in no hurry to get out.'
  },
  {
    kind: 'photo',
    id: 'gh-balcony-kayla',
    title: 'Balcony black',
    mode: 'Festival',
    image: 'assets/golden-hour/balcony-kayla.webp',
    alt: 'Kayla with long dark wavy hair in a black satin evening dress with a high slit, leaning on a balcony rail above the city lights at dusk',
    copy: 'Black satin, a high rail, and the whole city lit up below: the evening is hers.'
  },
  {
    kind: 'photo',
    id: 'gh-pool-muse',
    title: 'Pool dusk laugh',
    mode: 'Water',
    image: 'assets/golden-hour/pool-muse.webp',
    alt: 'Muse with dark hair and purple highlights in a deep purple one-piece swimsuit, sitting on the edge of a pool with her feet in the water, laughing',
    copy: 'Feet in the water and laughing at the sky: dusk at the pool is her studio break.'
  },
  {
    kind: 'photo',
    id: 'gh-waterfall-explorer',
    title: 'Waterfall splash',
    mode: 'Water',
    image: 'assets/golden-hour/waterfall-explorer.webp',
    alt: 'The Explorer with long black hair in a light linen sundress, standing in a stream below a waterfall and splashing water toward the camera',
    copy: 'Linen dress, cold stream, and one good splash for the camera: the falls were worth the hike.'
  }
];

const goldenHourGrid = document.querySelector('#goldenHourGrid');
const GOLDEN_HOUR_PAGE = 6;
let goldenHourShown = GOLDEN_HOUR_PAGE;
let goldenHourSentinel = null;
const goldenHourRevealAll = !('IntersectionObserver' in window);

function createGoldenHourCard(item) {
  if (item.kind === 'video') {
    const card = document.createElement('article');
    card.className = 'living-card';
    card.dataset.goldenId = item.id;
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.poster = item.poster;
    video.setAttribute('aria-label', item.alt);
    const source = document.createElement('source');
    source.src = item.video;
    source.type = 'video/mp4';
    video.append(source);
    const caption = document.createElement('span');
    caption.className = 'living-card__caption';
    const shelf = document.createElement('span');
    shelf.textContent = 'Golden hour';
    const title = document.createElement('strong');
    title.textContent = item.title;
    caption.append(shelf, title);
    card.append(video, caption);
    return card;
  }
  const button = document.createElement('button');
  button.className = 'archive-card';
  button.type = 'button';
  button.dataset.goldenId = item.id;
  button.setAttribute('aria-label', `Open ${item.title}`);
  const image = document.createElement('img');
  image.src = item.image;
  image.alt = item.alt;
  image.loading = 'lazy';
  const caption = document.createElement('span');
  caption.className = 'archive-card__caption';
  const mode = document.createElement('span');
  mode.textContent = item.mode;
  const title = document.createElement('strong');
  title.textContent = item.title;
  caption.append(mode, title);
  button.append(image, caption);
  button.addEventListener('click', () => openGoldenHour(item));
  return button;
}

function openGoldenHour(item) {
  if (!window.PortalViewer) return;
  const photos = goldenHour.filter(entry => entry.kind === 'photo');
  const visible = photos.filter(entry => {
    const card = goldenHourGrid?.querySelector(`[data-golden-id="${entry.id}"]`);
    return !card || !card.hidden;
  });
  const list = visible.length ? visible : photos;
  window.PortalViewer.open(list.map(entry => ({
    src: entry.image,
    alt: entry.alt,
    label: `Golden hour \u00b7 ${entry.title}`,
    copy: entry.copy
  })), Math.max(0, list.indexOf(item)), 'goldenhour');
}

/* The viewer's section bar and search (viewer.js, driven from
   gallery.js) browse the whole catalogue, not just the chunk a
   grid has revealed so far: publish both shelves in viewer shape. */
window.LadiesGalleryData = {
  archive: scenes.map(item => ({
    src: item.image,
    alt: item.alt,
    label: `${item.mode} \u00b7 ${item.title}`,
    copy: item.copy
  })),
  goldenHour: goldenHour.filter(entry => entry.kind === 'photo').map(entry => ({
    src: entry.image,
    alt: entry.alt,
    label: `Golden hour \u00b7 ${entry.title}`,
    copy: entry.copy
  }))
};

function applyGoldenHourVisibility() {
  if (!goldenHourGrid) return;
  const cards = [...goldenHourGrid.children];
  cards.forEach((card, i) => { card.hidden = !goldenHourRevealAll && i >= goldenHourShown; });
  if (goldenHourSentinel) {
    goldenHourSentinel.hidden = goldenHourRevealAll || cards.length <= goldenHourShown;
  }
}

if (goldenHourGrid) {
  goldenHour.forEach(item => goldenHourGrid.append(createGoldenHourCard(item)));
  goldenHourSentinel = document.createElement('div');
  goldenHourSentinel.className = 'scroll-sentinel';
  goldenHourSentinel.hidden = true;
  goldenHourSentinel.setAttribute('aria-hidden', 'true');
  goldenHourGrid.after(goldenHourSentinel);
  if (!goldenHourRevealAll) {
    const revealGoldenHourChunks = () => {
      if (goldenHourSentinel.hidden || !goldenHourSentinel.getClientRects().length) return;
      const rect = goldenHourSentinel.getBoundingClientRect();
      if (rect.top > window.innerHeight + 900) return;
      goldenHourShown += GOLDEN_HOUR_PAGE;
      applyGoldenHourVisibility();
      revealGoldenHourChunks();
    };
    const goldenHourObserver = new IntersectionObserver(() => revealGoldenHourChunks(), { rootMargin: '900px 0px' });
    goldenHourObserver.observe(goldenHourSentinel);
    document.addEventListener('scroll', revealGoldenHourChunks, { passive: true, capture: true });
  }
  applyGoldenHourVisibility();
}

/* ---------- Dance videos: the golden hour shelf, in motion. Twenty-two
   short clips shot across one long evening: the festival, the garden
   party, the beach in linen, and the meadow at sunset. Martha (staff,
   not cast) dances in several; Thomas joins the meadow set. Same
   living-card handling as the shelf above; the clips keep their own
   music and voices. ----------------------------------------------- */
const danceVideos = [
  {
    kind: 'video',
    id: 'gh-dance-martha-3dvr-festival',
    title: 'Festival gold, with Martha',
    video: 'assets/golden-hour/dance-martha-3dvr-festival.mp4',
    poster: 'assets/golden-hour/dance-martha-3dvr-festival-poster.webp',
    alt: 'Martha in her black dress with red embroidery dancing with 3DVR Girl, blonde with blue streaks in a bright festival dress, at golden hour'
  },
  {
    kind: 'video',
    id: 'gh-dance-martha-kayla-garden',
    title: 'Garden party, with Martha',
    video: 'assets/golden-hour/dance-martha-kayla-garden.mp4',
    poster: 'assets/golden-hour/dance-martha-kayla-garden-poster.webp',
    alt: 'Martha dancing with Kayla, dark wavy hair in a sage sundress, at a garden party at dusk under lanterns'
  },
  {
    kind: 'video',
    id: 'gh-dance-crew-finale',
    title: 'The whole circle',
    video: 'assets/golden-hour/dance-crew-finale.mp4',
    poster: 'assets/golden-hour/dance-crew-finale-poster.webp',
    alt: 'Martha at the centre of a festival dance circle with 3DVR Girl, Muse, and the garden muse, flower crowns on, at dusk'
  },
  {
    kind: 'video',
    id: 'gh-dance-martha-muse-lights',
    title: 'String lights, with Martha',
    video: 'assets/golden-hour/dance-martha-muse-lights.mp4',
    poster: 'assets/golden-hour/dance-martha-muse-lights-poster.webp',
    alt: 'Martha dancing with Muse, dark hair with purple highlights, under string lights at dusk'
  },
  {
    kind: 'video',
    id: 'gh-dance-martha-garden-lavender',
    title: 'Lavender, with Martha',
    video: 'assets/golden-hour/dance-martha-garden-lavender.mp4',
    poster: 'assets/golden-hour/dance-martha-garden-lavender-poster.webp',
    alt: 'Martha dancing through a lavender garden with the garden muse in a sage linen dress'
  },
  {
    kind: 'video',
    id: 'gh-dance-martha-explorer-cliff',
    title: 'Cliff sunset, with Martha',
    video: 'assets/golden-hour/dance-martha-explorer-cliff.mp4',
    poster: 'assets/golden-hour/dance-martha-explorer-cliff-poster.webp',
    alt: 'Martha dancing with the Explorer in a festival outfit on a coastal cliff at sunset'
  },
  {
    kind: 'video',
    id: 'gh-dance-3dvr-solo',
    title: 'Come dance with me',
    video: 'assets/golden-hour/dance-3dvr-solo.mp4',
    poster: 'assets/golden-hour/dance-3dvr-solo-poster.webp',
    alt: '3DVR Girl speaking to the camera at a festival at golden hour: she says come dance with me'
  },
  {
    kind: 'video',
    id: 'gh-dance-kayla-solo',
    title: 'Stay a while',
    video: 'assets/golden-hour/dance-kayla-solo.mp4',
    poster: 'assets/golden-hour/dance-kayla-solo-poster.webp',
    alt: 'Kayla speaking and dancing at a garden party: she says the garden is beautiful tonight, stay a while'
  },
  {
    kind: 'video',
    id: 'gh-dance-muse-solo',
    title: 'I dreamed this dance',
    video: 'assets/golden-hour/dance-muse-solo.mp4',
    poster: 'assets/golden-hour/dance-muse-solo-poster.webp',
    alt: 'Muse speaking softly to the camera under string lights at dusk: she says she dreamed about this dance'
  },
  {
    kind: 'video',
    id: 'gh-dance-garden-explorer-cliff',
    title: 'Perfect sunset',
    video: 'assets/golden-hour/dance-garden-explorer-cliff.mp4',
    poster: 'assets/golden-hour/dance-garden-explorer-cliff-poster.webp',
    alt: 'The garden muse and the Explorer chatting and dancing on a coastal cliff at sunset'
  },
  {
    kind: 'video',
    id: 'gh-dance-3dvr-back',
    title: 'Over her shoulder',
    video: 'assets/golden-hour/dance-3dvr-back.mp4',
    poster: 'assets/golden-hour/dance-3dvr-back-poster.webp',
    alt: '3DVR Girl dancing in a backless sundress at a festival, laughing over her shoulder'
  },
  {
    kind: 'video',
    id: 'gh-dance-kayla-back',
    title: 'The garden from behind',
    video: 'assets/golden-hour/dance-kayla-back.mp4',
    poster: 'assets/golden-hour/dance-kayla-back-poster.webp',
    alt: 'Kayla dancing in a backless pink dress at a garden party, seen from behind'
  },
  {
    kind: 'video',
    id: 'gh-dance-muse-back',
    title: 'Lattice back, string lights',
    video: 'assets/golden-hour/dance-muse-back.mp4',
    poster: 'assets/golden-hour/dance-muse-back-poster.webp',
    alt: 'Muse dancing in a lattice-back dress under string lights at dusk, seen from behind'
  },
  {
    kind: 'video',
    id: 'gh-dance-crew-back',
    title: 'Four backs, one beat',
    video: 'assets/golden-hour/dance-crew-back.mp4',
    poster: 'assets/golden-hour/dance-crew-back-poster.webp',
    alt: 'Martha, 3DVR Girl, Kayla, and the garden muse dancing together at a festival, seen from behind'
  },
  {
    kind: 'video',
    id: 'gh-dance-beach-martha-3dvr',
    title: 'Beach linen, with Martha',
    video: 'assets/golden-hour/dance-beach-martha-3dvr.mp4',
    poster: 'assets/golden-hour/dance-beach-martha-3dvr-poster.webp',
    alt: 'Martha in a cream linen dress with red embroidery and 3DVR Girl in a white linen dress dancing barefoot on the beach, holding hands'
  },
  {
    kind: 'video',
    id: 'gh-dance-beach-kayla-garden',
    title: 'Shoreline at sunset',
    video: 'assets/golden-hour/dance-beach-kayla-garden.mp4',
    poster: 'assets/golden-hour/dance-beach-kayla-garden-poster.webp',
    alt: 'Kayla and the garden muse walking and dancing along the shoreline in linen dresses at sunset'
  },
  {
    kind: 'video',
    id: 'gh-dance-beach-muse-explorer',
    title: 'Sand and sunset',
    video: 'assets/golden-hour/dance-beach-muse-explorer.mp4',
    poster: 'assets/golden-hour/dance-beach-muse-explorer-poster.webp',
    alt: 'Muse and the Explorer dancing on the sand at sunset in linen, holding hands'
  },
  {
    kind: 'video',
    id: 'gh-dance-beach-crew',
    title: 'The beach circle',
    video: 'assets/golden-hour/dance-beach-crew.mp4',
    poster: 'assets/golden-hour/dance-beach-crew-poster.webp',
    alt: 'Martha in a cream linen dress dancing in a circle on the beach at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, all in linen'
  },
  {
    kind: 'video',
    id: 'gh-dance-field-thomas-3dvr',
    title: 'Dance with me, Thomas',
    video: 'assets/golden-hour/dance-field-thomas-3dvr.mp4',
    poster: 'assets/golden-hour/dance-field-thomas-3dvr-poster.webp',
    alt: 'Thomas in a linen shirt dancing hand in hand with 3DVR Girl in a lavender dress in a wildflower field; she says dance with me, Thomas'
  },
  {
    kind: 'video',
    id: 'gh-dance-field-thomas-kayla-garden',
    title: 'Thomas, this way',
    video: 'assets/golden-hour/dance-field-thomas-kayla-garden.mp4',
    poster: 'assets/golden-hour/dance-field-thomas-kayla-garden-poster.webp',
    alt: 'Thomas dancing in a meadow with Kayla, who calls to him, and the garden muse beside them'
  },
  {
    kind: 'video',
    id: 'gh-dance-field-thomas-muse-explorer',
    title: 'We saved you a dance',
    video: 'assets/golden-hour/dance-field-thomas-muse-explorer.mp4',
    poster: 'assets/golden-hour/dance-field-thomas-muse-explorer-poster.webp',
    alt: 'Thomas holding hands with Muse and the Explorer in a flower field at golden hour; Muse says they saved him a dance'
  },
  {
    kind: 'video',
    id: 'gh-dance-field-thomas-crew',
    title: 'His name, in the meadow',
    video: 'assets/golden-hour/dance-field-thomas-crew.mp4',
    poster: 'assets/golden-hour/dance-field-thomas-crew-poster.webp',
    alt: 'Thomas in a circle dance in a wildflower meadow at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, the girls chanting his name'
  }
];

const danceVideoGrid = document.querySelector('#danceVideoGrid');
if (danceVideoGrid) {
  danceVideos.forEach(item => danceVideoGrid.append(createGoldenHourCard(item)));
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

const livingVideos = document.querySelectorAll('.living-card video');

if (livingVideos.length && !reduceMotion.matches && 'IntersectionObserver' in window) {
  const livingObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.play().catch(() => {});
      } else {
        entry.target.pause();
      }
    });
  }, { threshold: 0.35 });
  livingVideos.forEach(video => livingObserver.observe(video));
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

/* Back to top: the stage is long; give the thumb a way home. The
   scroller is the HUD stage panel when the shell is up, the window
   otherwise. */
const backToTop = document.querySelector('#backToTop');
if (backToTop) {
  const hudStage = document.querySelector('.hud-stage');
  const stageTop = () => (hudStage ? hudStage.scrollTop : window.scrollY);
  document.addEventListener('scroll', () => {
    backToTop.hidden = stageTop() < 600;
  }, { passive: true, capture: true });
  backToTop.addEventListener('click', () => {
    (hudStage || window).scrollTo({ top: 0, behavior: 'smooth' });
  });
}
