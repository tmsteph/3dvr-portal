import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { characters, getCharacter, defaultCharacter } from '../3dvr-girl/characters.js';
import { listCharacterIds } from '../src/openclaw/characters.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const repoPath = path => new URL(`../${path}`, import.meta.url);

test('character data is well-formed and ids are unique', () => {
  assert.ok(characters.length >= 1);
  const ids = characters.map(character => character.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const character of characters) {
    assert.match(character.id, /^[a-z0-9][a-z0-9-]{0,39}$/);
    assert.ok(character.name.length > 0);
    assert.ok(character.tagline.length > 0);
    assert.ok(character.about.length >= 1);
    assert.ok(character.fieldNotes.length >= 1);
    assert.ok(character.worlds.length >= 1);
    assert.ok(character.gallery.length >= 1);
    assert.ok(Array.isArray(character.afterDark));
    assert.ok(character.afterDark.length >= 1);
    assert.ok(Array.isArray(character.goldenHour));
    assert.ok(character.goldenHour.length >= 1);
    assert.ok(character.stories.length >= 1);
    assert.ok(character.chat.greeting.length > 0);
    assert.ok(character.chat.placeholder.length > 0);
  }
  assert.equal(defaultCharacter(), characters[0]);
  assert.equal(getCharacter(characters[0].id), characters[0]);
  assert.equal(getCharacter('no-such-character'), null);
  // The pilot plus the rest of the cast from the roster. The brunette
  // garden muse keeps her own entry and is never merged into Kayla.
  assert.deepEqual(ids, ['3dvr-girl', 'kayla', 'garden-muse', 'explorer', 'muse']);
});

test('every character with a public site also has a server persona, and vice versa', () => {
  assert.deepEqual([...listCharacterIds()].sort(), characters.map(character => character.id).sort());
});

test('character data only references assets that exist in the repo', () => {
  for (const character of characters) {
    const assets = [
      character.heroImage.src,
      ...character.worlds.map(world => world.image),
      ...character.gallery.map(scene => scene.src),
      ...character.goldenHour.map(item => item.src),
      ...character.goldenHour.filter(item => item.poster).map(item => item.poster),
      ...character.afterDark.map(frame => frame.src),
      ...character.stories.map(story => story.cover)
    ];
    for (const src of assets) {
      assert.ok(existsSync(repoPath(`3dvr-girl/${src}`)), `${character.id} references missing asset ${src}`);
    }
    for (const story of character.stories) {
      assert.ok(existsSync(repoPath(`3dvr-girl/${story.href}index.html`)), `${character.id} story link ${story.href} has no page`);
    }
  }
});

test('SFW and After Dark material stay strictly separate', () => {
  for (const character of characters) {
    const publicSrcs = new Set(character.gallery.map(scene => scene.src));
    for (const scene of character.gallery) {
      assert.equal(scene.src.includes('after-dark/'), false, `${character.id} public gallery must not use After Dark assets`);
    }
    for (const frame of character.afterDark) {
      assert.ok(frame.src.startsWith('assets/after-dark/'), `${character.id} private frame ${frame.src} must come from the After Dark archive`);
      assert.equal(publicSrcs.has(frame.src), false, `${character.id} frame ${frame.src} appears in both galleries`);
      assert.ok(frame.title.length > 0);
      assert.ok(frame.alt.length > 0);
    }
    // Golden hour is its own shelf: public like the gallery, never an
    // After Dark asset, and never double-filed as a private frame.
    const privateSrcs = new Set(character.afterDark.map(frame => frame.src));
    for (const item of character.goldenHour) {
      assert.ok(item.src.startsWith('assets/golden-hour/'), `${character.id} golden hour item ${item.src} must live on the golden hour shelf`);
      assert.equal(privateSrcs.has(item.src), false, `${character.id} golden hour item ${item.src} is also filed as a private frame`);
      assert.ok(item.title.length > 0);
      assert.ok(item.alt.length > 0);
      if (item.video) assert.ok(item.poster?.startsWith('assets/golden-hour/'), `${character.id} golden hour clip ${item.src} needs a shelf poster`);
    }
  }
});

test('the After Dark paywall is one check, locked by default, config to go live', async () => {
  const [html, app, access] = await Promise.all([
    read('3dvr-girl/character/index.html'),
    read('3dvr-girl/character/app.js'),
    read('3dvr-girl/character/access.js')
  ]);
  assert.match(html, /id="afterDarkGrid"/);
  assert.match(html, /id="afterDarkLock"/);
  assert.match(html, /id="afterDarkUnlock"/);
  // The page asks the one entitlement function; it does not invent its own.
  assert.match(app, /from '\.\/access\.js'/);
  assert.match(app, /resolveAfterDarkAccess/);
  assert.match(app, /is-blurred/);
  assert.match(access, /export function resolveAfterDarkAccess/);
  const { AFTER_DARK_PAYWALL, resolveAfterDarkAccess: resolve } = await import('../3dvr-girl/character/access.js');
  // Going live is a config change: no payment link is committed yet.
  assert.equal(AFTER_DARK_PAYWALL.paymentLink, '');
  // Locked for visitors, open for the signed-in owner, open for members.
  assert.equal(resolve({ signedIn: false, entitled: false }), 'locked');
  assert.equal(resolve({ signedIn: true, entitled: false }), 'owner');
  assert.equal(resolve({ signedIn: false, entitled: true }), 'member');
  assert.equal(resolve({}), 'locked');
});

test('character page renders from the data module and hosts the chat panel', async () => {
  const [html, app, chat] = await Promise.all([
    read('3dvr-girl/character/index.html'),
    read('3dvr-girl/character/app.js'),
    read('3dvr-girl/character/chat.js')
  ]);
  assert.match(html, /id="chatForm"/);
  assert.match(html, /id="chatLog"/);
  assert.match(html, /id="chatMessage"/);
  assert.match(html, /id="galleryGrid"/);
  assert.match(html, /id="worldGrid"/);
  assert.match(html, /id="storyGrid"/);
  assert.match(app, /from '\.\.\/characters\.js'/);
  assert.match(app, /getCharacter/);
  // Chat rides the Helm envelope: same endpoint, same proof scope,
  // signed id — execution moved server-side to the OpenAI API.
  assert.match(chat, /createSignedPortalProof\('openclaw-helm', 'chat'/);
  assert.match(chat, /fetch\('\/api\/openclaw'/);
  assert.match(chat, /characterId: character\.id/);
  assert.match(chat, /engine: 'openclaw'/);
  assert.match(chat, /history: \[\.\.\.history\]/);
  assert.match(chat, /readHelmResponse/);
});

test('the world page links into her site', async () => {
  const html = await read('3dvr-girl/index.html');
  assert.match(html, /href="character\/"/);
});

test('golden hour is a public shelf between the scenes and After Dark', async () => {
  const [html, app, characterHtml, characterApp] = await Promise.all([
    read('3dvr-girl/index.html'),
    read('3dvr-girl/app.js'),
    read('3dvr-girl/character/index.html'),
    read('3dvr-girl/character/app.js')
  ]);
  // The section sits between the scene archive and After Dark, with its
  // own anchor, and carries no lock or blur of its own: the shelf is
  // public, so the only lock markup on the page stays in After Dark.
  const archiveAt = html.indexOf('id="archive"');
  const goldenAt = html.indexOf('id="golden-hour"');
  const afterDarkAt = html.indexOf('id="after-dark"');
  assert.ok(archiveAt > -1 && goldenAt > archiveAt && afterDarkAt > goldenAt,
    'golden hour section must sit between the archive and After Dark');
  assert.match(html, /id="goldenHourGrid"/);
  assert.match(html, /href="#golden-hour"/);
  const section = html.slice(goldenAt, afterDarkAt);
  assert.equal(/afterDarkLock|is-blurred|private-card/.test(section), false,
    'the golden hour section must not carry lock or blur markup');
  // The shelf renders from app.js data, photos and clips alike.
  assert.match(app, /goldenHourGrid/);
  assert.match(app, /assets\/golden-hour\/duo-pool-swimsuits\.webp/);
  assert.match(app, /assets\/golden-hour\/trio-festival-dusk\.webp/);
  assert.match(app, /assets\/golden-hour\/video-sundress-trio\.mp4/);
  // Character pages get the shelf as its own tab next to After Dark,
  // rendered from the same per-character data.
  assert.match(characterHtml, /id="goldenHourGrid"/);
  assert.match(characterHtml, /data-tab="goldenhour"/);
  assert.match(characterApp, /character\.goldenHour/);
  assert.match(characterApp, /'golden-hour': 'goldenhour'/);
});

test('galleries reveal by scrolling: no show-more buttons remain', async () => {
  const [app, gallery, characterApp] = await Promise.all([
    read('3dvr-girl/app.js'),
    read('3dvr-girl/gallery.js'),
    read('3dvr-girl/character/app.js')
  ]);
  for (const [name, source] of [['app.js', app], ['gallery.js', gallery], ['character/app.js', characterApp]]) {
    assert.equal(/Show more/.test(source), false, `${name} must not render a Show more button`);
    assert.equal(/show-more-row/.test(source), false, `${name} must not build show-more rows`);
    assert.equal(/paginate\(/.test(source), false, `${name} must not paginate behind a button`);
    // The next chunk arrives on its own as the grid bottom approaches.
    assert.match(source, /IntersectionObserver/, `${name} must auto-append on scroll`);
    assert.match(source, /scroll-sentinel/, `${name} must watch a scroll sentinel`);
  }
});

test('phone top nav stays one scrollable line: no destination hidden, no mid-phrase wrap', async () => {
  const css = await read('3dvr-girl/styles.css');
  // The old phone rule hid three destinations (Worlds, Carousel, Woods)
  // and the rest wrapped mid-phrase and bled off the right edge. The nav
  // must keep every destination and scroll sideways on one line instead,
  // the same pattern the cast strip below it uses.
  assert.equal(/topbar__nav a:(first-child|nth-child)/.test(css), false,
    'phone nav must not hide any destination');
  assert.match(css, /\.topbar__nav \{[^}]*overflow-x: auto[^}]*white-space: nowrap/,
    'phone nav must be a single-line sideways-scrolling row');
  assert.match(css, /\.topbar__nav::-webkit-scrollbar \{ display: none; \}/,
    'phone nav hides its scrollbar like the cast strip does');
  assert.match(css, /\.topbar__nav a \{[^}]*flex: none/,
    'phone nav links must not be squeezed into wrapping');
});

test('After Dark is organized by who and by set, derived from the batches', async () => {
  const [html, gallery] = await Promise.all([
    read('3dvr-girl/index.html'),
    read('3dvr-girl/gallery.js')
  ]);
  // Two chip rows: who is in the frame, and which set it belongs to.
  assert.match(html, /id="afterDarkFilters"/);
  assert.match(html, /id="afterDarkSetFilters"/);
  assert.match(gallery, /AD_SET_FILTERS/);
  // The two filters combine: a card must match its girl tag AND its set.
  assert.match(gallery, /card\.dataset\.set === adSetFilter/);
  assert.match(gallery, /cardTags\(card\)\.includes\(adFilter\)/);

  const cards = [...html.matchAll(/<figure class="private-card" data-tags="([^"]*)" data-set="([^"]*)">/g)]
    .map(match => ({ tags: match[1].split(/\s+/), set: match[2] }));
  assert.equal(cards.length, 169, 'every After Dark card carries a data-set');
  // Set membership follows the recorded batches: eve- frames split by
  // their dancing/yoga/tantric themes, srv- is the Nov 4 serverless
  // batch, anc- the Nov 5 anchored batch, fst- and fn- the Nov 6 festival
  // batches, ang-/dev-/mix- the Nov 6 angels, devils and mixes
  // batches, mrt- the Nov 7 Martha rig test, prg- the Nov 7 expecting
  // batch, kun- the Nov 7 kundalini batch, then the recorded tags.
  const counts = {};
  for (const card of cards) counts[card.set] = (counts[card.set] || 0) + 1;
  assert.deepEqual(counts, {
    portraits: 28,
    duos: 23,
    fantasy: 20,
    serverless: 8,
    anchored: 8,
    'first-takes': 7,
    festival: 13,
    angels: 6,
    devils: 5,
    mixes: 6,
    martha: 5,
    expecting: 9,
    kundalini: 9,
    dancing: 6,
    machine: 6,
    yoga: 5,
    tantric: 5
  });
  // The who filter follows the captions: duo frames whose caption names
  // both girls carry both girl tags.
  const byFile = file => {
    const at = html.indexOf(`assets/after-dark/${file}`);
    assert.ok(at > -1, `${file} is on the page`);
    const figureAt = html.lastIndexOf('<figure class="private-card"', at);
    return html.slice(figureAt, html.indexOf('>', figureAt));
  };
  assert.match(byFile('duo-forest-kiss.webp'), /data-tags="[^"]*\bkayla\b[^"]*"/);
  assert.match(byFile('eve-tantric-cushions.webp'), /data-tags="[^"]*\bgarden\b[^"]*"/);
  assert.match(byFile('eve-tantric-foreheads.webp'), /data-tags="[^"]*\bexplorer\b[^"]*"/);
  assert.match(byFile('machine-vr-1.webp'), /data-tags="[^"]*\bgirl\b[^"]*"/);
});

test('golden hour attribution follows who each frame shows', () => {
  const counts = Object.fromEntries(characters.map(character => [character.id, character.goldenHour.length]));
  assert.deepEqual(counts, {
    '3dvr-girl': 20,
    kayla: 15,
    'garden-muse': 14,
    explorer: 11,
    muse: 13
  });
  // Every shelf asset is attributed to at least one character, and the
  // videos are marked as videos wherever they appear. The dance- clips
  // are the 2026-11-07 dance video set: each is filed on the page of
  // every girl the render actually shows (group clips verified frame
  // by frame; the Explorer is not identifiable in the circle clips, so
  // those are not filed under her).
  const attributed = new Set(characters.flatMap(character => character.goldenHour.map(item => item.src)));
  assert.deepEqual([...attributed].sort(), [
    'assets/golden-hour/beach-3dvr-girl.webp',
    'assets/golden-hour/cliffs-garden.webp',
    'assets/golden-hour/dance-3dvr-back.mp4',
    'assets/golden-hour/dance-3dvr-solo.mp4',
    'assets/golden-hour/dance-beach-crew.mp4',
    'assets/golden-hour/dance-beach-kayla-garden.mp4',
    'assets/golden-hour/dance-beach-martha-3dvr.mp4',
    'assets/golden-hour/dance-beach-muse-explorer.mp4',
    'assets/golden-hour/dance-crew-back.mp4',
    'assets/golden-hour/dance-crew-finale.mp4',
    'assets/golden-hour/dance-field-thomas-3dvr.mp4',
    'assets/golden-hour/dance-field-thomas-crew.mp4',
    'assets/golden-hour/dance-field-thomas-kayla-garden.mp4',
    'assets/golden-hour/dance-field-thomas-muse-explorer.mp4',
    'assets/golden-hour/dance-garden-explorer-cliff.mp4',
    'assets/golden-hour/dance-kayla-back.mp4',
    'assets/golden-hour/dance-kayla-solo.mp4',
    'assets/golden-hour/dance-martha-3dvr-festival.mp4',
    'assets/golden-hour/dance-martha-explorer-cliff.mp4',
    'assets/golden-hour/dance-martha-garden-lavender.mp4',
    'assets/golden-hour/dance-martha-kayla-garden.mp4',
    'assets/golden-hour/dance-martha-muse-lights.mp4',
    'assets/golden-hour/dance-muse-back.mp4',
    'assets/golden-hour/dance-muse-solo.mp4',
    'assets/golden-hour/duo-beach-dresses.webp',
    'assets/golden-hour/duo-festival-golden.webp',
    'assets/golden-hour/duo-pool-swimsuits.webp',
    'assets/golden-hour/duo-yoga-linen.webp',
    'assets/golden-hour/food-burrito-3dvr.webp',
    'assets/golden-hour/food-burrito-explorer.webp',
    'assets/golden-hour/food-pizza-garden.webp',
    'assets/golden-hour/food-sandwich-kayla.webp',
    'assets/golden-hour/gown-kayla.webp',
    'assets/golden-hour/gown-muse.webp',
    'assets/golden-hour/lollipop-3dvr-girl.webp',
    'assets/golden-hour/lollipop-explorer.webp',
    'assets/golden-hour/lollipop-garden.webp',
    'assets/golden-hour/lollipop-kayla.webp',
    'assets/golden-hour/lollipop-muse.webp',
    'assets/golden-hour/solo-festival-dress.webp',
    'assets/golden-hour/solo-lavender-dress.webp',
    'assets/golden-hour/trio-festival-dusk.webp',
    'assets/golden-hour/trio-linen-sundresses.webp',
    'assets/golden-hour/video-beach-explorer.mp4',
    'assets/golden-hour/video-gown-3dvr.mp4',
    'assets/golden-hour/video-pool-duo.mp4',
    'assets/golden-hour/video-sundress-trio.mp4'
  ]);
  for (const character of characters) {
    for (const item of character.goldenHour) {
      assert.equal(Boolean(item.video), item.src.endsWith('.mp4'), `${character.id} item ${item.src}: video flag must match the file type`);
    }
  }
});

test('the After Dark curtains link to sign-in and back, not the portal homepage', async () => {
  const [worldHtml, characterHtml, characterApp] = await Promise.all([
    read('3dvr-girl/index.html'),
    read('3dvr-girl/character/index.html'),
    read('3dvr-girl/character/app.js')
  ]);
  // World page curtain: the button goes to the sign-in page with a
  // redirect back to the world page's After Dark stage, on either origin.
  const lockAt = worldHtml.indexOf('id="afterDarkLock"');
  assert.ok(lockAt > -1, 'world page carries the After Dark lock');
  const lock = worldHtml.slice(lockAt, lockAt + 600);
  assert.match(lock, /href="\.\.\/sign-in\.html\?redirect=%2F3dvr-girl%2F%23after-dark"/);
  assert.equal(lock.includes('index.html'), false,
    'the curtain sign-in must not detour through the portal homepage');
  // Character pages: the lock carries a sign-in link too, and the page
  // script aims it back at the exact page the visitor started from.
  assert.match(characterHtml, /id="afterDarkSignIn"/);
  assert.match(characterApp, /afterDarkSignIn/);
  assert.match(characterApp, /sign-in\.html\?redirect=\$\{encodeURIComponent\(backHere\)\}/);
});
