const scenes = [
  {
    id: 'portal-arrival',
    title: 'Next-level immersion',
    kicker: 'Portal arrival',
    mode: 'Portal',
    copy: 'A polished portal-ready frame with the 3DVR mark, blue ring, and a cleaner model direction.',
    image: 'assets/portal-arrival.png',
    alt: '3DVR Girl standing inside a glowing blue portal ring'
  },
  {
    id: 'pool-welcome',
    title: 'Pool welcome',
    kicker: 'Pool welcome',
    mode: 'Refresh',
    copy: 'Bright water, bougainvillea, and an inviting close frame for a lighter first impression.',
    image: 'assets/pool-welcome.png',
    alt: '3DVR Girl smiling from a bright swimming pool'
  },
  {
    id: 'pool-stand',
    title: 'Sunlit reset',
    kicker: 'Pool stand',
    mode: 'Reset',
    copy: 'Clean pool light and centered posture for an open, restorative scene.',
    image: 'assets/pool-stand.png',
    alt: '3DVR Girl standing in a blue swimming pool'
  },
  {
    id: 'meditation-seat',
    title: 'Meditation seat',
    kicker: 'Meditation',
    mode: 'Calm',
    copy: 'A composed seated frame for breathwork, guided entry, and quieter portal states.',
    image: 'assets/meditation-seat.png',
    alt: '3DVR Girl seated in a meditation pose on a sunlit mat'
  },
  {
    id: 'courtyard-crouch',
    title: 'Courtyard pause',
    kicker: 'Courtyard pause',
    mode: 'Ease',
    copy: 'Warm architecture and a relaxed pose for soft profile moments and scene transitions.',
    image: 'assets/courtyard-crouch.png',
    alt: '3DVR Girl crouching in a sunlit courtyard'
  },
  {
    id: 'balance-tree',
    title: 'Balance protocol',
    kicker: 'Courtyard balance',
    mode: 'Balance',
    copy: 'Sunlit calm and ritual posture for daily check-ins, breathwork, and soft onboarding.',
    image: 'assets/balance-tree.jpg',
    alt: '3DVR Girl balancing in a courtyard'
  },
  {
    id: 'warrior-flow',
    title: 'White-light discipline',
    kicker: 'Warrior flow',
    mode: 'Focus',
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
    mode: 'Restore',
    copy: 'A physical reset visual for recovery, nervous-system pages, and lower-energy sessions.',
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

const GUIDE_STORAGE_KEY = '3dvrGirlGuide';
const $ = (selector) => document.querySelector(selector);

const refs = {
  stageImage: $('#stageImage'),
  stageTitle: $('#stageTitle'),
  stageKicker: $('#stageKicker'),
  stageCopy: $('#stageCopy'),
  modeLabel: $('#modeLabel'),
  guideLabel: $('#guideLabel'),
  galleryGrid: $('#galleryGrid'),
  sceneRail: $('#sceneRail'),
  guideGrid: $('#guideGrid'),
  guideNote: $('#guideNote'),
  heroImage: $('#heroImage'),
  heroGuideImage: $('#heroGuideImage'),
  guidePreviewImage: $('#guidePreviewImage'),
  guidePreviewKicker: $('#guidePreviewKicker'),
  guidePreviewTitle: $('#guidePreviewTitle'),
  guidePreviewCopy: $('#guidePreviewCopy')
};

function setText(node, text) {
  if (node) {
    node.textContent = text;
  }
}

function setScene(sceneId) {
  const scene = scenes.find((item) => item.id === sceneId) || scenes[0];

  if (refs.stageImage) {
    refs.stageImage.src = scene.image;
    refs.stageImage.alt = scene.alt;
  }

  if (refs.heroImage) {
    refs.heroImage.src = scene.image;
    refs.heroImage.alt = scene.alt;
  }

  setText(refs.stageTitle, scene.title);
  setText(refs.stageKicker, scene.kicker);
  setText(refs.stageCopy, scene.copy);
  setText(refs.modeLabel, scene.mode);

  document.querySelectorAll('[data-focus-image]').forEach((control) => {
    const active = control.dataset.focusImage === scene.id;
    control.classList.toggle('is-active', active);
    control.setAttribute('aria-pressed', String(active));
  });
}

function createSceneButton(scene, index) {
  const button = document.createElement('button');
  button.className = 'scene-chip';
  button.type = 'button';
  button.dataset.focusImage = scene.id;
  button.setAttribute('aria-label', `Select ${scene.kicker}`);
  button.setAttribute('aria-pressed', 'false');

  const number = document.createElement('span');
  number.setAttribute('aria-hidden', 'true');
  number.textContent = String(index + 1).padStart(2, '0');

  button.append(number, scene.mode);
  button.addEventListener('click', () => setScene(scene.id));
  return button;
}

function createGalleryCard(scene) {
  const button = document.createElement('button');
  button.className = 'gallery-card';
  button.type = 'button';
  button.dataset.focusImage = scene.id;
  button.setAttribute('aria-label', `Select ${scene.kicker}`);
  button.setAttribute('aria-pressed', 'false');

  const image = document.createElement('img');
  image.src = scene.image;
  image.alt = scene.alt;
  image.loading = 'lazy';

  const label = document.createElement('span');
  label.textContent = scene.kicker;

  button.append(image, label);
  button.addEventListener('click', () => setScene(scene.id));
  return button;
}

function createScenes() {
  scenes.forEach((scene, index) => {
    if (refs.sceneRail) {
      refs.sceneRail.append(createSceneButton(scene, index));
    }
    if (refs.galleryGrid) {
      refs.galleryGrid.append(createGalleryCard(scene));
    }
  });
}

function setGuide(guideId) {
  const guide = guides.find((item) => item.id === guideId) || guides[0];
  document.body.dataset.guide = guide.id;

  setText(refs.guideNote, guide.note);
  setText(refs.guideLabel, guide.label);
  setText(refs.guidePreviewKicker, guide.title);
  setText(refs.guidePreviewTitle, guide.headline);
  setText(refs.guidePreviewCopy, guide.copy);

  if (refs.heroGuideImage) {
    refs.heroGuideImage.src = guide.image;
  }

  if (refs.guidePreviewImage) {
    refs.guidePreviewImage.src = guide.image;
    refs.guidePreviewImage.alt = guide.alt;
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
  if (!refs.guideGrid) {
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
    refs.guideGrid.append(button);
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
  control.setAttribute('aria-pressed', 'false');
  control.addEventListener('click', () => setScene(control.dataset.focusImage));
});

createScenes();
createGuidePicker();
setScene('portal-arrival');
setGuide(getStoredGuide() || 'feminine');
