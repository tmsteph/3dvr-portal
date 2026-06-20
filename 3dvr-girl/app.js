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
  }
];

const guides = [
  {
    id: 'feminine',
    label: 'Feminine',
    title: 'Feminine guide',
    image: 'assets/guides/feminine.png',
    alt: 'Cartoon feminine 3DVR guide inside a soft portal ring',
    note: 'Feminine guide selected.',
    headline: 'Warm studio presence',
    copy: 'Soft, focused, and human-forward for a calm portal greeting.'
  },
  {
    id: 'masculine',
    label: 'Masculine',
    title: 'Masculine guide',
    image: 'assets/guides/masculine.png',
    alt: 'Cartoon masculine 3DVR guide inside a blue portal ring',
    note: 'Masculine guide selected.',
    headline: 'Grounded signal',
    copy: 'Steady, composed, and direct for a focused entry into the experience.'
  },
  {
    id: 'robot',
    label: 'Robot',
    title: 'Robot guide',
    image: 'assets/guides/robot.png',
    alt: 'Cartoon robot 3DVR guide inside a glowing portal ring',
    note: 'Robot guide selected.',
    headline: 'Precision interface',
    copy: 'Clean, technical, and luminous for a more synthetic portal atmosphere.'
  },
  {
    id: 'nature',
    label: 'Nature',
    title: 'Nature guide',
    image: 'assets/guides/nature.png',
    alt: 'Cartoon nature 3DVR guide inside a green portal ring',
    note: 'Nature guide selected.',
    headline: 'Restorative path',
    copy: 'Botanical, bright, and grounded for a softer environmental welcome.'
  },
  {
    id: 'cosmic',
    label: 'Cosmic',
    title: 'Cosmic guide',
    image: 'assets/guides/cosmic.png',
    alt: 'Cartoon cosmic 3DVR guide inside a violet portal ring',
    note: 'Cosmic guide selected.',
    headline: 'Astral companion',
    copy: 'Dreamlike, spacious, and cinematic for a more surreal opening mood.'
  },
  {
    id: 'portal',
    label: 'Portal',
    title: 'Portal guide',
    image: 'assets/guides/portal.png',
    alt: 'Cartoon blue 3DVR portal guide with concentric rings',
    note: 'Portal guide selected.',
    headline: 'Pure 3DVR frame',
    copy: 'Brand-first, abstract, and light-driven when you want the portal itself to lead.'
  }
];

const stageImage = document.getElementById('stageImage');
const stageTitle = document.getElementById('stageTitle');
const stageKicker = document.getElementById('stageKicker');
const stageCopy = document.getElementById('stageCopy');
const modeLabel = document.getElementById('modeLabel');
const galleryGrid = document.getElementById('galleryGrid');
const guideGrid = document.getElementById('guideGrid');
const guideNote = document.getElementById('guideNote');
const heroGuideImage = document.getElementById('heroGuideImage');
const guidePreviewImage = document.getElementById('guidePreviewImage');
const guidePreviewKicker = document.getElementById('guidePreviewKicker');
const guidePreviewTitle = document.getElementById('guidePreviewTitle');
const guidePreviewCopy = document.getElementById('guidePreviewCopy');
const heroImage = document.querySelector('.hero__image');
const GUIDE_STORAGE_KEY = '3dvrGirlGuide';

function setScene(sceneId) {
  const scene = scenes.find((item) => item.id === sceneId) || scenes[0];
  stageImage.src = scene.image;
  stageImage.alt = scene.alt;
  stageTitle.textContent = scene.title;
  stageKicker.textContent = scene.kicker;
  stageCopy.textContent = scene.copy;
  modeLabel.textContent = scene.mode;

  if (scene.id === 'portal-ring' || scene.id === 'festival-dance') {
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

function setGuide(guideId) {
  const guide = guides.find((item) => item.id === guideId) || guides[0];
  document.body.dataset.guide = guide.id;
  if (guideNote) {
    guideNote.textContent = guide.note;
  }
  if (heroGuideImage) {
    heroGuideImage.src = guide.image;
  }
  if (guidePreviewImage) {
    guidePreviewImage.src = guide.image;
    guidePreviewImage.alt = guide.alt;
  }
  if (guidePreviewKicker) {
    guidePreviewKicker.textContent = guide.title;
  }
  if (guidePreviewTitle) {
    guidePreviewTitle.textContent = guide.headline;
  }
  if (guidePreviewCopy) {
    guidePreviewCopy.textContent = guide.copy;
  }
  try {
    localStorage.setItem(GUIDE_STORAGE_KEY, guide.id);
  } catch (error) {
    // The picker still works when storage is unavailable.
  }

  document.querySelectorAll('[data-guide-option]').forEach((control) => {
    const active = control.dataset.guideOption === guide.id;
    control.classList.toggle('is-active', active);
    control.setAttribute('aria-pressed', String(active));
  });
}

function createGuidePicker() {
  if (!guideGrid) {
    return;
  }

  guides.forEach((guide) => {
    const button = document.createElement('button');
    button.className = 'guide-option';
    button.type = 'button';
    button.dataset.guideOption = guide.id;
    button.setAttribute('aria-label', `Choose ${guide.title}`);
    button.setAttribute('aria-pressed', 'false');

    const image = document.createElement('img');
    image.src = guide.image;
    image.alt = guide.alt;
    image.loading = 'lazy';

    const label = document.createElement('span');
    label.textContent = guide.label;

    button.append(image, label);
    button.addEventListener('click', () => setGuide(guide.id));
    guideGrid.append(button);
  });
}

function getStoredGuide() {
  try {
    return localStorage.getItem(GUIDE_STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

document.querySelectorAll('[data-focus-image]').forEach((control) => {
  control.addEventListener('click', () => setScene(control.dataset.focusImage));
});

createGallery();
createGuidePicker();
setScene('portal-ring');
setGuide(getStoredGuide() || 'feminine');
