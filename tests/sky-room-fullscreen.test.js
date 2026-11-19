import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const app = readFileSync(new URL('../sky-room/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../sky-room/styles.css', import.meta.url), 'utf8');

function loadSky(search = '') {
  const timers = new Map();
  const callbacks = new Map();
  const nodes = new Map();
  const appended = [];
  let counter = 0;
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (o, k) => o[k] ?? (() => gradient) });
  const node = () => {
    const classes = new Set();
    const listeners = new Map();
    const values = new Map();
    return {
      classList: {
        add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
        toggle: (c, on) => on ? classes.add(c) : classes.delete(c),
      },
      querySelector: get,
      addEventListener: (n, fn) => listeners.set(n, fn),
      fire: n => listeners.get(n)?.(),
      getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 320, height: 260 }),
      setAttribute: (n, v) => values.set(n, v),
      getAttribute: n => values.get(n),
      append: el => appended.push(el),
      style: {}, dataset: {},
    };
  };
  function get(key) {
    if (!nodes.has(key)) nodes.set(key, node());
    return nodes.get(key);
  }
  const document = {
    fullscreenElement: null,
    querySelector: get, querySelectorAll: () => [], createElement: node, body: node(),
    addEventListener: (n, fn) => callbacks.set(n, fn),
  };
  runInNewContext(app, {
    document, URLSearchParams,
    window: { location: { search }, addEventListener() {}, matchMedia: () => ({ matches: false }) },
    setTimeout: (fn, delay) => { timers.set(++counter, { fn, delay }); return counter; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame() {},
    devicePixelRatio: 1, performance: { now: () => 0 },
  });
  const card = get('.scene-card');
  const button = get('#fullscreenButton');
  return {
    document, appended, card, button,
    fullscreen: el => { document.fullscreenElement = el; callbacks.get('fullscreenchange')(); },
    key: () => callbacks.get('keydown')(),
    idleTimers: () => [...timers.values()].filter(v => v.delay === 4000),
    expireIdle: () => {
      for (const [id, t] of timers) if (t.delay === 4000) { timers.delete(id); t.fn(); }
    },
  };
}

test('cursor inactivity is scoped to fullscreen and pointer or keyboard wakes the scene', () => {
  const sky = loadSky();
  sky.card.fire('pointermove');
  assert.equal(sky.idleTimers().length, 0);
  sky.fullscreen(sky.card);
  assert.equal(sky.button.getAttribute('aria-pressed'), 'true');
  const original = sky.idleTimers()[0];
  sky.card.fire('pointermove');
  assert.equal(sky.idleTimers().length, 1);
  assert.notEqual(sky.idleTimers()[0], original);
  sky.expireIdle();
  assert.ok(sky.card.classList.contains('fullscreen-idle'));
  sky.card.fire('pointerdown');
  assert.ok(!sky.card.classList.contains('fullscreen-idle'));
  sky.expireIdle();
  sky.key();
  assert.ok(!sky.card.classList.contains('fullscreen-idle'));
  assert.match(css, /\.scene-card:fullscreen\.fullscreen-idle \*\s*\{\s*cursor: none;/);
});

test('exit resets the timer and idle class, and re-entry gets a fresh timer', () => {
  const sky = loadSky();
  sky.fullscreen(sky.card);
  sky.fullscreen(null);
  assert.equal(sky.button.getAttribute('aria-pressed'), 'false');
  assert.equal(sky.idleTimers().length, 0);
  sky.fullscreen(sky.card);
  sky.expireIdle();
  sky.fullscreen(null);
  assert.ok(!sky.card.classList.contains('fullscreen-idle'));
  sky.fullscreen({});
  assert.equal(sky.idleTimers().length, 0);
});

test('Today embed omits standalone chrome while retaining the live device clock', () => {
  const standalone = loadSky();
  const embed = loadSky('?embed=today');
  assert.equal(standalone.appended[0]?.src, '/issue-launcher.js');
  assert.equal(embed.appended.length, 0);
  assert.ok(embed.document.body.classList.contains('sky-today-embed'));
  assert.match(embed.document.querySelector('#timeLabel').textContent, /\d+:\d\d/);
  assert.match(css, /\.sky-today-embed \.sky-hero__copy,/);
  assert.match(css, /\.sky-today-embed \.scene \{ min-height: 0; height: 100vh; \}/);
});
