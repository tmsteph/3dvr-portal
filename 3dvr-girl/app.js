const scenes = [
  {
    id: 'portal-ring',
    title: 'Next-level immersion',
    kicker: 'Portal ring',
    mode: 'Portal',
    copy: 'A clean hero image for the 3DVR Girl identity: bright ring, studio posture, instant brand read.',
    image: 'assets/portal-ring.jpg',
    alt: '3DVR Girl standing inside a blue portal ring'
  },
  {
    id: 'balance-tree',
    title: 'Balance protocol',
    kicker: 'Courtyard balance',
    mode: 'Balance',
    copy: 'Sunlit calm, ritual posture, and a wellness lane that can anchor daily check-ins.',
    image: 'assets/balance-tree.jpg',
    alt: '3DVR Girl balancing in a courtyard'
  },
  {
    id: 'warrior-flow',
    title: 'White-light discipline',
    kicker: 'Warrior flow',
    mode: 'Power',
    copy: 'Strong side profile for motion cards, training prompts, and embodied focus.',
    image: 'assets/warrior-flow.jpg',
    alt: '3DVR Girl in a warrior stance'
  },
  {
    id: 'festival-dance',
    title: 'Crowd pulse',
    kicker: 'Festival pulse',
    mode: 'Pulse',
    copy: 'The high-energy social frame: music, movement, and immersive crowd atmosphere.',
    image: 'assets/festival-dance.jpg',
    alt: '3DVR Girl dancing at a festival'
  },
  {
    id: 'downward-flow',
    title: 'Grounded arc',
    kicker: 'Flow posture',
    mode: 'Stretch',
    copy: 'A physical reset visual for breathwork, recovery, and nervous-system pages.',
    image: 'assets/downward-flow.jpg',
    alt: '3DVR Girl in a downward stretch posture'
  },
  {
    id: 'courtyard-stand',
    title: 'Soft launch',
    kicker: 'Courtyard stand',
    mode: 'Presence',
    copy: 'Simple full-body frame with warm architecture, useful for profile and directory cards.',
    image: 'assets/courtyard-stand.jpg',
    alt: '3DVR Girl standing in a sunny courtyard'
  },
  {
    id: 'over-shoulder',
    title: 'Afterimage',
    kicker: 'Back turn',
    mode: 'Mystery',
    copy: 'A quieter frame for teaser tiles, transitions, and portal memory moments.',
    image: 'assets/over-shoulder.jpg',
    alt: '3DVR Girl looking back over her shoulder'
  },
  {
    id: 'sunlit-crouch',
    title: 'Low sun signal',
    kicker: 'Sunlit crouch',
    mode: 'Presence',
    copy: 'A warm courtyard pose for social cutdowns, avatar intros, and light lifestyle cards.',
    image: 'assets/sunlit-crouch.jpg',
    alt: '3DVR Girl crouching in warm courtyard light'
  },
  {
    id: 'pool-signal',
    title: 'Waterline focus',
    kicker: 'Pool signal',
    mode: 'Refresh',
    copy: 'A bright pool frame that points the brand toward summer, wellness, and visual reset moments.',
    image: 'assets/pool-signal.jpg',
    alt: '3DVR Girl standing in a sunlit pool'
  },
  {
    id: 'courtyard-meditation',
    title: 'Calm body channel',
    kicker: 'Courtyard meditation',
    mode: 'Calm',
    copy: 'A seated frame for manifestation, breathwork, and soft-focus portal programming.',
    image: 'assets/courtyard-meditation.jpg',
    alt: '3DVR Girl sitting cross-legged in a courtyard'
  },
  {
    id: 'courtyard-profile',
    title: 'Profile lockup',
    kicker: 'Courtyard profile',
    mode: 'Profile',
    copy: 'A clean side-profile asset for bios, campaign covers, and creator identity cards.',
    image: 'assets/courtyard-profile.jpg',
    alt: '3DVR Girl standing in profile in a courtyard'
  },
  {
    id: 'sunlit-curve',
    title: 'Golden hour line',
    kicker: 'Sunlit curve',
    mode: 'Motion',
    copy: 'A standing motion pose with warm shadows, useful for transition tiles and rhythm prompts.',
    image: 'assets/sunlit-curve.jpg',
    alt: '3DVR Girl posing in warm sunlit shadows'
  },
  {
    id: 'wide-flow',
    title: 'Open stance',
    kicker: 'Wide flow',
    mode: 'Power',
    copy: 'A wide-frame movement pose that expands the gallery beyond still portrait energy.',
    image: 'assets/wide-flow.jpg',
    alt: '3DVR Girl holding a wide movement stance'
  },
  {
    id: 'tree-prayer',
    title: 'Prayer balance',
    kicker: 'Tree prayer',
    mode: 'Balance',
    copy: 'A stable one-leg frame for practice sequences, daily rituals, and mindful check-ins.',
    image: 'assets/tree-prayer.jpg',
    alt: '3DVR Girl holding a tree pose with hands in prayer'
  },
  {
    id: 'blue-portal-stance',
    title: 'Brand portal stance',
    kicker: 'Blue portal stance',
    mode: 'Portal',
    copy: 'A high-brand read with blue rings, 3DVR mark, and a direct avatar-channel landing image.',
    image: 'assets/blue-portal-stance.jpg',
    alt: '3DVR Girl standing in a blue branded portal'
  }
];

const stageImage = document.getElementById('stageImage');
const stageTitle = document.getElementById('stageTitle');
const stageKicker = document.getElementById('stageKicker');
const stageCopy = document.getElementById('stageCopy');
const modeLabel = document.getElementById('modeLabel');
const galleryGrid = document.getElementById('galleryGrid');
const heroImage = document.querySelector('.hero__image');

function setScene(sceneId) {
  const scene = scenes.find((item) => item.id === sceneId) || scenes[0];
  stageImage.src = scene.image;
  stageImage.alt = scene.alt;
  stageTitle.textContent = scene.title;
  stageKicker.textContent = scene.kicker;
  stageCopy.textContent = scene.copy;
  modeLabel.textContent = scene.mode;

  if (scene.id === 'portal-ring' || scene.id === 'festival-dance' || scene.id === 'blue-portal-stance') {
    heroImage.src = scene.image;
    heroImage.alt = scene.alt;
  }

  document.querySelectorAll('[data-focus-image]').forEach((control) => {
    control.classList.toggle('is-active', control.dataset.focusImage === scene.id);
  });
}

function createGallery() {
  scenes.forEach((scene) => {
    const button = document.createElement('button');
    button.className = 'gallery-card';
    button.type = 'button';
    button.dataset.focusImage = scene.id;
    button.setAttribute('aria-label', `Select ${scene.kicker}`);

    const image = document.createElement('img');
    image.src = scene.image;
    image.alt = scene.alt;
    image.loading = 'lazy';

    const label = document.createElement('span');
    label.textContent = scene.kicker;

    button.append(image, label);
    button.addEventListener('click', () => setScene(scene.id));
    galleryGrid.append(button);
  });
}

document.querySelectorAll('[data-focus-image]').forEach((control) => {
  control.addEventListener('click', () => setScene(control.dataset.focusImage));
});

createGallery();
setScene('portal-ring');
