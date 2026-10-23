import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function createApp() {
  const nodes = new Map();
  const writes = new Map();
  const frames = [];
  let nextId = 0;
  let failSave = false;
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', innerHTML: '', hidden: false,
      addEventListener() {}, focus() {}
    });
    return nodes.get(id);
  };
  function gunNode(path = '') {
    return {
      get(key) { return gunNode(`${path}/${key}`); },
      put(value, callback) {
        if (failSave && path.includes('/cells/')) {
          callback?.({ err: 'offline' });
          return;
        }
        // Match Gun's scalar record boundary instead of accepting invalid arrays.
        if (value && typeof value === 'object') {
          assert.ok(Object.values(value).every(field => field === null || ['string', 'number', 'boolean'].includes(typeof field)));
        }
        writes.set(path, structuredClone(value));
        callback?.({ ok: 1 });
      },
      map() { return { on() {} }; },
      once() {}
    };
  }
  const context = vm.createContext({
    console: { warn() {} }, URL, URLSearchParams,
    crypto: { randomUUID: () => `cell-${++nextId}` },
    Gun: () => ({ ...gunNode(), user: () => ({ recall() {} }) }),
    window: {
      location: { search: '?cell=legacy', href: 'https://portal.3dvr.tech/cell/?cell=legacy' },
      localStorage: { getItem: () => 'tmsteph' },
      requestAnimationFrame: callback => frames.push(callback)
    },
    document: {
      getElementById: element,
      querySelector: () => element('submit'),
      querySelectorAll: () => []
    },
    history: { replaceState(_state, _title, href) { context.window.location.href = href; } }
  });
  vm.runInContext(readFileSync(new URL('../cell/app.js', import.meta.url), 'utf8'), context);
  return {
    element, writes,
    run: code => vm.runInContext(code, context),
    fail() { failSave = true; },
    render() { while (frames.length) frames.shift()(); }
  };
}

it('creates and edits 20 independent Cells, preserving size ranges and searchable context', () => {
  const app = createApp();
  for (let index = 1; index <= 20; index++) {
    app.run('resetCellForm()');
    app.element('cellName').value = `Group ${index}`;
    app.element('size').value = index === 20 ? '3–15 people' : '10 people';
    app.element('purpose').value = index === 20 ? 'Family support' : 'Build projects';
    app.run('saveCell({ preventDefault() {} })');
  }
  app.render();
  assert.equal(app.element('cellCount').textContent, '20');
  assert.equal(app.run('Object.keys(state.cells).length'), 20);
  assert.match(app.element('cellList').innerHTML, /3–15 people target/);
  app.run("selectCell('cell-5')");
  app.element('cellName').value = 'Renamed group';
  app.run('saveCell({ preventDefault() {} })');
  assert.equal(app.run('Object.keys(state.cells).length'), 20);
  assert.equal(app.writes.get('/3dvr-portal/cellHub/cells/cell-5').name, 'Renamed group');
  app.element('cellSearch').value = 'FAMILY';
  app.run('renderState()');
  app.render();
  assert.equal(app.element('cellSearchStatus').textContent, '1 matching Cells');
  assert.match(app.element('cellList').innerHTML, /Group 20/);
  assert.doesNotMatch(app.element('cellList').innerHTML, /Renamed group/);
  app.element('cellSearch').value = 'no matching group';
  app.run('renderState()');
  app.render();
  assert.equal(app.element('cellSearchStatus').textContent, '0 matching Cells');
  assert.equal(app.element('cellEmpty').hidden, true);
});

it('New Cell clears both deep-link aliases and pending selection; failed saves remain unsaved', () => {
  const app = createApp();
  app.run('resetCellForm()');
  assert.equal(app.run('state.pendingFocusSelection'), '');
  assert.equal(app.run('new URL(window.location.href).search'), '');
  app.fail();
  app.run('saveCell({ preventDefault() {} })');
  app.render();
  assert.equal(app.run('Object.keys(state.cells).length'), 0);
  assert.match(app.element('cellSaveStatus').textContent, /not saved/);
});
