// Data for the per-character sites served from 3dvr-girl/character/.
//
// One entry per character. The page renders entirely from this data, so a
// second character is a new entry here (plus a persona entry in
// src/openclaw/characters.js for her chat), never a copied page.
//
// Asset paths are relative to this folder (3dvr-girl/); the character page
// lives one level down and prefixes them with ../ when rendering.
//
// Copy comes only from established canon: the live portal girl page, the
// cast roster, and the character bible. Do not invent names, biographies,
// relationships, or looks here. When canon leaves something open, leave it
// open.

export const characters = [
  {
    id: '3dvr-girl',
    name: '3DVR Girl',
    roleLine: 'Portal traveler · builder · scout',
    tagline: 'Nature. Movement. Open technology that still feels human.',
    heroEyebrow: 'Her site / the blonde explorer',
    heroImage: {
      src: 'assets/portrait-blonde-garden-golden-hour.webp',
      alt: '3DVR Girl with a blonde bun and blue streaks in a cream linen shirt, smiling in a coastal garden at golden hour'
    },
    tags: ['Human first', 'Open source', 'Earth + future'],
    aboutTitle: 'Not a mascot.<br>A point of view.',
    about: [
      '3DVR Girl is the human side of the 3DVR universe: curious, playful, grounded, and willing to walk through the strange new door first.',
      'Her world lives between natural materials and digital possibility — beaches, courtyards, festivals, meditation, portals, and now the woods. The technology is present, but it does not need to shout.'
    ],
    fieldNotes: [
      ['Energy', 'Warm, adventurous, calm'],
      ['Look', 'Messy blonde bun, subtle blue accents'],
      ['Materials', 'Cream linen, crochet, natural textures'],
      ['Signal', 'Technology in service of life']
    ],
    worlds: [
      {
        name: 'Movement',
        copy: 'Music, people, freedom.',
        image: 'assets/festival-dance.jpg',
        alt: '3DVR Girl dancing at an outdoor festival'
      },
      {
        name: 'Water',
        copy: 'Reset the system.',
        image: 'assets/pool-welcome.png',
        alt: '3DVR Girl relaxing in a sunlit pool'
      },
      {
        name: 'Stillness',
        copy: 'Listen before building.',
        image: 'assets/meditation-seat.png',
        alt: '3DVR Girl seated in meditation'
      },
      {
        name: 'Portal',
        copy: 'The future, used sparingly.',
        image: 'assets/portal-arrival.png',
        alt: '3DVR Girl standing inside a blue portal'
      }
    ],
    gallery: [
      {
        src: 'assets/garden-portrait-sfw.webp',
        mode: 'Sun',
        title: 'Garden portrait',
        alt: '3DVR Girl with a blonde bun and blue streaks smiling in a coastal garden',
        copy: 'A fresh portrait in the current look: freckles, turquoise, cream linen, and golden light.'
      },
      {
        src: 'assets/portrait-blonde-garden-golden-hour.webp',
        mode: 'Sun',
        title: 'Golden hour garden',
        alt: '3DVR Girl with a blonde bun and blue streaks in a cream linen shirt, smiling in a coastal garden at golden hour',
        copy: 'A close portrait in the current look: blue streaks, freckles, turquoise beads, and the sea behind the garden.'
      },
      {
        src: 'assets/portrait-blonde-courtyard-blue-hour.webp',
        mode: 'Sun',
        title: 'Blue hour laugh',
        alt: '3DVR Girl laughing in a terracotta courtyard at blue hour, holding a small potted jasmine plant, blonde bun with blue streaks',
        copy: 'Blue hour in the courtyard: string lights, terracotta, and a jasmine seedling getting more attention than the sunset.'
      },
      {
        src: 'assets/festival-dance.jpg',
        mode: 'Movement',
        title: 'Festival pulse',
        alt: '3DVR Girl dancing at an outdoor festival',
        copy: 'Warm crowd energy, motion, music, and the less-polished side of the 3DVR world.'
      },
      {
        src: 'assets/courtyard-warrior.jpg',
        mode: 'Movement',
        title: 'Courtyard warrior',
        alt: '3DVR Girl in a warrior pose in a sunlit courtyard',
        copy: 'The still behind the courtyard flow loop: cream linen, terracotta, and late sun.'
      },
      {
        src: 'assets/warrior-flow.jpg',
        mode: 'Movement',
        title: 'Warrior flow',
        alt: '3DVR Girl holding a wide warrior stance',
        copy: 'A grounded movement frame built around balance, focus, and physical presence.'
      },
      {
        src: 'assets/pool-portrait.jpg',
        mode: 'Water',
        title: 'Poolside portrait',
        alt: '3DVR Girl smiling by a sunlit pool',
        copy: 'A new poolside frame: cream bikini, linen wrap, bougainvillea, and the 3DVR mark.'
      },
      {
        src: 'assets/pool-welcome.png',
        mode: 'Water',
        title: 'Waterline',
        alt: '3DVR Girl smiling from a sunlit pool',
        copy: 'Bright water and bougainvillea: a simple summer reset with almost no interface at all.'
      },
      {
        src: 'assets/meditation-courtyard.jpg',
        mode: 'Stillness',
        title: 'Lavender meditation',
        alt: '3DVR Girl seated in meditation among lavender',
        copy: 'The still behind the breathing loop: lavender pots, linen, and a quiet courtyard.'
      },
      {
        src: 'assets/meditation-seat.png',
        mode: 'Stillness',
        title: 'Meditation seat',
        alt: '3DVR Girl seated in meditation',
        copy: 'Quiet body, quiet interface. The portal can wait.'
      },
      {
        src: 'assets/portal-arrival.png',
        mode: 'Portal',
        title: 'Portal arrival',
        alt: '3DVR Girl standing inside a blue portal ring',
        copy: 'The overtly futuristic mode — useful when the story really needs the portal to be visible.'
      },
      {
        src: 'assets/beach-cafe.webp',
        mode: 'Sun',
        title: 'Beach cafe',
        alt: '3DVR Girl laughing in a pale blue sundress at a beach cafe, blonde bun with blue streaks and a turquoise bracelet, the ocean behind her',
        copy: 'Beach day, off duty: lemonade, sea air, and the laugh that starts most of her trouble.'
      },
      {
        src: 'assets/3dvr-girl-kala-forest.webp',
        mode: 'Forest',
        title: 'Root Network',
        alt: '3DVR Girl and Kayla standing together on a wooded trail',
        copy: 'The first Woods Chapter frame: 3DVR Girl and Kayla beyond the last mapped node.'
      }
    ],
    storiesNote: 'Three adventures so far: a door in the cliff, a keeper\u2019s secret, and an island in the sky. She shares these stories with the rest of the cast.',
    stories: [
      {
        label: 'Book One',
        title: 'The Door at the End of the Garden',
        href: 'storybook/',
        cover: 'assets/storybook/cover-garden-key.webp',
        coverAlt: 'Book One cover: the four friends at the garden gate at sunrise'
      },
      {
        label: 'Book Two',
        title: 'The Second Key',
        href: 'storybook/second-key/',
        cover: 'assets/storybook/sk-gate.webp',
        coverAlt: 'Book Two cover: the garden muse hands the keeper a small brass key at dusk'
      },
      {
        label: 'Book Three',
        title: 'The Island in the Sky',
        href: 'storybook/island-in-the-sky/',
        cover: 'assets/storybook/island-stairs.webp',
        coverAlt: 'Book Three cover: a stairway of turquoise stones rising to an island in the sky'
      }
    ],
    chat: {
      heading: 'Talk with her',
      greeting: 'You found my corner of the portal. Come sit a minute \u2014 the courtyard is warm and I am in no hurry. \u{1F49C}',
      placeholder: 'Say something to 3DVR Girl\u2026',
      privateNote: 'Chat is private to the owner account and runs through the same bridge as Helm. She cannot run tools or change anything from here.'
    }
  }
];

export function getCharacter(id) {
  return characters.find(character => character.id === id) || null;
}

export function defaultCharacter() {
  return characters[0];
}
