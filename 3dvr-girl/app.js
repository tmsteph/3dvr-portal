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
    id: 'shore-preview',
    title: 'Storefront echo',
    kicker: 'Preview capture',
    mode: 'Commerce',
    copy: 'A rough phone capture that can become the product lane once higher-resolution originals are available.',
    image: 'assets/shore-preview.jpg',
    alt: 'Phone screenshot preview of a 3DVR Girl image'
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

document.querySelectorAll('[data-focus-image]').forEach((control) => {
  control.addEventListener('click', () => setScene(control.dataset.focusImage));
});

createGallery();
setScene('portal-ring');
