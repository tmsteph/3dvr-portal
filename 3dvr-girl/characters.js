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
//
// Each entry also carries an `afterDark` list: her private frames from the
// world page's After Dark archive, attributed by what each render actually
// shows (the world page captions are the source; frames whose subject is
// not clearly her stay out). The character page renders that list locked
// behind the paywall in character/access.js; the public `gallery` list
// stays SFW, always.
//
// Between the two sits `goldenHour`: the in-between shelf from the world
// page — sexier than the scene archive, dressed enough for daylight, and
// fully public. Same attribution rule: a frame (or clip, marked with
// `video: true` and a `poster` still) is listed for every character it
// clearly shows.

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
    goldenHour: [
      {
        src: 'assets/golden-hour/duo-pool-swimsuits.webp',
        mode: 'Water',
        title: 'Pool rules',
        alt: '3DVR Girl in a turquoise cutout swimsuit and Kayla in a black bikini laughing beside a sunlit pool',
        copy: 'Turquoise cutouts, black bikini, and no plans until the light goes.'
      },
      {
        src: 'assets/golden-hour/trio-linen-sundresses.webp',
        mode: 'Sun',
        title: 'Courtyard lemonade',
        alt: '3DVR Girl, the garden muse, and the Explorer in linen sundresses laughing in a sunny courtyard',
        copy: 'Three sundresses and a round of lemonade: golden hour in the courtyard.'
      },
      {
        src: 'assets/golden-hour/solo-lavender-dress.webp',
        mode: 'Sun',
        title: 'Lavender twirl',
        alt: '3DVR Girl twirling in a white linen sundress in a lavender field at golden hour',
        copy: 'A white linen sundress, a lavender field, and one good spin.'
      },
      {
        src: 'assets/golden-hour/trio-festival-dusk.webp',
        mode: 'Festival',
        title: 'Festival dusk',
        alt: '3DVR Girl, Kayla, and Muse with flower crowns and crochet tops at an outdoor festival at dusk, arms around each other laughing',
        copy: 'Flower crowns, crochet tops, and the stage lighting up: the set starts at dusk.'
      },
      {
        src: 'assets/golden-hour/solo-festival-dress.webp',
        mode: 'Festival',
        title: 'Festival spin',
        alt: '3DVR Girl twirling in a flowing embroidered festival dress, flower crown on, fairy lights glowing behind her at dusk',
        copy: 'Hair out, skirt out: she spins while the fairy lights come on.'
      },
      {
        src: 'assets/golden-hour/video-pool-duo.mp4',
        poster: 'assets/golden-hour/duo-pool-swimsuits.webp',
        video: true,
        mode: 'Water',
        title: 'Pool rules, in motion',
        alt: '3DVR Girl and Kayla laughing and splashing at the pool',
        copy: 'The pool frame, moving: same laugh, with splashes.'
      },
      {
        src: 'assets/golden-hour/video-sundress-trio.mp4',
        poster: 'assets/golden-hour/trio-linen-sundresses.webp',
        video: true,
        mode: 'Sun',
        title: 'Courtyard lemonade, in motion',
        alt: '3DVR Girl, the garden muse, and the Explorer laughing together in a sunny courtyard',
        copy: 'The courtyard frame, moving: lemonade up, everyone mid-laugh.'
      },
      {
        src: 'assets/golden-hour/dance-martha-3dvr-festival.mp4',
        poster: 'assets/golden-hour/dance-martha-3dvr-festival-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'Festival gold, with Martha',
        alt: 'Martha in her black dress with red embroidery dancing with 3DVR Girl in a bright festival dress at golden hour',
        copy: 'Martha joins the festival set: black dress, red embroidery, and the light going gold.'
      },
      {
        src: 'assets/golden-hour/dance-crew-finale.mp4',
        poster: 'assets/golden-hour/dance-crew-finale-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'The whole circle',
        alt: 'Martha at the centre of a festival dance circle with 3DVR Girl, Muse, and the garden muse, flower crowns on, at dusk',
        copy: 'The whole circle, hands linked: Martha in the middle and the set just starting.'
      },
      {
        src: 'assets/golden-hour/dance-3dvr-solo.mp4',
        poster: 'assets/golden-hour/dance-3dvr-solo-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'Come dance with me',
        alt: '3DVR Girl speaking to the camera at a festival at golden hour',
        copy: 'She says it herself: come dance with me.'
      },
      {
        src: 'assets/golden-hour/dance-3dvr-back.mp4',
        poster: 'assets/golden-hour/dance-3dvr-back-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'Over her shoulder',
        alt: '3DVR Girl dancing in a backless sundress at a festival, laughing over her shoulder',
        copy: 'Backless sundress, blue streaks down her back, and a laugh over her shoulder.'
      },
      {
        src: 'assets/golden-hour/dance-crew-back.mp4',
        poster: 'assets/golden-hour/dance-crew-back-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'Four backs, one beat',
        alt: 'Martha, 3DVR Girl, Kayla, and the garden muse dancing together at a festival, seen from behind',
        copy: 'Four backs, one beat: the crew from behind, mid-dance.'
      },
      {
        src: 'assets/golden-hour/dance-beach-martha-3dvr.mp4',
        poster: 'assets/golden-hour/dance-beach-martha-3dvr-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Beach linen, with Martha',
        alt: 'Martha in a cream linen dress with red embroidery and 3DVR Girl in a white linen dress dancing barefoot on the beach, holding hands',
        copy: 'Linen on the sand: Martha takes her hand and the beach does the rest.'
      },
      {
        src: 'assets/golden-hour/dance-beach-crew.mp4',
        poster: 'assets/golden-hour/dance-beach-crew-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'The beach circle',
        alt: 'Martha in a cream linen dress dancing in a circle on the beach at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, all in linen',
        copy: 'The whole crew in linen, circling on the sand as the sun goes down.'
      },
      {
        src: 'assets/golden-hour/dance-field-thomas-3dvr.mp4',
        poster: 'assets/golden-hour/dance-field-thomas-3dvr-poster.webp',
        video: true,
        mode: 'Field',
        title: 'Dance with me, Thomas',
        alt: 'Thomas in a linen shirt dancing hand in hand with 3DVR Girl in a lavender dress in a wildflower field',
        copy: 'In the wildflowers, she asks him herself: dance with me, Thomas.'
      },
      {
        src: 'assets/golden-hour/dance-field-thomas-crew.mp4',
        poster: 'assets/golden-hour/dance-field-thomas-crew-poster.webp',
        video: true,
        mode: 'Field',
        title: 'His name, in the meadow',
        alt: 'Thomas in a circle dance in a wildflower meadow at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, the girls chanting his name',
        copy: 'The girls chant his name and the meadow keeps the beat.'
      },
      {
        src: 'assets/golden-hour/lollipop-3dvr-girl.webp',
        mode: 'Festival',
        title: 'Candy hour',
        alt: '3DVR Girl with long blonde hair in a pale blue top, holding a pink and blue swirled lollipop at her lips at a harbor festival',
        copy: 'Pink and blue swirl at the harbor stalls: she picked the biggest one they had.'
      }
    ],
    afterDark: [
      { src: 'assets/after-dark/blonde-courtyard.webp', title: 'Warrior, after hours', alt: '3DVR Girl nude in a bougainvillea courtyard, arms open' },
      { src: 'assets/after-dark/blonde-lavender.webp', title: 'Lavender steps', alt: '3DVR Girl nude, seated among lavender pots, smiling' },
      { src: 'assets/after-dark/blonde-cliff-terrace.webp', title: 'Cliff terrace', alt: '3DVR Girl on a cliff terrace above the ocean at golden hour' },
      { src: 'assets/after-dark/blonde-linen.webp', title: 'Linen, lost in it', alt: '3DVR Girl reclining nude on linen, eyes closed' },
      { src: 'assets/after-dark/blonde-dance.webp', title: 'Courtyard dance', alt: '3DVR Girl dancing in a linen top and flowing skirt in the bougainvillea courtyard, laughing' },
      { src: 'assets/after-dark/blonde-bend.webp', title: 'Over the balustrade', alt: '3DVR Girl nude, leaning over a stone balustrade above the ocean, looking back' },
      { src: 'assets/after-dark/duo-forest-kiss.webp', title: 'Forest kiss', alt: '3DVR Girl and Kayla nude, kissing in a sunlit forest clearing' },
      { src: 'assets/after-dark/duo-forest-embrace.webp', title: 'Entwined', alt: '3DVR Girl and Kayla nude, entwined on a blanket in the woods' },
      { src: 'assets/after-dark/duo-courtyard-1.webp', title: 'Courtyard, nose to nose', alt: 'Two of the 3DVR Girl, topless in turquoise jewelry in a bougainvillea courtyard, nose to nose and laughing' },
      { src: 'assets/after-dark/duo-courtyard-2.webp', title: 'Bougainvillea light', alt: 'Two of the 3DVR Girl, topless nose to nose under bougainvillea at golden hour' },
      { src: 'assets/after-dark/duo-courtyard-3.webp', title: 'About to kiss', alt: 'Two of the 3DVR Girl in turquoise beads, about to kiss in a sunlit courtyard' },
      { src: 'assets/after-dark/duo-forest-meadow.webp', title: 'Wildflower kiss', alt: '3DVR Girl and Kayla nude, kissing on a blanket in a wildflower meadow' },
      { src: 'assets/after-dark/duo-forest-bluebells.webp', title: 'Bluebells, laughing', alt: 'Two of the 3DVR Girl nude on a blanket in a bluebell forest clearing, laughing together' },
      { src: 'assets/after-dark/duo-forest-meadow-2.webp', title: 'Meadow, leaning in', alt: 'Two of the 3DVR Girl nude in a wildflower meadow, one leaning over the other on a blanket' },
      { src: 'assets/after-dark/duo-forest-blanket.webp', title: 'On the blanket', alt: '3DVR Girl and Kayla nude, kissing on a blanket at the edge of the woods' },
      { src: 'assets/after-dark/machine-vr-1.webp', title: 'Headphones on', alt: '3DVR Girl nude on a bed with turquoise headphones and a laptop' },
      { src: 'assets/after-dark/machine-vr-2.webp', title: 'In the headset', alt: '3DVR Girl nude, reclining on a bed wearing a white VR headset' },
      { src: 'assets/after-dark/machine-bed-1.webp', title: 'Face down, screen glow', alt: '3DVR Girl nude, face down on a bed with a laptop glowing nearby' },
      { src: 'assets/after-dark/machine-bed-2.webp', title: 'The lamp experiment', alt: '3DVR Girl nude on a bed beside a glowing tube device and a laptop' },
      { src: 'assets/after-dark/machine-scene-1.webp', title: 'Turquoise prototype', alt: '3DVR Girl nude, seated with a turquoise prototype device' },
      { src: 'assets/after-dark/machine-scene-2.webp', title: 'Black prototype', alt: '3DVR Girl nude on a bed, holding a black cylindrical device' },
      { src: 'assets/after-dark/blonde-wings-1.webp', title: 'Angel over the courtyard', alt: '3DVR Girl nude with white feathered angel wings, looking back laughing in a bougainvillea courtyard' },
      { src: 'assets/after-dark/blonde-wings-2.webp', title: 'Angel in linen', alt: '3DVR Girl in cream linen lingerie with white angel wings, kneeling on a coastal terrace' },
      { src: 'assets/after-dark/blonde-wings-3.webp', title: 'Angel in the lavender', alt: '3DVR Girl nude seated among lavender with white angel wings draped behind her' },
      { src: 'assets/after-dark/blonde-wings-4.webp', title: 'Feather skirt', alt: '3DVR Girl laughing with her angel wings landed at her hips like a feather skirt in a sunlit courtyard' },
      { src: 'assets/after-dark/blonde-paint-1.webp', title: 'Rainbow paint, twirl', alt: '3DVR Girl nude covered in flowing rainbow body paint, twirling and laughing in a bougainvillea courtyard' },
      { src: 'assets/after-dark/blonde-paint-2.webp', title: 'Rainbow paint, garden', alt: '3DVR Girl nude with rainbow paint drips and splashes, seated among lavender pots in a coastal garden' },
      { src: 'assets/after-dark/blonde-paint-3.webp', title: 'Rainbow paint, flex', alt: '3DVR Girl nude with dripping rainbow body paint, flexing playfully in a wide warrior squat in a courtyard' },
      { src: 'assets/after-dark/blonde-purple-1.webp', title: 'Purple paint, dance', alt: '3DVR Girl nude with violet and turquoise body paint, dancing under magenta bougainvillea' },
      { src: 'assets/after-dark/duo-terrace-1.webp', title: 'Golden hour, terrace', alt: '3DVR Girl and Kayla nude on a rooftop terrace at golden hour, foreheads together laughing, wine on the side table' },
      { src: 'assets/after-dark/blonde-sunset-1.webp', title: 'Sunset, looking back', alt: '3DVR Girl nude on a coastal cliff path at sunset, looking back over her shoulder' },
      { src: 'assets/after-dark/preg-courtyard.webp', title: 'Very pregnant, courtyard', alt: '3DVR Girl nude and very pregnant with very large swollen breasts, cradling her huge belly in a bougainvillea courtyard' },
      { src: 'assets/after-dark/preg-lavender.webp', title: 'Very pregnant, lavender', alt: '3DVR Girl nude and very pregnant, kneeling among lavender with her hands on her huge belly' },
      { src: 'assets/after-dark/preg-terrace.webp', title: 'Very pregnant, sunset', alt: '3DVR Girl very pregnant in profile on a cliff terrace at sunset, wearing a turquoise wrap, hand on her huge belly' },
      { src: 'assets/after-dark/duo-pool.webp', title: 'Pool at dusk', alt: '3DVR Girl and Kayla topless in a turquoise pool at dusk under string lights, laughing together' },
      { src: 'assets/after-dark/blonde-first-1.webp', title: 'First take, coastal', alt: '3DVR Girl in a blue top and turquoise beads on the coast at golden hour, first take' },
      { src: 'assets/after-dark/blonde-first-2.webp', title: 'First take, poolside', alt: '3DVR Girl in a white top and turquoise earrings by the water, first take' },
      { src: 'assets/after-dark/blonde-first-3.webp', title: 'First take, turquoise necklace', alt: '3DVR Girl bare-shouldered with a turquoise statement necklace on the coast, first take' },
      { src: 'assets/after-dark/duo-terrace-3.webp', title: 'Terrace diptych', alt: 'Two of the 3DVR Girl nude together on a terrace daybed at dusk under string lights, in a two-panel diptych' },
      { src: 'assets/after-dark/thomas-blonde-pool-dusk.webp', title: 'Pool edge at dusk', alt: 'The Blonde Girl seated in front of Thomas at the edge of a pool at dusk, feet in the water, string lights above' },
      { src: 'assets/after-dark/srv-blonde-pool.webp', title: 'Pool embrace at dusk', alt: 'Thomas and the Blonde Girl in a nude embrace in a pool at dusk, both laughing, wet skin' },
      { src: 'assets/after-dark/srv-blonde-solo.webp', title: 'Terrace at dusk, black lace', alt: 'The Blonde Girl in sheer black lingerie on a terrace at dusk, ocean behind her' },
      { src: 'assets/after-dark/anc-blonde-pool.webp', title: 'Pool at Dusk', alt: 'The Blonde Girl nude at a pool at dusk under string lights, smiling at the camera from a man\'s lap at the pool edge; the render\'s partner is not Thomas' },
      { src: 'assets/after-dark/anc-blonde-pool-2.webp', title: 'Pool at Dusk, Take Two', alt: 'The Blonde Girl nude at a pool at sunset, smiling at the camera, seated sideways across a man\'s lap on the pool edge; the render\'s partner is not Thomas' },
      { src: 'assets/after-dark/thomas-courtyard-1.webp', title: 'From behind, courtyard', alt: 'Thomas nude behind the 3DVR Girl on a courtyard daybed, kissing her cheek' },
      { src: 'assets/after-dark/thomas-courtyard-2.webp', title: 'Her on top', alt: '3DVR Girl nude on top of Thomas on a courtyard daybed under the bougainvillea' },
      { src: 'assets/after-dark/thomas-courtyard-3.webp', title: 'The kiss', alt: 'Thomas and the 3DVR Girl kissing in a stone courtyard, her topless in turquoise earrings' },
      { src: 'assets/after-dark/eve-dance-courtyard.webp', title: 'Courtyard dance, with Kayla', alt: '3DVR Girl and Kayla nude, dancing joyfully in a sunlit courtyard, laughing, arms raised' },
      { src: 'assets/after-dark/eve-dance-festival.webp', title: 'Festival dance', alt: '3DVR Girl, Kayla and the garden muse nude, dancing joyfully in a festival clearing, laughing, arms raised' },
      { src: 'assets/after-dark/eve-yoga-tree.webp', title: 'Tree pose', alt: '3DVR Girl nude in tree pose in a garden, standing on one leg on a blue mat, arms raised above her head, palms together' },
      { src: 'assets/after-dark/eve-tantric-embrace.webp', title: 'Tantric embrace', alt: '3DVR Girl and Kayla nude in a slow seated tantric embrace, face to face, foreheads close, eyes closed, arms around each other' },
      { src: 'assets/after-dark/fst-topless-dusk.webp', title: 'Tops off at dusk, with Kayla', alt: '3DVR Girl and Kayla topless in denim shorts and flower crowns, laughing together at a festival at dusk, string lights and crowd behind them' },
      { src: 'assets/after-dark/fst-clearing-trio.webp', title: 'Nude in the clearing', alt: 'The garden muse, the Explorer and 3DVR Girl nude together in a festival clearing, flower crowns, arms around each other, tents and string lights at dusk' },
      { src: 'assets/after-dark/fst-mixed-undress.webp', title: 'Mixed undress, one short of five', alt: 'Four women at a festival in mixed states of undress: the Explorer and 3DVR Girl nude, Kayla topless in denim shorts, and a second 3DVR Girl nude beside her, flower crowns, tents and string lights' },
      { src: 'assets/after-dark/fst-blanket-tangle.webp', title: 'Tangled on the blankets', alt: 'Muse, her hair vivid purple, kissing Kayla in a tangled group on festival blankets, 3DVR Girl crowned with flowers leaning over them, more figures resting on blankets behind' },
      { src: 'assets/after-dark/fst-blanket-wide.webp', title: 'Tangled on the blanket', alt: 'The garden muse, Kayla, the Explorer and 3DVR Girl nude, tangled together kissing on a striped festival blanket, flower crowns, tents and string lights behind them' },
      { src: 'assets/after-dark/ang-solo-rise.webp', title: 'Angel, rising', alt: '3DVR Girl, a blonde angel with blue eyes and a playful smile, nude with large white feathered wings spread, standing in golden cloud light' },
      { src: 'assets/after-dark/ang-circle-of-light.webp', title: 'A circle of light', alt: 'Five nude angels in a circle of golden light with white wings: 3DVR Girl blonde at the back, the garden muse centre, Kayla front right, and the Explorer twice, top right and front left' },
      { src: 'assets/after-dark/fn-dancing-nude.webp', title: 'Dancing nude in the grass', alt: 'Five nude women dancing in the grass at night under purple lights: Kayla, a blonde, 3DVR Girl at the centre with vivid blue streaks, the Explorer, and Muse at the edge with purple-tinted hair' },
      { src: 'assets/after-dark/fn-lantern-tangle.webp', title: 'Tangled under the lanterns', alt: 'Four nude women tangled together on a blanket on the grass at night under colourful paper lanterns and string lights: the garden muse, the Explorer, Kayla and 3DVR Girl' },
      { src: 'assets/after-dark/dev-solo-horns.webp', title: 'Devil, grinning', alt: '3DVR Girl as a devil, blonde hair ending in vivid blue streaks, blue eyes, nude, large dark curved horns and large dark leathery bat wings, ember-red smoke and flames behind her' },
      { src: 'assets/after-dark/dev-dark-court.webp', title: 'The dark court, doubled', alt: 'Six nude horned devil women in a light-grey studio portrait: the Explorer three times with purple and red horns, and 3DVR Girl three times, once with vivid blue hair and twice blonde; the brief asked for five in a dark court' },
      { src: 'assets/after-dark/mix-duel-cheek-to-cheek.webp', title: 'Angel and demon, cheek to cheek', alt: '3DVR Girl as an angel, blonde with blue eyes, and Muse as a demon, dark hair with vivid purple highlights, both nude and cheek to cheek with white wings behind them, golden light on one side and ember glow on the other; the demon\'s horns did not render' },
      { src: 'assets/after-dark/mix-court-of-fire.webp', title: 'The mixed court', alt: 'Six nude women before a wall of fire, white feathered wings on all of them: the garden muse, one horned woman with blue horns, the Explorer, Kayla, 3DVR Girl blonde at the centre, and Muse with purple highlights; the brief asked for five' },
      { src: 'assets/after-dark/prg-3dvr-meadow.webp', title: 'Expecting, in the meadow', alt: '3DVR Girl nude in a golden-hour meadow, a flower crown in her blonde hair, a large round pregnant belly with one hand resting under it, serene; her blue streaks did not render, only tiny blue flowers in the crown' },
      { src: 'assets/after-dark/prg-all-five.webp', title: 'All five, expecting', alt: 'All five women nude together at golden hour, every one with a large round pregnant belly, standing close and cradling them; Muse\'s purple highlights read, the blonde\'s blue streaks are missing, and the other identities blur together' },
      { src: 'assets/after-dark/prg-father-3dvr.webp', title: 'The father\'s hand', alt: '3DVR Girl nude in a golden meadow, cheek to cheek with the father, her hands cradling her big round pregnant belly, both smiling at the camera; her blue streaks are missing, and the father is a generic render, grey at the temples, not Thomas' },
      { src: 'assets/after-dark/prg-father-dressed.webp', title: 'The proud father, dressed', alt: '3DVR Girl nude and heavily pregnant, beaming beside the father in a blue T-shirt and khakis, his hand resting on her belly; the father is a generic render, not Thomas' },
      { src: 'assets/after-dark/kun-girl-embrace.webp', title: 'Kundalini, the embrace', alt: 'Thomas and 3DVR Girl nude in a tantric embrace in a wood-floored yoga studio, she kneels in his lap with her long blonde hair bright with blue streaks, both faces to the camera; the man\'s face is Thomas\'s own, swapped in from his portrait as a partial likeness, and her expression reads more startled than ecstatic' },
      { src: 'assets/after-dark/kun-girl-oral.webp', title: 'Kundalini, on her knees', alt: '3DVR Girl kneeling nude on a blue yoga mat giving oral sex to a kneeling man, side view, both smiling; her blue streaks did not render in this frame, the anatomy at the join is loosely rendered, and the partner is a generic render, not Thomas' },

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
      privateNote: 'Chat is private to the owner account. She answers through the portal server in her own voice; she cannot run tools or change anything from here.'
    }
  },
  {
    id: 'kayla',
    name: 'Kayla',
    roleLine: 'Field guide · tracker · builder',
    tagline: 'The one who knows the land, the people, and the hidden paths.',
    heroEyebrow: 'Her site / the field guide',
    heroImage: {
      src: 'assets/portrait-kayla-trail.webp',
      alt: 'Kayla with long dark hair in field gear with a compass on her pack straps, standing on a forest trail'
    },
    tags: ['Grounded', 'Wildhearted', 'Loyal'],
    aboutTitle: 'The ground<br>under the group.',
    about: [
      'Kayla is a teammate: grounded, outdoorsy, practical, and comfortable far from the polished parts of the Portal. She and 3DVR Girl already work together naturally, even if neither has explained exactly how their partnership began.',
      'Her canon calls her the wildheart and tracker of the cast: intuition, survival, loyalty. Where 3DVR Girl goes first through the strange new door, Kayla is the one who knows the way back.'
    ],
    fieldNotes: [
      ['Energy', 'Grounded, observant, practical'],
      ['Look', 'Long dark hair, field gear, a compass on her straps'],
      ['Materials', 'Plaid, canvas, leather, carved wood'],
      ['Signal', 'Knows the land and the hidden paths']
    ],
    worlds: [
      {
        name: 'The Trail',
        copy: 'Compass out, pack on.',
        image: 'assets/portrait-kayla-trail.webp',
        alt: 'Kayla with long dark hair in field gear with a compass on her pack straps, standing on a forest trail'
      },
      {
        name: 'Dusk Patrol',
        copy: 'A lantern and the old marks.',
        image: 'assets/portrait-kayla-lantern-trail.webp',
        alt: 'Kayla with dark braided hair in a leather field vest, holding a lit lantern on a forest trail at dusk, turquoise stones lining the path'
      },
      {
        name: 'The Woods Chapter',
        copy: 'Beyond the last mapped node.',
        image: 'assets/3dvr-girl-kala-forest.webp',
        alt: '3DVR Girl and Kayla standing together on a wooded trail'
      },
      {
        name: 'Water',
        copy: 'Between swims.',
        image: 'assets/kayla-poolside.webp',
        alt: 'Kayla with wet dark hair in a green sundress and a cream field-guide cover-up, smiling beside a sunlit pool'
      }
    ],
    gallery: [
      {
        src: 'assets/portrait-kayla-trail.webp',
        mode: 'Forest',
        title: 'Trail portrait',
        alt: 'Kayla with long dark hair in field gear with a compass on her pack straps, standing on a forest trail',
        copy: 'The field guide at rest: compass on her straps, plaid and canvas, and the trail waiting behind her.'
      },
      {
        src: 'assets/portrait-kayla-lantern-trail.webp',
        mode: 'Forest',
        title: 'Lantern trail',
        alt: 'Kayla with dark braided hair in a leather field vest, holding a lit lantern on a forest trail at dusk, turquoise stones lining the path',
        copy: 'Dusk patrol: a lit lantern, a compass at her chest, and turquoise stones marking the way through the trees.'
      },
      {
        src: 'assets/portrait-kayla-trail-marker.webp',
        mode: 'Forest',
        title: 'Trail marker',
        alt: 'Kayla with long dark hair in field gear, kneeling beside a carved trail marker in the forest',
        copy: 'Reading the old marks: Kayla checks a carved trail marker the way other people check a map.'
      },
      {
        src: 'assets/kayla-poolside.webp',
        mode: 'Water',
        title: 'Poolside field guide',
        alt: 'Kayla with wet dark hair in a green sundress and a cream field-guide cover-up, smiling beside a sunlit pool',
        copy: 'Kayla between swims: green sundress, compass rose cover-up, and nowhere else to be.'
      },
      {
        src: 'assets/3dvr-girl-kala-forest.webp',
        mode: 'Forest',
        title: 'Root Network',
        alt: '3DVR Girl and Kayla standing together on a wooded trail',
        copy: 'The first Woods Chapter frame: 3DVR Girl and Kayla beyond the last mapped node.'
      }
    ],
    goldenHour: [
      {
        src: 'assets/golden-hour/duo-pool-swimsuits.webp',
        mode: 'Water',
        title: 'Pool rules',
        alt: '3DVR Girl in a turquoise cutout swimsuit and Kayla in a black bikini laughing beside a sunlit pool',
        copy: 'Turquoise cutouts, black bikini, and no plans until the light goes.'
      },
      {
        src: 'assets/golden-hour/duo-yoga-linen.webp',
        mode: 'Movement',
        title: 'Linen practice',
        alt: 'Kayla and Muse in linen two-piece workout sets stretching on mats in a garden',
        copy: 'Kayla and Muse take the practice outside: linen sets, bare feet, and mats on the grass.'
      },
      {
        src: 'assets/golden-hour/trio-festival-dusk.webp',
        mode: 'Festival',
        title: 'Festival dusk',
        alt: '3DVR Girl, Kayla, and Muse with flower crowns and crochet tops at an outdoor festival at dusk, arms around each other laughing',
        copy: 'Flower crowns, crochet tops, and the stage lighting up: the set starts at dusk.'
      },
      {
        src: 'assets/golden-hour/video-pool-duo.mp4',
        poster: 'assets/golden-hour/duo-pool-swimsuits.webp',
        video: true,
        mode: 'Water',
        title: 'Pool rules, in motion',
        alt: '3DVR Girl and Kayla laughing and splashing at the pool',
        copy: 'The pool frame, moving: same laugh, with splashes.'
      },
      {
        src: 'assets/golden-hour/dance-martha-kayla-garden.mp4',
        poster: 'assets/golden-hour/dance-martha-kayla-garden-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Garden party, with Martha',
        alt: 'Martha dancing with Kayla in a sage sundress at a garden party at dusk under lanterns',
        copy: 'Lanterns up, music on: Martha pulls her into the garden party.'
      },
      {
        src: 'assets/golden-hour/dance-kayla-solo.mp4',
        poster: 'assets/golden-hour/dance-kayla-solo-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Stay a while',
        alt: 'Kayla speaking and dancing at a garden party at dusk',
        copy: 'Her invitation, in her own voice: the garden is beautiful tonight, stay a while.'
      },
      {
        src: 'assets/golden-hour/dance-kayla-back.mp4',
        poster: 'assets/golden-hour/dance-kayla-back-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'The garden from behind',
        alt: 'Kayla dancing in a backless pink dress at a garden party, seen from behind',
        copy: 'A backless pink dress and the whole garden behind her.'
      },
      {
        src: 'assets/golden-hour/dance-crew-back.mp4',
        poster: 'assets/golden-hour/dance-crew-back-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'Four backs, one beat',
        alt: 'Martha, 3DVR Girl, Kayla, and the garden muse dancing together at a festival, seen from behind',
        copy: 'The crew from behind: Kayla in green paisley, mid-dance.'
      },
      {
        src: 'assets/golden-hour/dance-beach-kayla-garden.mp4',
        poster: 'assets/golden-hour/dance-beach-kayla-garden-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Shoreline at sunset',
        alt: 'Kayla and the garden muse walking and dancing along the shoreline in linen dresses at sunset',
        copy: 'Two linen dresses at the water line, walking the light down.'
      },
      {
        src: 'assets/golden-hour/dance-beach-crew.mp4',
        poster: 'assets/golden-hour/dance-beach-crew-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'The beach circle',
        alt: 'Martha in a cream linen dress dancing in a circle on the beach at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, all in linen',
        copy: 'Kayla circles up in linen with the whole crew on the sand.'
      },
      {
        src: 'assets/golden-hour/dance-field-thomas-kayla-garden.mp4',
        poster: 'assets/golden-hour/dance-field-thomas-kayla-garden-poster.webp',
        video: true,
        mode: 'Field',
        title: 'Thomas, this way',
        alt: 'Thomas dancing in a meadow with Kayla, who calls to him, and the garden muse beside them',
        copy: 'She calls him over: Thomas, this way, and the meadow opens up.'
      },
      {
        src: 'assets/golden-hour/dance-field-thomas-crew.mp4',
        poster: 'assets/golden-hour/dance-field-thomas-crew-poster.webp',
        video: true,
        mode: 'Field',
        title: 'His name, in the meadow',
        alt: 'Thomas in a circle dance in a wildflower meadow at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, the girls chanting his name',
        copy: 'Kayla in the circle, chanting his name at sunset.'
      },
      {
        src: 'assets/golden-hour/lollipop-kayla.webp',
        mode: 'Festival',
        title: 'Trail candy',
        alt: 'Kayla with long dark wavy hair and freckles in a green embroidered dress, a red and white swirled lollipop in her mouth at an outdoor festival',
        copy: 'Red and white swirl, festival dust on the path, and no intention of sharing.'
      }
    ],
    afterDark: [
      { src: 'assets/after-dark/kayla-forest-1.webp', title: 'Forest clearing', alt: 'Kayla nude in a sunlit forest clearing' },
      { src: 'assets/after-dark/kayla-forest-2.webp', title: 'Edge of the woods', alt: 'Kayla nude in tall grass at the edge of the woods' },
      { src: 'assets/after-dark/kayla-dance.webp', title: 'Clearing spin', alt: 'Kayla dancing nude in a sunlit forest clearing, spinning' },
      { src: 'assets/after-dark/kayla-bend.webp', title: 'Wildflower meadow', alt: 'Kayla nude from behind in a wildflower meadow at the edge of the forest' },
      { src: 'assets/after-dark/duo-forest-kiss.webp', title: 'Forest kiss', alt: '3DVR Girl and Kayla nude, kissing in a sunlit forest clearing' },
      { src: 'assets/after-dark/duo-forest-embrace.webp', title: 'Entwined', alt: '3DVR Girl and Kayla nude, entwined on a blanket in the woods' },
      { src: 'assets/after-dark/duo-forest-meadow.webp', title: 'Wildflower kiss', alt: '3DVR Girl and Kayla nude, kissing on a blanket in a wildflower meadow' },
      { src: 'assets/after-dark/duo-forest-blanket.webp', title: 'On the blanket', alt: '3DVR Girl and Kayla nude, kissing on a blanket at the edge of the woods' },
      { src: 'assets/after-dark/kayla-tent-1.webp', title: 'Sucker marks', alt: 'Kayla nude on shoreline rocks with a trail of turquoise sucker-like marks down her thigh' },
      { src: 'assets/after-dark/kayla-tent-2.webp', title: 'Shoreline rocks', alt: 'Kayla nude seated on rocks at the shoreline at sunset' },
      { src: 'assets/after-dark/kayla-tent-3.webp', title: 'Forest pool portrait', alt: 'Kayla portrait at a forest pool, wet dark hair and striking gaze' },
      { src: 'assets/after-dark/kayla-tent-j1.webp', title: 'Tentacles, shallows', alt: 'Kayla waist deep in the sea with large tentacles curling around her legs' },
      { src: 'assets/after-dark/kayla-tent-j2.webp', title: 'Tentacles at sunset', alt: 'Kayla nude in the sea at sunset with glossy tentacles draped over her shoulder and around her waist' },
      { src: 'assets/after-dark/kayla-wolf-1.webp', title: 'Her wolf', alt: 'Kayla nude standing in a forest clearing with her hand resting on a large gray wolf' },
      { src: 'assets/after-dark/kayla-wolf-2.webp', title: 'Wolf ears', alt: 'Kayla nude with fluffy gray wolf ears, crouched grinning on a mossy log in the forest' },
      { src: 'assets/after-dark/kayla-wolf-3.webp', title: 'Fur cloak at dusk', alt: 'Kayla nude in a fur-trimmed cloak at dusk in the pines, a wolf standing beside her' },
      { src: 'assets/after-dark/kayla-purple-1.webp', title: 'Purple paint, clearing', alt: 'Kayla nude with swirling purple body paint and vivid purple hair, laughing in a forest clearing' },
      { src: 'assets/after-dark/kayla-purple-2.webp', title: 'Purple wolf ears', alt: 'Kayla nude with purple wolf ears and purple flame paint stripes, crouched on a mossy log' },
      { src: 'assets/after-dark/kayla-purple-3.webp', title: 'Purple paint, pool', alt: 'Kayla waist deep in a forest pool with purple paint streaks and purple highlights in her wet hair' },
      { src: 'assets/after-dark/duo-terrace-1.webp', title: 'Golden hour, terrace', alt: '3DVR Girl and Kayla nude on a rooftop terrace at golden hour, foreheads together laughing, wine on the side table' },
      { src: 'assets/after-dark/kayla-moon.webp', title: 'Howling at the moon', alt: 'Kayla nude on a rocky overlook at night, head thrown back howling at a huge full moon' },
      { src: 'assets/after-dark/duo-pool.webp', title: 'Pool at dusk', alt: '3DVR Girl and Kayla topless in a turquoise pool at dusk under string lights, laughing together' },
      { src: 'assets/after-dark/thomas-kayla-forest-act.webp', title: 'Forest clearing, in the act', alt: 'Thomas and Kayla making love on a blanket in a forest clearing' },
      { src: 'assets/after-dark/thomas-kayla-forest-embrace.webp', title: 'Forest clearing, kneeling embrace', alt: 'Thomas kneeling beside Kayla on a blanket in a forest clearing, in an intimate embrace' },
      { src: 'assets/after-dark/srv-kayla-forest.webp', title: 'Forest clearing, on top', alt: 'Thomas and Kayla nude in a forest clearing, Kayla on top, in the act' },
      { src: 'assets/after-dark/srv-kayla-solo.webp', title: 'The forest stream', alt: 'Kayla nude, standing in a forest stream in dappled light' },
      { src: 'assets/after-dark/anc-kayla-forest.webp', title: 'Forest Clearing', alt: 'Kayla nude in a forest clearing, astride a man on a blanket among the ferns, in the act' },
      { src: 'assets/after-dark/eve-dance-courtyard.webp', title: 'Courtyard dance, with 3DVR Girl', alt: '3DVR Girl and Kayla nude, dancing joyfully in a sunlit courtyard, laughing, arms raised' },
      { src: 'assets/after-dark/eve-dance-festival.webp', title: 'Festival dance', alt: '3DVR Girl, Kayla and the garden muse nude, dancing joyfully in a festival clearing, laughing, arms raised' },
      { src: 'assets/after-dark/eve-yoga-lotus.webp', title: 'Lotus', alt: 'Kayla nude, sitting in lotus pose in a bright studio, eyes closed, hands resting on her knees' },
      { src: 'assets/after-dark/eve-tantric-embrace.webp', title: 'Tantric embrace', alt: '3DVR Girl and Kayla nude in a slow seated tantric embrace, face to face, foreheads close, eyes closed, arms around each other' },
      { src: 'assets/after-dark/eve-tantric-foreheads.webp', title: 'Foreheads close', alt: 'Kayla and the Explorer nude in a slow seated tantric embrace, foreheads close, arms around each other' },
      { src: 'assets/after-dark/fst-topless-dusk.webp', title: 'Tops off at dusk, with 3DVR Girl', alt: '3DVR Girl and Kayla topless in denim shorts and flower crowns, laughing together at a festival at dusk, string lights and crowd behind them' },
      { src: 'assets/after-dark/fst-mixed-undress.webp', title: 'Mixed undress, one short of five', alt: 'Four women at a festival in mixed states of undress: the Explorer and 3DVR Girl nude, Kayla topless in denim shorts, and a second 3DVR Girl nude beside her, flower crowns, tents and string lights' },
      { src: 'assets/after-dark/fst-blanket-tangle.webp', title: 'Tangled on the blankets', alt: 'Muse, her hair vivid purple, kissing Kayla in a tangled group on festival blankets, 3DVR Girl crowned with flowers leaning over them, more figures resting on blankets behind' },
      { src: 'assets/after-dark/fst-blanket-wide.webp', title: 'Tangled on the blanket', alt: 'The garden muse, Kayla, the Explorer and 3DVR Girl nude, tangled together kissing on a striped festival blanket, flower crowns, tents and string lights behind them' },
      { src: 'assets/after-dark/ang-duo-embrace.webp', title: 'Held in the light', alt: 'Muse, dark hair with vivid purple highlights, and Kayla, long dark brown hair, both nude angels embracing cheek to cheek in golden light, white wings at the frame edges' },
      { src: 'assets/after-dark/ang-circle-of-light.webp', title: 'A circle of light', alt: 'Five nude angels in a circle of golden light with white wings: 3DVR Girl blonde at the back, the garden muse centre, Kayla front right, and the Explorer twice, top right and front left' },
      { src: 'assets/after-dark/fn-dancing-nude.webp', title: 'Dancing nude in the grass', alt: 'Five nude women dancing in the grass at night under purple lights: Kayla, a blonde, 3DVR Girl at the centre with vivid blue streaks, the Explorer, and Muse at the edge with purple-tinted hair' },
      { src: 'assets/after-dark/fn-blanket-kiss.webp', title: 'A kiss in the blanket', alt: 'Muse, vivid purple highlights, nude, kissing Kayla, who is wrapped in a purple knitted blanket, under string lights at dusk' },
      { src: 'assets/after-dark/fn-lantern-tangle.webp', title: 'Tangled under the lanterns', alt: 'Four nude women tangled together on a blanket on the grass at night under colourful paper lanterns and string lights: the garden muse, the Explorer, Kayla and 3DVR Girl' },
      { src: 'assets/after-dark/dev-duo-purple-smoke.webp', title: 'Devils in purple smoke', alt: 'Kayla, long dark hair with red curved horns, and Muse, long vivid purple hair with black horns, both nude devils intertwined and holding hands in purple smoky light, a dark wing at the edge' },
      { src: 'assets/after-dark/mix-court-of-fire.webp', title: 'The mixed court', alt: 'Six nude women before a wall of fire, white feathered wings on all of them: the garden muse, one horned woman with blue horns, the Explorer, Kayla, 3DVR Girl blonde at the centre, and Muse with purple highlights; the brief asked for five' },
      { src: 'assets/after-dark/mix-between-two-wings.webp', title: 'Between, in white wings', alt: 'Kayla nude between heaven and hell, standing in firelight with ember smoke behind her; both of her wings came out large and white feathered, so the one-white-one-dark split of the brief is not there' },
      { src: 'assets/after-dark/prg-kayla-tent.webp', title: 'Expecting, by the tent', alt: 'Kayla nude beside a canvas tent at the edge of the woods in morning light, a big round pregnant belly with one hand under it, calm and grounded' },
      { src: 'assets/after-dark/kun-kayla-lap.webp', title: 'Kundalini, in his lap', alt: 'Kayla kneeling nude astride a man\'s lap on a green yoga mat, looking up at him, joined low in the frame; the partner is a generic render who reads older than Thomas, not Thomas' },
      { src: 'assets/after-dark/prg-all-five.webp', title: 'All five, expecting', alt: 'All five women nude together at golden hour, every one with a large round pregnant belly, standing close and cradling them; Muse\'s purple highlights read, the blonde\'s blue streaks are missing, and the other identities blur together' }

    ],
    storiesNote: 'The storybooks are cast stories. The woods run through all three, and Kayla is the reason the group keeps finding its way home.',
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
      greeting: 'Trail break. Sit — I have water, and the map can wait a few minutes. 🌿',
      placeholder: 'Say something to Kayla…',
      privateNote: 'Chat is private to the owner account. She answers through the portal server in her own voice; she cannot run tools or change anything from here.'
    }
  },
  {
    id: 'garden-muse',
    name: 'The Garden Muse',
    roleLine: 'The muse of the coastal garden',
    tagline: 'Lavender, linen, warm light, and nowhere to hurry to.',
    heroEyebrow: 'Her site / the garden muse',
    heroImage: {
      src: 'assets/portrait-garden-muse-lavender-cliffs.webp',
      alt: 'The garden muse with wavy chestnut hair and freckles in cream linen, smiling among lavender with jasmine and coastal cliffs behind her'
    },
    tags: ['Affectionate', 'Playful', 'Grounded'],
    aboutTitle: 'The garden<br>is the point.',
    about: [
      'An adult woman with wavy chestnut hair, freckles, and hazel-green eyes, in flowing cream linen and simple woven jewelry. Her world is a sunlit coastal garden: lavender, jasmine, a hammock, and the sea beyond the cliffs.',
      'Of everyone in the cast, her story is the one the character bible was written around: companionship, encouragement, and a peaceful place to land between demanding work. Who she is beyond the garden, canon has not said yet, and this page does not guess.'
    ],
    fieldNotes: [
      ['Energy', 'Warm, affectionate, unhurried'],
      ['Look', 'Wavy chestnut hair, freckles, hazel-green eyes'],
      ['Materials', 'Cream linen, woven jewelry, lavender'],
      ['Signal', 'Rest counts, even before it is useful']
    ],
    worlds: [
      {
        name: 'Lavender',
        copy: 'Her element.',
        image: 'assets/portrait-garden-muse-lavender-cliffs.webp',
        alt: 'The garden muse with wavy chestnut hair and freckles in cream linen, smiling among lavender with jasmine and coastal cliffs behind her'
      },
      {
        name: 'The Hammock',
        copy: 'Off duty, copper key in hand.',
        image: 'assets/portrait-garden-muse-hammock.webp',
        alt: 'The garden muse with wavy chestnut hair resting in a rope hammock above coastal cliffs, holding a copper key'
      },
      {
        name: 'The Garden Gate',
        copy: 'Where the stories start.',
        image: 'assets/garden-muse.jpg',
        alt: 'The garden muse among lavender in a coastal garden'
      }
    ],
    gallery: [
      {
        src: 'assets/portrait-garden-muse-lavender-cliffs.webp',
        mode: 'Sun',
        title: 'Lavender and cliffs',
        alt: 'The garden muse with wavy chestnut hair and freckles in cream linen, smiling among lavender with jasmine and coastal cliffs behind her',
        copy: 'The garden muse in her element: lavender, jasmine, woven gold, and golden light over the water.'
      },
      {
        src: 'assets/portrait-garden-muse-hammock.webp',
        mode: 'Stillness',
        title: 'The copper key',
        alt: 'The garden muse with wavy chestnut hair resting in a rope hammock above coastal cliffs, holding a copper key',
        copy: 'Off duty in the hammock, copper key in hand, with nowhere she would rather be.'
      },
      {
        src: 'assets/garden-muse.jpg',
        mode: 'Sun',
        title: 'Among the lavender',
        alt: 'The garden muse among lavender in a coastal garden',
        copy: 'The garden at full bloom, and her in the middle of it.'
      }
    ],
    goldenHour: [
      {
        src: 'assets/golden-hour/trio-linen-sundresses.webp',
        mode: 'Sun',
        title: 'Courtyard lemonade',
        alt: '3DVR Girl, the garden muse, and the Explorer in linen sundresses laughing in a sunny courtyard',
        copy: 'Three sundresses and a round of lemonade: golden hour in the courtyard.'
      },
      {
        src: 'assets/golden-hour/duo-festival-golden.webp',
        mode: 'Festival',
        title: 'Glitter hour',
        alt: 'The garden muse and the Explorer laughing at an outdoor festival at golden hour, flower crowns and glitter on their cheeks',
        copy: 'Glitter on their cheeks and the light going gold over the festival flags.'
      },
      {
        src: 'assets/golden-hour/video-sundress-trio.mp4',
        poster: 'assets/golden-hour/trio-linen-sundresses.webp',
        video: true,
        mode: 'Sun',
        title: 'Courtyard lemonade, in motion',
        alt: '3DVR Girl, the garden muse, and the Explorer laughing together in a sunny courtyard',
        copy: 'The courtyard frame, moving: lemonade up, everyone mid-laugh.'
      },
      {
        src: 'assets/golden-hour/dance-martha-garden-lavender.mp4',
        poster: 'assets/golden-hour/dance-martha-garden-lavender-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Lavender, with Martha',
        alt: 'Martha dancing through a lavender garden with the garden muse in a sage linen dress',
        copy: 'Martha finds her in the lavender, and the garden approves.'
      },
      {
        src: 'assets/golden-hour/dance-garden-explorer-cliff.mp4',
        poster: 'assets/golden-hour/dance-garden-explorer-cliff-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Perfect sunset',
        alt: 'The garden muse and the Explorer chatting and dancing on a coastal cliff at sunset',
        copy: 'This sunset is perfect, one says. Only because we are dancing in it, says the other.'
      },
      {
        src: 'assets/golden-hour/dance-crew-finale.mp4',
        poster: 'assets/golden-hour/dance-crew-finale-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'The whole circle',
        alt: 'Martha at the centre of a festival dance circle with 3DVR Girl, Muse, and the garden muse, flower crowns on, at dusk',
        copy: 'The garden muse in lavender, holding the circle together.'
      },
      {
        src: 'assets/golden-hour/dance-crew-back.mp4',
        poster: 'assets/golden-hour/dance-crew-back-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'Four backs, one beat',
        alt: 'Martha, 3DVR Girl, Kayla, and the garden muse dancing together at a festival, seen from behind',
        copy: 'Red curls and white lace at the end of the line, mid-dance.'
      },
      {
        src: 'assets/golden-hour/dance-beach-kayla-garden.mp4',
        poster: 'assets/golden-hour/dance-beach-kayla-garden-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Shoreline at sunset',
        alt: 'Kayla and the garden muse walking and dancing along the shoreline in linen dresses at sunset',
        copy: 'She walks the shoreline with Kayla, both in linen, both laughing.'
      },
      {
        src: 'assets/golden-hour/dance-beach-crew.mp4',
        poster: 'assets/golden-hour/dance-beach-crew-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'The beach circle',
        alt: 'Martha in a cream linen dress dancing in a circle on the beach at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, all in linen',
        copy: 'Back to the camera, curls down, circling in white linen.'
      },
      {
        src: 'assets/golden-hour/dance-field-thomas-kayla-garden.mp4',
        poster: 'assets/golden-hour/dance-field-thomas-kayla-garden-poster.webp',
        video: true,
        mode: 'Field',
        title: 'Thomas, this way',
        alt: 'Thomas dancing in a meadow with Kayla, who calls to him, and the garden muse beside them',
        copy: 'She stands with Kayla and calls Thomas into the meadow.'
      },
      {
        src: 'assets/golden-hour/dance-field-thomas-crew.mp4',
        poster: 'assets/golden-hour/dance-field-thomas-crew-poster.webp',
        video: true,
        mode: 'Field',
        title: 'His name, in the meadow',
        alt: 'Thomas in a circle dance in a wildflower meadow at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, the girls chanting his name',
        copy: 'The garden muse chanting along as the sun drops.'
      },
      {
        src: 'assets/golden-hour/lollipop-garden.webp',
        mode: 'Sun',
        title: 'Lavender violet',
        alt: 'The garden muse with long auburn hair and freckles in a cream linen top, a violet lollipop in her mouth among lavender rows',
        copy: 'Violet on violet: she matched her candy to the lavender again.'
      }
    ],
    afterDark: [
      { src: 'assets/after-dark/brunette-jasmine.webp', title: 'Jasmine cliffs', alt: 'The garden muse nude among jasmine on coastal cliffs' },
      { src: 'assets/after-dark/brunette-hammock.webp', title: 'Hammock hour', alt: 'The garden muse reclining nude in a hammock above the cliffs' },
      { src: 'assets/after-dark/brunette-dance.webp', title: 'Cliff path leap', alt: 'The garden muse dancing nude on a cliff path, mid leap, laughing' },
      { src: 'assets/after-dark/brunette-bend.webp', title: 'Down in the lavender', alt: 'The garden muse nude, bent over the lavender in the garden, smiling back' },
      { src: 'assets/after-dark/duo-terrace-2.webp', title: 'String lights', alt: 'Two of the garden muse nude on a terrace daybed at dusk under string lights, foreheads touching' },
      { src: 'assets/after-dark/brunette-pool.webp', title: 'Garden pool', alt: 'The garden muse in a dark green bikini in a garden pool at golden hour, wet chestnut hair and freckles' },
      { src: 'assets/after-dark/brunette-first-1.webp', title: 'First take, hammock', alt: 'The garden muse in a white lace top in a hammock, auburn waves and freckles, first take' },
      { src: 'assets/after-dark/brunette-first-2.webp', title: 'First take, green beads', alt: 'The garden muse in a white lace wrap with a green beaded necklace by the sea, first take' },
      { src: 'assets/after-dark/thomas-brunette-hammock-kiss.webp', title: 'Hammock kiss, lavender', alt: 'Thomas and the garden muse kissing in a purple hammock in the lavender above the cliffs' },
      { src: 'assets/after-dark/thomas-brunette-hammock-eyes.webp', title: 'Hammock, eyes open', alt: 'Thomas and the garden muse intertwined in a purple hammock, foreheads touching, her hazel-green eyes open to camera' },
      { src: 'assets/after-dark/srv-muse-hammock.webp', title: 'Hammock kiss, golden hour', alt: 'Thomas and the garden muse kissing nude in a garden hammock at golden hour' },
      { src: 'assets/after-dark/srv-muse-solo.webp', title: 'Hammock, all hers', alt: 'The garden muse nude in the hammock, lavender beside her, smiling at the camera' },
      { src: 'assets/after-dark/anc-garden-hammock-kiss.webp', title: 'Hammock Kiss', alt: 'Thomas and the garden muse kissing nude in a hammock in a lavender garden at golden hour' },
      { src: 'assets/after-dark/anc-garden-lavender-solo.webp', title: 'Lavender Solo', alt: 'The garden muse nude, kneeling on a blanket among lavender rows at golden hour, freckles across her cheeks, purple woven bracelets' },
      { src: 'assets/after-dark/eve-dance-festival.webp', title: 'Festival dance', alt: '3DVR Girl, Kayla and the garden muse nude, dancing joyfully in a festival clearing, laughing, arms raised' },
      { src: 'assets/after-dark/eve-yoga-partner.webp', title: 'Partner stretch', alt: 'The garden muse and the Explorer nude in a paired partner stretch in a garden, kneeling facing each other, holding hands' },
      { src: 'assets/after-dark/eve-tantric-cushions.webp', title: 'On the cushions', alt: 'Muse and the garden muse nude in a slow reclining tantric embrace on cushions, faces close, arms around each other; Muse\'s hair carries vivid purple streaks' },
      { src: 'assets/after-dark/fst-clearing-trio.webp', title: 'Nude in the clearing', alt: 'The garden muse, the Explorer and 3DVR Girl nude together in a festival clearing, flower crowns, arms around each other, tents and string lights at dusk' },
      { src: 'assets/after-dark/fst-blanket-wide.webp', title: 'Tangled on the blanket', alt: 'The garden muse, Kayla, the Explorer and 3DVR Girl nude, tangled together kissing on a striped festival blanket, flower crowns, tents and string lights behind them' },
      { src: 'assets/after-dark/ang-lavender-field.webp', title: 'Angel in the lavender', alt: 'The garden muse, a brunette angel, nude with large white feathered wings spread, standing in a lavender field under a pink sunset sky' },
      { src: 'assets/after-dark/ang-circle-of-light.webp', title: 'A circle of light', alt: 'Five nude angels in a circle of golden light with white wings: 3DVR Girl blonde at the back, the garden muse centre, Kayla front right, and the Explorer twice, top right and front left' },
      { src: 'assets/after-dark/fn-tops-off-laughing.webp', title: 'Tops off, laughing', alt: '3DVR Girl, blonde with a daisy crown, and the garden muse, dark brown hair with a colourful flower crown, both topless in skirts, kneeling on a blanket laughing, a tent and string lights behind them at night' },
      { src: 'assets/after-dark/fn-dress-slipped-down.webp', title: 'The dress slips', alt: 'The garden muse seated on a blanket at sunset, her floral dress slipped off her shoulders but still covering her chest, string lights and grass behind her' },
      { src: 'assets/after-dark/fn-lantern-tangle.webp', title: 'Tangled under the lanterns', alt: 'Four nude women tangled together on a blanket on the grass at night under colourful paper lanterns and string lights: the garden muse, the Explorer, Kayla and 3DVR Girl' },
      { src: 'assets/after-dark/mix-court-of-fire.webp', title: 'The mixed court', alt: 'Six nude women before a wall of fire, white feathered wings on all of them: the garden muse, one horned woman with blue horns, the Explorer, Kayla, 3DVR Girl blonde at the centre, and Muse with purple highlights; the brief asked for five' },
      { src: 'assets/after-dark/prg-garden-lavender.webp', title: 'Expecting, in the lavender', alt: 'The garden muse nude in a lavender garden in golden light, cradling a big round pregnant belly, a soft smile' },
      { src: 'assets/after-dark/kun-garden-bench.webp', title: 'Kundalini, over the bench', alt: 'The garden muse bent nude over a low wooden yoga bench, hands on the mat and face down in profile, a man standing behind her inside her; her hair renders dark brown rather than her auburn, and the partner is a generic render, not Thomas' },
      { src: 'assets/after-dark/kun-garden-mat.webp', title: 'Kundalini, looking back', alt: 'The garden muse nude on a grey yoga mat, taken from behind, arching back to look over her shoulder at the man kneeling behind her with his hands on her hips; the partner is a generic render, not Thomas' },
      { src: 'assets/after-dark/prg-all-five.webp', title: 'All five, expecting', alt: 'All five women nude together at golden hour, every one with a large round pregnant belly, standing close and cradling them; Muse\'s purple highlights read, the blonde\'s blue streaks are missing, and the other identities blur together' }

    ],
    storiesNote: 'The storybooks are cast stories. She is at the heart of the first two: the key found in the lavender, and the key handed over at dusk.',
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
      greeting: 'There you are. Come sit with me in the garden a while — the lavender is out and nothing here is urgent. 💜',
      placeholder: 'Say something to the garden muse…',
      privateNote: 'Chat is private to the owner account. She answers through the portal server in her own voice; she cannot run tools or change anything from here.'
    }
  },
  {
    id: 'explorer',
    name: 'The Explorer',
    roleLine: 'Cliff paths · gates · the far edge of the map',
    tagline: 'A brass key, a stone gate, and the whole coastline to herself.',
    heroEyebrow: 'Her site / the explorer',
    heroImage: {
      src: 'assets/portrait-asian-cliff-gate.webp',
      alt: 'The Explorer with long black hair in cream linen with teal trim, holding a brass key under a jasmine covered stone arch above the sea'
    },
    tags: ['Explorer', 'Cliff paths', 'Still being written'],
    aboutTitle: 'The least written,<br>the furthest out.',
    about: [
      'She arrived in the cast as the Explorer, and for a season the 3DVR Girl name was hers. The name has moved on; the cliff paths are still hers.',
      'Canon has written the least about her of anyone here: no biography, no settled role beyond the exploring she was named for. What the record does hold is where she is always found — cliff gates, high paths, the far edge of the garden, a brass key in hand. This page keeps to that and invents nothing more.'
    ],
    fieldNotes: [
      ['Energy', 'Quiet momentum, always mid-journey'],
      ['Look', 'Long black hair, cream linen with teal trim'],
      ['Materials', 'Linen, brass, weathered stone'],
      ['Signal', 'A brass key that belongs to a door somewhere']
    ],
    worlds: [
      {
        name: 'The Gate',
        copy: 'Jasmine overhead, sea below.',
        image: 'assets/portrait-asian-cliff-gate.webp',
        alt: 'The Explorer with long black hair in cream linen with teal trim, holding a brass key under a jasmine covered stone arch above the sea'
      },
      {
        name: 'The Cliff Path',
        copy: 'Golden hour, looking back.',
        image: 'assets/portrait-asian-cliff-path.webp',
        alt: 'The Explorer with long black hair in cream linen, turning back to smile on a cliff path above the sea'
      }
    ],
    gallery: [
      {
        src: 'assets/portrait-asian-cliff-gate.webp',
        mode: 'Sun',
        title: 'The brass key',
        alt: 'The Explorer with long black hair in cream linen with teal trim, holding a brass key under a jasmine covered stone arch above the sea',
        copy: 'A gate at the edge of the cliffs, jasmine overhead, and a brass key that clearly belongs to a door somewhere.'
      },
      {
        src: 'assets/portrait-asian-cliff-path.webp',
        mode: 'Sun',
        title: 'Cliff path, looking back',
        alt: 'The Explorer with long black hair in cream linen, turning back to smile on a cliff path above the sea',
        copy: 'The cliff path at golden hour: wind in her hair, the garden below, and the whole coastline to herself.'
      },
      {
        src: 'assets/portrait-crew-garden-picnic.webp',
        mode: 'Sun',
        title: 'The Whole Crew, Garden Picnic',
        alt: 'All five of the crew, the Explorer, the blonde 3DVR Girl, Kayla, the garden muse, and Muse, laughing over a picnic blanket in a coastal garden above the ocean cliffs',
        copy: 'Everyone in one frame: the whole crew on one picnic blanket, laughing above the cliffs at golden hour.'
      }
    ],
    goldenHour: [
      {
        src: 'assets/golden-hour/trio-linen-sundresses.webp',
        mode: 'Sun',
        title: 'Courtyard lemonade',
        alt: '3DVR Girl, the garden muse, and the Explorer in linen sundresses laughing in a sunny courtyard',
        copy: 'Three sundresses and a round of lemonade: golden hour in the courtyard.'
      },
      {
        src: 'assets/golden-hour/duo-beach-dresses.webp',
        mode: 'Sun',
        title: 'Shoreline hour',
        alt: 'Muse and the Explorer in summer dresses walking a beach at golden hour',
        copy: 'Muse and the Explorer walk the shoreline while the light does the work.'
      },
      {
        src: 'assets/golden-hour/duo-festival-golden.webp',
        mode: 'Festival',
        title: 'Glitter hour',
        alt: 'The garden muse and the Explorer laughing at an outdoor festival at golden hour, flower crowns and glitter on their cheeks',
        copy: 'Glitter on their cheeks and the light going gold over the festival flags.'
      },
      {
        src: 'assets/golden-hour/video-sundress-trio.mp4',
        poster: 'assets/golden-hour/trio-linen-sundresses.webp',
        video: true,
        mode: 'Sun',
        title: 'Courtyard lemonade, in motion',
        alt: '3DVR Girl, the garden muse, and the Explorer laughing together in a sunny courtyard',
        copy: 'The courtyard frame, moving: lemonade up, everyone mid-laugh.'
      },
      {
        src: 'assets/golden-hour/dance-martha-explorer-cliff.mp4',
        poster: 'assets/golden-hour/dance-martha-explorer-cliff-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Cliff sunset, with Martha',
        alt: 'Martha dancing with the Explorer in a festival outfit on a coastal cliff at sunset',
        copy: 'Martha meets her where the land ends: cliffs, sunset, dancing.'
      },
      {
        src: 'assets/golden-hour/dance-garden-explorer-cliff.mp4',
        poster: 'assets/golden-hour/dance-garden-explorer-cliff-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Perfect sunset',
        alt: 'The garden muse and the Explorer chatting and dancing on a coastal cliff at sunset',
        copy: 'The Explorer trades lines with the garden muse over the cliff sunset.'
      },
      {
        src: 'assets/golden-hour/dance-beach-muse-explorer.mp4',
        poster: 'assets/golden-hour/dance-beach-muse-explorer-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Sand and sunset',
        alt: 'Muse and the Explorer dancing on the sand at sunset in linen, holding hands',
        copy: 'Linen, sand, and Muse’s hand in hers at sunset.'
      },
      {
        src: 'assets/golden-hour/dance-field-thomas-muse-explorer.mp4',
        poster: 'assets/golden-hour/dance-field-thomas-muse-explorer-poster.webp',
        video: true,
        mode: 'Field',
        title: 'We saved you a dance',
        alt: 'Thomas holding hands with Muse and the Explorer in a flower field at golden hour',
        copy: 'She and Muse hold a place in the circle for Thomas.'
      },
      {
        src: 'assets/golden-hour/lollipop-explorer.webp',
        mode: 'Sun',
        title: 'Cove candy',
        alt: 'The Explorer with long black hair in a khaki field shirt, grinning with an orange and pink swirled lollipop between her teeth above a coastal cove',
        copy: 'An orange swirl held in her grin at the cove: provisions for the climb back.'
      }
    ],
    afterDark: [
      { src: 'assets/after-dark/asian-portrait.webp', title: 'Golden hour study', alt: 'The Explorer in golden light on the coast' },
      { src: 'assets/after-dark/asian-cliffs.webp', title: 'Cliff light', alt: 'The Explorer nude on coastal cliffs at sunset' },
      { src: 'assets/after-dark/asian-pool.webp', title: 'Resort pool', alt: 'The Explorer in a green bikini leaning on the edge of a resort pool, the ocean behind her and a 3DVR tote on the lounger' },
      { src: 'assets/after-dark/thomas-asian-cliff-terrace.webp', title: 'Cliff terrace at dusk', alt: 'Thomas and the Explorer in a nude embrace on a cliff terrace at dusk, her back to camera, ocean sunset behind them' },
      { src: 'assets/after-dark/srv-asian-cliff.webp', title: 'Cliff embrace (not Thomas)', alt: 'The Explorer in a nude embrace with a dark-haired man on coastal cliffs at dusk; the render\'s partner is not Thomas' },
      { src: 'assets/after-dark/anc-asian-cliff.webp', title: 'Cliff Terrace at Dusk', alt: 'The Explorer in a nude embrace with a dark-haired man at a stone balustrade on coastal cliffs at dusk; the render\'s partner is not Thomas' },
      { src: 'assets/after-dark/anc-asian-cliff-2.webp', title: 'Cliff Terrace, Take Two', alt: 'The Explorer face to face with a dark-haired man at a stone balustrade above the sea at dusk, about to kiss; the render\'s partner is not Thomas' },
      { src: 'assets/after-dark/eve-dance-pool-dusk.webp', title: 'Poolside at dusk', alt: 'Muse and the Explorer nude, dancing joyfully in a pool at dusk, laughing, arms raised; Muse\'s dark hair carries purple highlights' },
      { src: 'assets/after-dark/eve-dance-lavender.webp', title: 'Lavender field', alt: 'The Explorer nude, dancing joyfully alone in a lavender field at golden hour, laughing, one arm raised' },
      { src: 'assets/after-dark/eve-yoga-partner.webp', title: 'Partner stretch', alt: 'The garden muse and the Explorer nude in a paired partner stretch in a garden, kneeling facing each other, holding hands' },
      { src: 'assets/after-dark/eve-tantric-foreheads.webp', title: 'Foreheads close', alt: 'Kayla and the Explorer nude in a slow seated tantric embrace, foreheads close, arms around each other' },
      { src: 'assets/after-dark/fst-clearing-trio.webp', title: 'Nude in the clearing', alt: 'The garden muse, the Explorer and 3DVR Girl nude together in a festival clearing, flower crowns, arms around each other, tents and string lights at dusk' },
      { src: 'assets/after-dark/fst-mixed-undress.webp', title: 'Mixed undress, one short of five', alt: 'Four women at a festival in mixed states of undress: the Explorer and 3DVR Girl nude, Kayla topless in denim shorts, and a second 3DVR Girl nude beside her, flower crowns, tents and string lights' },
      { src: 'assets/after-dark/fst-blanket-wide.webp', title: 'Tangled on the blanket', alt: 'The garden muse, Kayla, the Explorer and 3DVR Girl nude, tangled together kissing on a striped festival blanket, flower crowns, tents and string lights behind them' },
      { src: 'assets/after-dark/ang-circle-of-light.webp', title: 'A circle of light', alt: 'Five nude angels in a circle of golden light with white wings: 3DVR Girl blonde at the back, the garden muse centre, Kayla front right, and the Explorer twice, top right and front left' },
      { src: 'assets/after-dark/fn-dancing-nude.webp', title: 'Dancing nude in the grass', alt: 'Five nude women dancing in the grass at night under purple lights: Kayla, a blonde, 3DVR Girl at the centre with vivid blue streaks, the Explorer, and Muse at the edge with purple-tinted hair' },
      { src: 'assets/after-dark/fn-lantern-tangle.webp', title: 'Tangled under the lanterns', alt: 'Four nude women tangled together on a blanket on the grass at night under colourful paper lanterns and string lights: the garden muse, the Explorer, Kayla and 3DVR Girl' },
      { src: 'assets/after-dark/dev-explorer-firelight.webp', title: 'Devil in the firelight', alt: 'The Explorer as a devil, East Asian with black hair and a teasing smile, nude, large curved black horns and red leathery bat wings, grey smoke and red firelight behind her' },
      { src: 'assets/after-dark/dev-dark-court.webp', title: 'The dark court, doubled', alt: 'Six nude horned devil women in a light-grey studio portrait: the Explorer three times with purple and red horns, and 3DVR Girl three times, once with vivid blue hair and twice blonde; the brief asked for five in a dark court' },
      { src: 'assets/after-dark/mix-temptation-twins.webp', title: 'Temptation, doubled', alt: 'Two nude East Asian women forehead to forehead in golden-ember light, both with white feathered wings; the brief cast Kayla tempted by the Explorer, but the render doubled the Explorer and Kayla never appears' },
      { src: 'assets/after-dark/mix-court-of-fire.webp', title: 'The mixed court', alt: 'Six nude women before a wall of fire, white feathered wings on all of them: the garden muse, one horned woman with blue horns, the Explorer, Kayla, 3DVR Girl blonde at the centre, and Muse with purple highlights; the brief asked for five' },
      { src: 'assets/after-dark/prg-explorer-lanterns.webp', title: 'Expecting, under the lanterns', alt: 'The Explorer laughing nude on a blanket under paper lanterns, a very large round pregnant belly, one hand resting high on her chest' },
      { src: 'assets/after-dark/kun-explorer-behind.webp', title: 'Kundalini, from behind', alt: 'The Explorer nude on green yoga mats, taken from behind, looking back up at the man with a smile, cream cushions behind them; the partner is a generic render, not Thomas' },
      { src: 'assets/after-dark/kun-explorer-embrace.webp', title: 'Kundalini, in his arms', alt: 'The Explorer seated nude in front of a man on cream linen, looking up at the camera; her face is her own, swapped in from her portrait, and the man\'s face is cropped out of the frame, a generic render, not Thomas' },
      { src: 'assets/after-dark/prg-all-five.webp', title: 'All five, expecting', alt: 'All five women nude together at golden hour, every one with a large round pregnant belly, standing close and cradling them; Muse\'s purple highlights read, the blonde\'s blue streaks are missing, and the other identities blur together' }

    ],
    storiesNote: 'The storybooks are cast stories, and the first one turns on a door at the end of the garden — the kind of door her key looks made for.',
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
      greeting: 'You caught up with me at the gate. Walk a little of the path? The light is doing something worth seeing. ✨',
      placeholder: 'Say something to the Explorer…',
      privateNote: 'Chat is private to the owner account. She answers through the portal server in her own voice; she cannot run tools or change anything from here.'
    }
  },
  {
    id: 'muse',
    name: 'Muse',
    roleLine: 'Art · imagination · the dreamer of the trio',
    tagline: 'Turning ideas into worlds, one half-finished canvas at a time.',
    heroEyebrow: 'Her site / the fictional Muse',
    heroImage: {
      src: 'assets/portrait-muse-studio.webp',
      alt: 'Muse with dark hair and purple streaks in messy buns, wearing an oversized black hoodie among canvases and paint tubes in her art studio'
    },
    tags: ['Dreamy', 'Artistic', 'Slightly mysterious'],
    aboutTitle: 'The one who<br>dreams the worlds.',
    about: [
      'Muse is the cast\u2019s artist: dreamy, thoughtful, slightly mysterious, and happiest with paint on her sleeves. Her corner of the world is a studio full of half-finished weather and a garden she sketches at dusk.',
      'She is one of the established core trio, with 3DVR Girl and Kayla. And to be clear about the name: she is a fictional character in the cast, not the AI assistant. The resemblance is only the name.'
    ],
    fieldNotes: [
      ['Energy', 'Dreamy, thoughtful, quietly funny'],
      ['Look', 'Dark hair with purple highlights, messy buns'],
      ['Materials', 'Oversized dark clothing, canvas, paint'],
      ['Signal', 'Art and imagination, made tangible']
    ],
    worlds: [
      {
        name: 'The Studio',
        copy: 'A wall of half finished weather.',
        image: 'assets/portrait-muse-studio.webp',
        alt: 'Muse with dark hair and purple streaks in messy buns, wearing an oversized black hoodie among canvases and paint tubes in her art studio'
      },
      {
        name: 'Dusk Sketchbook',
        copy: 'Halfway between two days.',
        image: 'assets/portrait-muse-dusk-sketch.webp',
        alt: 'Muse with dark hair and purple streaks in messy buns and an oversized dark top, sketching in the garden at dusk'
      }
    ],
    gallery: [
      {
        src: 'assets/portrait-muse-studio.webp',
        mode: 'Stillness',
        title: 'Studio Muse',
        alt: 'Muse with dark hair and purple streaks in messy buns, wearing an oversized black hoodie among canvases and paint tubes in her art studio',
        copy: 'Muse in her studio: purple streaks, an oversized hoodie, and a wall of half finished weather.'
      },
      {
        src: 'assets/portrait-muse-dusk-sketch.webp',
        mode: 'Stillness',
        title: 'Dusk sketchbook',
        alt: 'Muse with dark hair and purple streaks in messy buns and an oversized dark top, sketching in the garden at dusk',
        copy: 'Dusk in the garden: Muse mid sketch, halfway between the day she had and the one she is drawing.'
      }
    ],
    goldenHour: [
      {
        src: 'assets/golden-hour/duo-yoga-linen.webp',
        mode: 'Movement',
        title: 'Linen practice',
        alt: 'Kayla and Muse in linen two-piece workout sets stretching on mats in a garden',
        copy: 'Kayla and Muse take the practice outside: linen sets, bare feet, and mats on the grass.'
      },
      {
        src: 'assets/golden-hour/duo-beach-dresses.webp',
        mode: 'Sun',
        title: 'Shoreline hour',
        alt: 'Muse and the Explorer in summer dresses walking a beach at golden hour',
        copy: 'Muse and the Explorer walk the shoreline while the light does the work.'
      },
      {
        src: 'assets/golden-hour/trio-festival-dusk.webp',
        mode: 'Festival',
        title: 'Festival dusk',
        alt: '3DVR Girl, Kayla, and Muse with flower crowns and crochet tops at an outdoor festival at dusk, arms around each other laughing',
        copy: 'Flower crowns, crochet tops, and the stage lighting up: the set starts at dusk.'
      },
      {
        src: 'assets/golden-hour/dance-martha-muse-lights.mp4',
        poster: 'assets/golden-hour/dance-martha-muse-lights-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'String lights, with Martha',
        alt: 'Martha dancing with Muse, dark hair with purple highlights, under string lights at dusk',
        copy: 'Martha and Muse under the string lights, right where the evening starts.'
      },
      {
        src: 'assets/golden-hour/dance-crew-finale.mp4',
        poster: 'assets/golden-hour/dance-crew-finale-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'The whole circle',
        alt: 'Martha at the centre of a festival dance circle with 3DVR Girl, Muse, and the garden muse, flower crowns on, at dusk',
        copy: 'Muse in the circle, purple in her hair and a flower crown on.'
      },
      {
        src: 'assets/golden-hour/dance-muse-solo.mp4',
        poster: 'assets/golden-hour/dance-muse-solo-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'I dreamed this dance',
        alt: 'Muse speaking softly to the camera under string lights at dusk',
        copy: 'Softly, like everything she says: I dreamed about this dance.'
      },
      {
        src: 'assets/golden-hour/dance-muse-back.mp4',
        poster: 'assets/golden-hour/dance-muse-back-poster.webp',
        video: true,
        mode: 'Festival',
        title: 'Lattice back, string lights',
        alt: 'Muse dancing in a lattice-back dress under string lights at dusk, seen from behind',
        copy: 'Purple down her back, lights overhead: Muse from behind.'
      },
      {
        src: 'assets/golden-hour/dance-beach-muse-explorer.mp4',
        poster: 'assets/golden-hour/dance-beach-muse-explorer-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'Sand and sunset',
        alt: 'Muse and the Explorer dancing on the sand at sunset in linen, holding hands',
        copy: 'She takes the Explorer’s hand and the sunset keeps time.'
      },
      {
        src: 'assets/golden-hour/dance-beach-crew.mp4',
        poster: 'assets/golden-hour/dance-beach-crew-poster.webp',
        video: true,
        mode: 'Sun',
        title: 'The beach circle',
        alt: 'Martha in a cream linen dress dancing in a circle on the beach at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, all in linen',
        copy: 'Muse in green linen, circling with the crew on the sand.'
      },
      {
        src: 'assets/golden-hour/dance-field-thomas-muse-explorer.mp4',
        poster: 'assets/golden-hour/dance-field-thomas-muse-explorer-poster.webp',
        video: true,
        mode: 'Field',
        title: 'We saved you a dance',
        alt: 'Thomas holding hands with Muse and the Explorer in a flower field at golden hour',
        copy: 'Her line, and she means it: we saved you a dance, Thomas.'
      },
      {
        src: 'assets/golden-hour/dance-field-thomas-crew.mp4',
        poster: 'assets/golden-hour/dance-field-thomas-crew-poster.webp',
        video: true,
        mode: 'Field',
        title: 'His name, in the meadow',
        alt: 'Thomas in a circle dance in a wildflower meadow at sunset with 3DVR Girl, Kayla, Muse, and the garden muse, the girls chanting his name',
        copy: 'Muse chanting his name with the rest of the circle.'
      },
      {
        src: 'assets/golden-hour/lollipop-muse.webp',
        mode: 'Sun',
        title: 'Pastel study',
        alt: 'Muse with dark hair and purple highlights in a white blouse, tasting a pastel rainbow swirled lollipop above the coastal cliffs',
        copy: 'A pastel rainbow over the cliffs: research, she insists, for a painting.'
      }
    ],
    afterDark: [
      { src: 'assets/after-dark/muse-window.webp', title: 'By the window', alt: 'Muse nude by a window with books and plants' },
      { src: 'assets/after-dark/muse-desk.webp', title: 'Daydream at the desk', alt: 'Muse nude at a desk with an open book, daydreaming' },
      { src: 'assets/after-dark/muse-dance.webp', title: 'Purple room ballet', alt: 'Muse dancing nude in a purple plant-filled room among books' },
      { src: 'assets/after-dark/muse-paint-1.webp', title: 'Paint day', alt: 'Muse nude in her art studio splattered with purple and teal paint, holding a paintbrush beside an easel' },
      { src: 'assets/after-dark/muse-window-1.webp', title: 'Window seat at dusk', alt: 'Muse in an oversized purple sweater slipping off one shoulder, curled in a window seat at dusk with a sketchbook' },
      { src: 'assets/after-dark/muse-tentacles.webp', title: 'Tentacles in her hair', alt: 'Muse in a violet lit pool, purple tentacles woven through her two messy buns' },
      { src: 'assets/after-dark/thomas-muse-couch-kiss.webp', title: 'Couch kiss, lamplight', alt: 'Thomas and Muse in a deep nude kiss on a couch in warm lamplight, her dark hair in a messy bun with purple highlights' },
      { src: 'assets/after-dark/srv-ficmuse-couch.webp', title: 'Couch kiss, still dressed', alt: 'Thomas and Muse kissing on a couch, still dressed, her purple hair in a messy bun' },
      { src: 'assets/after-dark/anc-ficmuse-couch.webp', title: 'On the Couch', alt: 'Thomas and Muse nude on a couch in warm lamplight, Muse astride him, her dark hair with purple highlights up in a bun' },
      { src: 'assets/after-dark/eve-dance-pool-dusk.webp', title: 'Poolside at dusk', alt: 'Muse and the Explorer nude, dancing joyfully in a pool at dusk, laughing, arms raised; Muse\'s dark hair carries purple highlights' },
      { src: 'assets/after-dark/eve-yoga-warrior.webp', title: 'Warrior II', alt: 'Muse nude in Warrior II in a garden, wide stance, front knee bent, arms stretched out sideways at shoulder height, dark hair with purple highlights' },
      { src: 'assets/after-dark/eve-tantric-cushions.webp', title: 'On the cushions', alt: 'Muse and the garden muse nude in a slow reclining tantric embrace on cushions, faces close, arms around each other; Muse\'s hair carries vivid purple streaks' },
      { src: 'assets/after-dark/fst-blanket-tangle.webp', title: 'Tangled on the blankets', alt: 'Muse, her hair vivid purple, kissing Kayla in a tangled group on festival blankets, 3DVR Girl crowned with flowers leaning over them, more figures resting on blankets behind' },
      { src: 'assets/after-dark/ang-duo-embrace.webp', title: 'Held in the light', alt: 'Muse, dark hair with vivid purple highlights, and Kayla, long dark brown hair, both nude angels embracing cheek to cheek in golden light, white wings at the frame edges' },
      { src: 'assets/after-dark/fn-dancing-nude.webp', title: 'Dancing nude in the grass', alt: 'Five nude women dancing in the grass at night under purple lights: Kayla, a blonde, 3DVR Girl at the centre with vivid blue streaks, the Explorer, and Muse at the edge with purple-tinted hair' },
      { src: 'assets/after-dark/fn-blanket-kiss.webp', title: 'A kiss in the blanket', alt: 'Muse, vivid purple highlights, nude, kissing Kayla, who is wrapped in a purple knitted blanket, under string lights at dusk' },
      { src: 'assets/after-dark/dev-duo-purple-smoke.webp', title: 'Devils in purple smoke', alt: 'Kayla, long dark hair with red curved horns, and Muse, long vivid purple hair with black horns, both nude devils intertwined and holding hands in purple smoky light, a dark wing at the edge' },
      { src: 'assets/after-dark/mix-duel-cheek-to-cheek.webp', title: 'Angel and demon, cheek to cheek', alt: '3DVR Girl as an angel, blonde with blue eyes, and Muse as a demon, dark hair with vivid purple highlights, both nude and cheek to cheek with white wings behind them, golden light on one side and ember glow on the other; the demon\'s horns did not render' },
      { src: 'assets/after-dark/mix-court-of-fire.webp', title: 'The mixed court', alt: 'Six nude women before a wall of fire, white feathered wings on all of them: the garden muse, one horned woman with blue horns, the Explorer, Kayla, 3DVR Girl blonde at the centre, and Muse with purple highlights; the brief asked for five' },
      { src: 'assets/after-dark/prg-muse-cushions.webp', title: 'Expecting, on the cushions', alt: 'Muse reclining nude on cushions among purple wildflowers, her purple highlights clear, a big round pregnant belly, dreamy; the light reads as daylight rather than the dusk of the brief' },
      { src: 'assets/after-dark/kun-muse-embrace.webp', title: 'Kundalini, yab-yum', alt: 'Muse seated nude in a man\'s lap in a yab-yum embrace on a purple yoga mat, eyes closed and serene, his face mostly hidden behind her; the partner is a generic render, not Thomas' },
      { src: 'assets/after-dark/kun-muse-linen.webp', title: 'Kundalini, on the linen', alt: 'Muse lying nude on her side on white linen sheets, her dark hair vivid with purple, mouth open in ecstasy, a man\'s hands and body entering the frame from the right; the partner is a generic render, not Thomas' },
      { src: 'assets/after-dark/prg-all-five.webp', title: 'All five, expecting', alt: 'All five women nude together at golden hour, every one with a large round pregnant belly, standing close and cradling them; Muse\'s purple highlights read, the blonde\'s blue streaks are missing, and the other identities blur together' }

    ],
    storiesNote: 'The storybooks are cast stories. Somebody had to dream the island in the sky before anyone could climb to it.',
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
      greeting: 'Oh — hi. I was halfway into a sketch of the sky doing something impossible. Sit, I will show you. ✨',
      placeholder: 'Say something to Muse…',
      privateNote: 'Chat is private to the owner account. She answers through the portal server in her own voice; she cannot run tools or change anything from here.'
    }
  }

];

export function getCharacter(id) {
  return characters.find(character => character.id === id) || null;
}

export function defaultCharacter() {
  return characters[0];
}
