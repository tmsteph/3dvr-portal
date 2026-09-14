import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSEMBLY_FORMAT,
  ASSEMBLY_VERSION,
  createAssemblySnapshot,
  normalizeAssemblyState,
  parseAssemblySnapshot,
} from '../assembly/data.js';

test('Assembly snapshots round-trip through the portable format', () => {
  const state = {
    identity: { name: 'Neighborhood Garden', purpose: 'Grow food together' },
    people: [{ id: 'p1', name: 'Ava', role: 'Grower', createdAt: 1 }],
    teams: [{ id: 't1', name: 'Garden crew', purpose: 'Maintain shared beds', createdAt: 1 }],
    assignments: [{ id: 'a1', personId: 'p1', teamId: 't1', role: 'Bed steward', createdAt: 1 }],
    initiatives: [{ id: 'i1', name: 'Fall beds', lead: 'Ava', createdAt: 2 }],
    commitments: [{ id: 'c1', text: 'Prepare soil', owner: 'Ava', initiativeId: 'i1', due: '2026-09-20', done: true, createdAt: 3, doneAt: 4 }],
    decisions: [{ id: 'd1', text: 'Launch when?', owner: 'Ava', resolution: 'Friday', done: true, createdAt: 5, doneAt: 6 }],
    needs: [],
  };
  const snapshot = createAssemblySnapshot(state, Date.UTC(2026, 8, 14));

  assert.equal(snapshot.format, ASSEMBLY_FORMAT);
  assert.equal(snapshot.version, ASSEMBLY_VERSION);
  assert.equal(snapshot.exportedAt, '2026-09-14T00:00:00.000Z');
  const restored = parseAssemblySnapshot(JSON.stringify(snapshot));
  assert.deepEqual(restored, normalizeAssemblyState(state));
  assert.equal(restored.decisions[0].resolution, 'Friday');
  assert.equal(restored.teams[0].name, 'Garden crew');
  assert.equal(restored.assignments[0].role, 'Bed steward');
});

test('Assembly import normalizes legacy state and drops unknown fields', () => {
  const imported = parseAssemblySnapshot({
    format: ASSEMBLY_FORMAT,
    version: ASSEMBLY_VERSION,
    state: {
      identity: { name: 'Team', purpose: 'Build', secretExtra: 'drop me' },
      people: [{ id: 'p1', name: 'Sam', role: 'Builder', admin: true }],
      commitments: [{ id: 'c1', text: 'Ship', owner: 'Sam', done: false, unexpected: 'drop me' }],
    },
  });

  assert.deepEqual(imported.initiatives, []);
  assert.equal(imported.identity.name, 'Team');
  assert.equal('secretExtra' in imported.identity, false);
  assert.equal('admin' in imported.people[0], false);
  assert.equal('unexpected' in imported.commitments[0], false);
});


test('Assembly drops role assignments whose person or team no longer exists', () => {
  const normalized = normalizeAssemblyState({
    people: [{ id: 'p1', name: 'Ava' }],
    teams: [{ id: 't1', name: 'Core' }],
    assignments: [
      { id: 'a1', personId: 'p1', teamId: 't1', role: 'Lead' },
      { id: 'a2', personId: 'missing', teamId: 't1', role: 'Ghost' },
      { id: 'a3', personId: 'p1', teamId: 'missing', role: 'Ghost' },
    ],
  });

  assert.deepEqual(normalized.assignments.map(item => item.id), ['a1']);
});

test('Assembly import rejects unrelated or unsupported files', () => {
  assert.throws(() => parseAssemblySnapshot({ format: 'other', version: 1, state: {} }), /not a 3DVR Assembly file/);
  assert.throws(() => parseAssemblySnapshot({ format: ASSEMBLY_FORMAT, version: 99, state: {} }), /Unsupported Assembly version/);
});
