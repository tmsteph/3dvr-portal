import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../operator/install.js', import.meta.url), 'utf8');
function setup(installed = false, hostname = 'operator.3dvr.tech') {
  const events = {};
  let click;
  let dialogs = 0;
  let destination = null;
  const button = { parentElement: { hidden: false }, disabled: false, addEventListener(type, handler) { click = handler; } };
  const help = { showModal() { dialogs++; } };
  vm.runInNewContext(source, {
    document: { getElementById: (id) => id === 'operator-install' ? button : help },
    navigator: {},
    window: { location: { hostname, assign: (url) => { destination = url; } }, matchMedia: () => ({ matches: installed, addEventListener() {} }), addEventListener: (type, handler) => { events[type] = handler; } }
  });
  return { events, button, click: () => click(), dialogs: () => dialogs, destination: () => destination };
}

test('Install stays available without a browser install event and opens instructions repeatedly', async () => {
  const ui = setup();
  assert.equal(ui.button.parentElement.hidden, false);
  await ui.click();
  await ui.click();
  assert.equal(ui.dialogs(), 2);
});

test('native prompt is consumed once; cancellation leaves manual instructions available', async () => {
  const ui = setup();
  let prompts = 0;
  ui.events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  await ui.click();
  assert.equal(prompts, 1);
  assert.equal(ui.button.disabled, false);
  await ui.click();
  assert.equal(ui.dialogs(), 1);
});

test('prompt failure opens instructions and restores the button', async () => {
  const ui = setup();
  ui.events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { throw new Error('unavailable'); } });
  await ui.click();
  assert.equal(ui.dialogs(), 1);
  assert.equal(ui.button.disabled, false);
});

test('installed apps hide the install entry', () => {
  assert.equal(setup(true).button.parentElement.hidden, true);
  const ui = setup();
  ui.events.appinstalled();
  assert.equal(ui.button.parentElement.hidden, true);
});


test('Portal install button opens the independent Operator origin', async () => {
  const ui = setup(false, 'portal.3dvr.tech');
  await ui.click();
  assert.equal(ui.destination(), 'https://operator.3dvr.tech/operator/');
  assert.equal(ui.dialogs(), 0);
});
