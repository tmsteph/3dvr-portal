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
