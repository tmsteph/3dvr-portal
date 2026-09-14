import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deriveAssemblyFocus } from '../assembly/focus.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assembly focus board limits Now and derives Next without duplicating state', () => {
  const state = {
    initiatives: [
      { id: 'i1', name: 'Launch', lead: 'Ava' },
      { id: 'i2', name: 'Research', lead: 'Sam' },
    ],
    commitments: [
      { id: 'c1', text: 'Soon', owner: 'Ava', initiativeId: 'i1', due: '2026-09-15', createdAt: 2, done: false },
      { id: 'c2', text: 'Later', owner: 'Sam', initiativeId: '', due: '', createdAt: 3, done: false },
      { id: 'c3', text: 'Earlier', owner: 'Lee', initiativeId: '', due: '2026-09-14', createdAt: 1, done: false },
      { id: 'c4', text: 'Queue me', owner: 'Kai', initiativeId: '', due: '', createdAt: 4, done: false },
    ],
    decisions: [],
    needs: [],
  };

  const focus = deriveAssemblyFocus(state, 3);
  assert.deepEqual(focus.now.map(item => item.title), ['Earlier', 'Soon', 'Later']);
  assert.equal(focus.next.some(item => item.title === 'Queue me'), true);
  assert.equal(focus.next.some(item => item.title === 'Research' && item.kind === 'initiative'), true);
  assert.equal(focus.next.some(item => item.title === 'Launch' && item.kind === 'initiative'), false);
});

test('Assembly focus board derives Waiting from unresolved decisions and needs only', () => {
  const focus = deriveAssemblyFocus({
    initiatives: [],
    commitments: [],
    decisions: [
      { id: 'd1', text: 'Pick a date', owner: 'Ava', done: false },
      { id: 'd2', text: 'Done choice', done: true },
    ],
    needs: [
      { id: 'n1', text: 'Need a room', owner: 'Core', done: false },
      { id: 'n2', text: 'Solved', done: true },
    ],
  });

  assert.deepEqual(focus.waiting.map(item => item.title), ['Pick a date', 'Need a room']);
});

test('Assembly focus UI is a projection over local workspace state', async () => {
  const [ui, css] = await Promise.all([read('assembly/focus-ui.js'), read('assembly/focus.css')]);
  assert.match(ui, /normalizeAssemblyState/);
  assert.match(ui, /deriveAssemblyFocus/);
  assert.match(ui, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(ui, /Now \/ Next \/ Waiting/);
  assert.doesNotMatch(ui, /localStorage\.setItem/);
  assert.match(css, /\.focus-columns/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
