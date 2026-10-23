import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

async function createApp({ pendingSync = false, locked = false } = {}) {
  const nodes = new Map();
  const writes = new Map();
  const frames = [];
  let nextId = 0;
  let failSave = false;
  let identity = 'owner-a';
  let listener;
  let delay;
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', innerHTML: '', hidden: false,
      addEventListener() {}, focus() {}
    });
    return nodes.get(id);
  };
  const context = vm.createContext({
    console: { warn() {} }, URL, URLSearchParams,
    crypto: { randomUUID: () => `cell-${++nextId}` },
    cellIdentity: () => identity,
    openCellInvitations: async () => ({
      close() {}, memberCode: async () => 'test-code', publishCell: async () => {}, retryPending: async () => {}
    }),
    openPrivateCellStore: async ({ onCell }) => {
      if (locked) throw new Error('Sign in to open your private Cells.');
      listener = onCell;
      return {
        close() {},
        async save(record) {
          if (delay) await delay;
          if (failSave) throw new Error('Cell was not saved.');
          writes.set(record.id, structuredClone(record));
          return { pendingSync };
        }
      };
    },
    window: {
      location: { hash: '', search: '?cell=legacy', href: 'https://portal.3dvr.tech/cell/?cell=legacy' },
      localStorage: { getItem: () => 'tmsteph' }, addEventListener() {},
      requestAnimationFrame: callback => frames.push(callback)
    },
    document: { getElementById: element, querySelector: () => element('submit') },
    setInterval() {},
    history: { replaceState(_state, _title, href) { context.window.location.href = href; } }
  });
  const source = readFileSync(new URL('../cell/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {
    element, writes,
    run: code => vm.runInContext(code, context),
    fail() { failSave = true; },
    delaySave() { return new Promise(resolve => { delay = new Promise(release => resolve(release)); }); },
    oldDelivery() { return listener; },
    changeAccount() { identity = 'owner-b'; },
    render() { while (frames.length) frames.shift()(); }
  };
}

it('creates and edits 20 independent Cells, preserving size ranges and searchable context', async () => {
  const app = await createApp();
  for (let index = 1; index <= 20; index++) {
    app.run('resetCellForm()');
    app.element('cellName').value = `Group ${index}`;
    app.element('size').value = index === 20 ? '3–15 people' : '10 people';
    app.element('purpose').value = index === 20 ? 'Family support' : 'Build projects';
    await app.run('saveCell({ preventDefault() {} })');
  }
  app.render();
  assert.equal(app.element('cellCount').textContent, '20');
  assert.equal(app.run('Object.keys(state.cells).length'), 20);
  assert.match(app.element('cellList').innerHTML, /3–15 people target/);
  app.run("selectCell('cell-5')");
  app.element('cellName').value = 'Renamed group';
  await app.run('saveCell({ preventDefault() {} })');
  assert.equal(app.run('Object.keys(state.cells).length'), 20);
  assert.equal(app.writes.get('cell-5').name, 'Renamed group');
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

it('New Cell clears both deep-link aliases and pending selection; failed saves remain unsaved', async () => {
  const app = await createApp();
  app.run('resetCellForm()');
  assert.equal(app.run('state.pendingFocusSelection'), '');
  assert.equal(app.run('new URL(window.location.href).search'), '');
  app.fail();
  await app.run('saveCell({ preventDefault() {} })');
  app.render();
  assert.equal(app.run('Object.keys(state.cells).length'), 0);
  assert.match(app.element('cellSaveStatus').textContent, /not saved/);
});

it('a local-only Gun acknowledgement does not claim cross-device synchronization', async () => {
  const app = await createApp({ pendingSync: true });
  app.run('resetCellForm()');
  await app.run('saveCell({ preventDefault() {} })');
  app.render();
  assert.equal(app.element('cellCount').textContent, '1');
  assert.match(app.element('cellSaveStatus').textContent, /sync is pending/);
  assert.doesNotMatch(app.element('cellSaveStatus').textContent, /saved to the shared/);
});

it('sign-out clears private records and ignores late deliveries from the old account', async () => {
  const app = await createApp();
  app.run('resetCellForm()');
  app.element('purpose').value = 'Secret purpose';
  await app.run('saveCell({ preventDefault() {} })');
  const oldDelivery = app.oldDelivery();
  app.changeAccount();
  app.run('checkAccount()');
  oldDelivery({ id: 'old-cell', name: 'Old secret', updatedAt: '2026-01-01T00:00:00Z' }, 'old-cell');
  app.render();
  assert.equal(app.run('Object.keys(state.cells).length'), 0);
  assert.equal(app.element('purpose').value, '');
  assert.doesNotMatch(app.element('cellList').innerHTML, /Old secret|Secret purpose/);
});

it('signed-out visitors cannot save, and a slow save cannot reopen a reset form', async () => {
  const locked = await createApp({ locked: true });
  await locked.run('saveCell({ preventDefault() {} })');
  assert.equal(locked.writes.size, 0);
  assert.equal(locked.element('submit').disabled, true);
  const app = await createApp();
  app.run('resetCellForm()');
  const release = await app.delaySave();
  const saving = app.run('saveCell({ preventDefault() {} })');
  app.run('resetCellForm()');
  release();
  await saving;
  assert.equal(app.element('cellId').value, '');
});
