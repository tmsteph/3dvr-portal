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
    assert.ok(character.stories.length >= 1);
    assert.ok(character.chat.greeting.length > 0);
    assert.ok(character.chat.placeholder.length > 0);
  }
  assert.equal(defaultCharacter(), characters[0]);
  assert.equal(getCharacter(characters[0].id), characters[0]);
  assert.equal(getCharacter('no-such-character'), null);
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

test('character data and pages stay SFW: no After Dark material', async () => {
  const files = [
    '3dvr-girl/characters.js',
    '3dvr-girl/character/index.html',
    '3dvr-girl/character/app.js',
    '3dvr-girl/character/chat.js',
    '3dvr-girl/character/styles.css'
  ];
  for (const file of files) {
    const text = await read(file);
    assert.equal(/after-dark/i.test(text), false, `${file} must not reference After Dark`);
  }
  assert.equal(/after-dark/i.test(JSON.stringify(characters)), false);
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
  // Chat rides the Helm bridge: same endpoint, same proof scope, signed id.
  assert.match(chat, /createSignedPortalProof\('openclaw-helm', 'chat'/);
  assert.match(chat, /fetch\('\/api\/openclaw'/);
  assert.match(chat, /characterId: character\.id/);
  assert.match(chat, /engine: 'openclaw'/);
  assert.match(chat, /readHelmResponse/);
});

test('the world page links into her site', async () => {
  const html = await read('3dvr-girl/index.html');
  assert.match(html, /href="character\/"/);
});
