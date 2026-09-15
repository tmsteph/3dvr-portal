import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignRoles,
  createCue,
  createMessage,
  createNode,
  createRole,
  createShowState,
  heartbeat,
  markNodeOffline,
  nodeCanRunRole,
  resolveCue,
} from '../src/show-control/protocol.js';

test('matches a role by capabilities instead of physical device identity', () => {
  const node = createNode({ id: 'node-a', capabilities: ['display-output', 'presentation-renderer'] });
  const role = createRole({ id: 'presentation-output', requires: ['display-output', 'presentation-renderer'] });
  assert.equal(nodeCanRunRole(node, role), true);
});

test('prefers an explicitly preferred capable node', () => {
  const nodes = [
    createNode({ id: 'a', capabilities: ['audio-output'] }),
    createNode({ id: 'b', capabilities: ['audio-output'] }),
  ];
  const roles = [createRole({ id: 'audio', requires: ['audio-output'], preferredNodeId: 'b' })];
  assert.deepEqual(assignRoles(nodes, roles).assignments, { audio: 'b' });
});

test('keeps valid assignments stable across recalculation', () => {
  const nodes = [
    createNode({ id: 'a', capabilities: ['display-output'], priority: 1 }),
    createNode({ id: 'b', capabilities: ['display-output'], priority: 10 }),
  ];
  const roles = [createRole({ id: 'screen', requires: ['display-output'] })];
  assert.deepEqual(assignRoles(nodes, roles, { screen: 'a' }).assignments, { screen: 'a' });
});

test('fails a role over when its current node goes offline', () => {
  let state = createShowState({
    showId: 'demo',
    nodes: [
      { id: 'primary', capabilities: ['display-output'], priority: 10 },
      { id: 'backup', capabilities: ['display-output'], priority: 1 },
    ],
    roles: [{ id: 'presentation', requires: ['display-output'] }],
  });
  assert.equal(state.assignments.presentation, 'primary');

  state = markNodeOffline(state, 'primary');
  assert.equal(state.assignments.presentation, 'backup');

  state = heartbeat(state, 'primary', 1234);
  assert.equal(state.nodes.find(node => node.id === 'primary').status, 'online');
  assert.equal(state.assignments.presentation, 'backup');
});

test('resolves cue actions to nodes through roles', () => {
  const state = createShowState({
    showId: 'keynote',
    nodes: [
      { id: 'foh', capabilities: ['presentation-renderer', 'display-output'] },
      { id: 'stage', capabilities: ['usb-dmx'] },
    ],
    roles: [
      { id: 'presentation', requires: ['presentation-renderer', 'display-output'] },
      { id: 'lighting', requires: ['usb-dmx'] },
    ],
  });
  const cue = createCue({
    id: 'go-42',
    actions: [
      { role: 'presentation', command: 'presentation.next' },
      { role: 'lighting', command: 'lighting.scene', payload: { scene: 'Keynote' } },
    ],
  });
  const resolved = resolveCue(state, cue);
  assert.equal(resolved.unresolved.length, 0);
  assert.deepEqual(resolved.commands.map(command => command.target.nodeId), ['foh', 'stage']);
});

test('reports cue actions whose roles have no capable node', () => {
  const state = createShowState({
    showId: 'demo',
    nodes: [],
    roles: [{ id: 'lighting', requires: ['usb-dmx'] }],
  });
  const resolved = resolveCue(state, {
    id: 'go',
    actions: [{ role: 'lighting', command: 'lighting.blackout' }],
  });
  assert.equal(resolved.commands.length, 0);
  assert.equal(resolved.unresolved[0].reason, 'role-unassigned');
});

test('creates a versioned transport envelope', () => {
  const message = createMessage({
    type: 'node.hello',
    messageId: 'm1',
    showId: 'demo',
    nodeId: 'phone',
    sentAt: 100,
    payload: { capabilities: ['touchscreen'] },
  });
  assert.equal(message.protocolVersion, '0.1.0');
  assert.equal(message.type, 'node.hello');
  assert.equal(message.sentAt, 100);
});
