import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import test from 'node:test';

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

test('encore ships a dependency-free venue mode', async () => {
  const appDir = new URL('../encore/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', appDir)), true);
  assert.equal(await fileExists(new URL('events.json', appDir)), true);
  assert.equal(await fileExists(new URL('PLAN.md', appDir)), true);

  const html = await readFile(new URL('index.html', appDir), 'utf8');

  assert.match(html, /<title>Encore — Venue Mode<\/title>/);
  assert.match(html, /<canvas id="stage"/);
  assert.match(html, /id="onPanel"/);
  assert.match(html, /id="sheet"/);
  // silent by design: no audio elements, no external scripts or build step
  assert.doesNotMatch(html, /<audio/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+href="http/);
});

test('encore is mouse-first with an ambient fallback', async () => {
  const html = await readFile(new URL('../encore/index.html', import.meta.url), 'utf8');

  // click / tap is the primary control; keys are the alternative
  assert.match(html, /canvas\.addEventListener\('pointerdown'/);
  assert.match(html, /addEventListener\('keydown'/);
  // the canvas captures the pointer, so a press is never lost at the
  // edge (or outside the World shell's frame); no long-press menu
  assert.match(html, /canvas\.setPointerCapture\(e\.pointerId\)/);
  assert.match(html, /canvas#stage \{[^}]*touch-action: none/);
  assert.match(html, /addEventListener\('contextmenu', \(e\) => e\.preventDefault\(\)\)/);
  // thematic cursor over the canvas: an inline SVG headset, pointer fallback
  assert.match(html, /canvas#stage \{[^}]*cursor: url\("data:image\/svg\+xml/);
  // after ~2 s without pointer movement the cursor hides; the next
  // move or press restores it instantly (class swap, no transition)
  assert.match(html, /canvas#stage\.cursor-idle \{ cursor: none; \}/);
  assert.match(html, /function wakeCursor\(\)/);
  assert.match(html, /setTimeout\(\(\) => canvas\.classList\.add\('cursor-idle'\), 2000\)/);
  assert.match(html, /canvas\.addEventListener\('pointermove', wakeCursor\)/);
  assert.match(html, /canvas\.addEventListener\('pointerdown', wakeCursor\)/);
  // leave it alone for ten seconds and he wanders the floor on his own
  assert.match(html, /now - lastInputAt > 10000/);
});

test('encore mouse buttons: right-click inspects a room, wheel zooms', async () => {
  const html = await readFile(new URL('../encore/index.html', import.meta.url), 'utf8');

  assert.match(html, /e\.pointerType === 'mouse' && e\.button === 2 && view === 'venue'\)/);
  assert.match(html, /if \(evs\.length\) openSheet\(bestEvent\(evs\)\);/);
  assert.match(html, /addEventListener\('wheel', \(e\) => \{\n  e\.preventDefault\(\);/);
  assert.match(html, /zoomUser = Math\.max\(0\.5, Math\.min\(2, zoomUser/);
  assert.match(html, /fit \* zoomUser\)\)/);
  assert.match(html, /Math\.min\(VW \/ MW, VH \/ MH\) \* zoomUser/);
  assert.match(html, /right-click a room to peek at its flowsheet/);
});

test('encore map covers his real venues and rooms', async () => {
  const html = await readFile(new URL('../encore/index.html', import.meta.url), 'utf8');

  // the three properties in his verified Lighthouse rotation
  assert.match(html, /Manchester Grand Hyatt/);
  assert.match(html, /prop: '9036'/);
  assert.match(html, /Hyatt Regency Mission Bay/);
  assert.match(html, /prop: '3819'/);
  assert.match(html, /Gaylord Pacific/);
  assert.match(html, /prop: '4494'/);
  // the rooms his flowsheets actually put him in
  assert.match(html, /Expo Hall/);
  assert.match(html, /Harbor Ballroom/);
  assert.match(html, /Bayview I/);
  assert.match(html, /California Ballroom/);
  // and the honest scope note: his venues, not all 24 in the county
  assert.match(html, /24 venues/);
});

test('encore wears the shared crew in blacks with headsets', async () => {
  const html = await readFile(new URL('../encore/index.html', import.meta.url), 'utf8');

  assert.match(html, /function drawTech\(g, def, x, y, pose\)/);
  assert.match(html, /headset/);
  for (const name of ['Thomas', '3DVR Girl', 'Mark', 'Esai', 'David', 'Brandon']) {
    assert.match(html, new RegExp(`name: '${name}'`), `preset ${name} missing`);
  }
  // the shared character spec, kept in sync with every sibling store and
  // the combined shell's one shared record
  assert.match(html, /encore\.customs/);
  assert.match(html, /encore\.selectedDef/);
  assert.match(html, /preserve\.customs/);
  assert.match(html, /valley\.customs\.v1/);
  assert.match(html, /companion-quest\.customCharacters\.v1/);
  assert.match(html, /corner-office\.customs/);
  assert.match(html, /world\.character\.v1/);
});

test('encore events carry his real shows from Lighthouse', async () => {
  const raw = await readFile(new URL('../encore/events.json', import.meta.url), 'utf8');
  const data = JSON.parse(raw);

  assert.equal(data.asOf, '2026-11-09');
  assert.match(data.source, /Lighthouse/);
  const anchor = data.events.find((ev) => ev.job === '19615');
  assert.ok(anchor, 'Job #19615 missing from events.json');
  assert.equal(anchor.venue, 'missionbay');
  assert.equal(anchor.room, 'Bayview I & II');
  assert.match(anchor.show, /Clarion Connexa/);
  assert.equal(anchor.role, 'Audio Technician Op');

  const venues = new Set(data.events.map((ev) => ev.venue));
  assert.deepEqual([...venues].sort(), ['gaylord', 'manchester', 'missionbay']);

  // the page embeds the same snapshot as a fetch fallback, anchored on
  // the same job, so the two can never quietly drift apart
  const html = await readFile(new URL('../encore/index.html', import.meta.url), 'utf8');
  assert.match(html, /fetch\('events\.json'/);
  assert.match(html, /FALLBACK_EVENTS/);
  assert.match(html, /job: '19615'/);
  assert.match(html, /Clarion Connexa FLS\/PLS West Coast 2026/);
});

test('encore plan names what v1 does not implement', async () => {
  const plan = await readFile(new URL('../encore/PLAN.md', import.meta.url), 'utf8');

  assert.match(plan, /What v1 implements/);
  assert.match(plan, /live Lighthouse feed/i);
  assert.match(plan, /Venue-wide event listings/);
  assert.match(plan, /all 24 venues/i);
  assert.match(plan, /Crew NPCs from real flowsheets/);
  assert.match(plan, /clock-in/i);
  assert.match(plan, /December 7/);
  assert.match(plan, /Travel-time realism/);
  assert.match(plan, /Multiplayer \/ crew presence/);
  assert.match(plan, /Follow-up order/);
});
