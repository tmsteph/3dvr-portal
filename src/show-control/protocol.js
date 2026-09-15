export const SHOW_CONTROL_PROTOCOL_VERSION = '0.1.0';

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

function requireId(value, label) {
  const id = String(value || '').trim();
  if (!id) throw new TypeError(`${label} id is required`);
  return id;
}

export function createNode(input = {}) {
  return {
    id: requireId(input.id, 'node'),
    label: String(input.label || input.id).trim(),
    capabilities: uniqueStrings(input.capabilities),
    status: input.status === 'offline' ? 'offline' : 'online',
    priority: Number.isFinite(input.priority) ? Number(input.priority) : 0,
    lastSeen: Number.isFinite(input.lastSeen) ? Number(input.lastSeen) : Date.now(),
    meta: input.meta && typeof input.meta === 'object' ? { ...input.meta } : {},
  };
}

export function createRole(input = {}) {
  return {
    id: requireId(input.id, 'role'),
    label: String(input.label || input.id).trim(),
    requires: uniqueStrings(input.requires),
    preferredNodeId: input.preferredNodeId ? String(input.preferredNodeId) : null,
    mode: input.mode === 'exclusive' ? 'exclusive' : 'shared',
  };
}

export function nodeCanRunRole(node, role) {
  if (!node || !role || node.status !== 'online') return false;
  const capabilities = new Set(node.capabilities || []);
  return (role.requires || []).every(capability => capabilities.has(capability));
}

export function rankNodesForRole(nodes, role, assignments = {}) {
  const load = Object.values(assignments).reduce((counts, nodeId) => {
    counts[nodeId] = (counts[nodeId] || 0) + 1;
    return counts;
  }, {});

  return nodes
    .filter(node => nodeCanRunRole(node, role))
    .map(node => ({
      node,
      preferred: node.id === role.preferredNodeId ? 1 : 0,
      priority: Number(node.priority || 0),
      load: load[node.id] || 0,
    }))
    .sort((a, b) =>
      b.preferred - a.preferred ||
      b.priority - a.priority ||
      a.load - b.load ||
      a.node.id.localeCompare(b.node.id)
    )
    .map(entry => entry.node);
}

export function assignRoles(nodes, roles, previousAssignments = {}) {
  const assignments = {};
  const unresolved = [];

  for (const role of roles) {
    const previousNodeId = previousAssignments[role.id];
    const previousNode = nodes.find(node => node.id === previousNodeId);
    if (previousNode && nodeCanRunRole(previousNode, role)) {
      assignments[role.id] = previousNode.id;
      continue;
    }

    const candidates = rankNodesForRole(nodes, role, assignments);
    if (!candidates.length) {
      unresolved.push(role.id);
      continue;
    }

    assignments[role.id] = candidates[0].id;
  }

  return { assignments, unresolved };
}

export function createShowState(input = {}) {
  const nodes = (input.nodes || []).map(createNode);
  const roles = (input.roles || []).map(createRole);
  const allocation = assignRoles(nodes, roles, input.assignments || {});

  return {
    protocolVersion: SHOW_CONTROL_PROTOCOL_VERSION,
    showId: requireId(input.showId || 'show', 'show'),
    revision: 1,
    nodes,
    roles,
    assignments: allocation.assignments,
    unresolvedRoles: allocation.unresolved,
  };
}

function recalculate(state) {
  const allocation = assignRoles(state.nodes, state.roles, state.assignments);
  return {
    ...state,
    revision: state.revision + 1,
    assignments: allocation.assignments,
    unresolvedRoles: allocation.unresolved,
  };
}

export function registerNode(state, nodeInput) {
  const node = createNode(nodeInput);
  const nodes = state.nodes.filter(existing => existing.id !== node.id).concat(node);
  return recalculate({ ...state, nodes });
}

export function heartbeat(state, nodeId, at = Date.now()) {
  const id = requireId(nodeId, 'node');
  const nodes = state.nodes.map(node =>
    node.id === id ? { ...node, status: 'online', lastSeen: Number(at) } : node
  );
  return recalculate({ ...state, nodes });
}

export function markNodeOffline(state, nodeId) {
  const id = requireId(nodeId, 'node');
  const nodes = state.nodes.map(node =>
    node.id === id ? { ...node, status: 'offline' } : node
  );
  return recalculate({ ...state, nodes });
}

export function expireNodes(state, now = Date.now(), timeoutMs = 5000) {
  const threshold = Number(now) - Number(timeoutMs);
  const nodes = state.nodes.map(node =>
    node.status === 'online' && node.lastSeen < threshold
      ? { ...node, status: 'offline' }
      : node
  );
  return recalculate({ ...state, nodes });
}

export function createCue(input = {}) {
  const id = requireId(input.id, 'cue');
  const actions = Array.isArray(input.actions) ? input.actions : [];
  return {
    id,
    label: String(input.label || id),
    actions: actions.map((action, index) => ({
      id: String(action.id || `${id}:${index + 1}`),
      role: requireId(action.role, 'action role'),
      command: requireId(action.command, 'action command'),
      payload: action.payload ?? null,
    })),
  };
}

export function resolveCue(state, cueInput) {
  const cue = createCue(cueInput);
  const commands = [];
  const unresolved = [];

  for (const action of cue.actions) {
    const nodeId = state.assignments[action.role];
    if (!nodeId) {
      unresolved.push({ actionId: action.id, role: action.role, reason: 'role-unassigned' });
      continue;
    }
    commands.push({
      type: 'show.command',
      protocolVersion: state.protocolVersion,
      showId: state.showId,
      cueId: cue.id,
      actionId: action.id,
      target: { role: action.role, nodeId },
      command: action.command,
      payload: action.payload,
    });
  }

  return { cue, commands, unresolved };
}

export function createMessage(input = {}) {
  return {
    type: requireId(input.type, 'message type'),
    protocolVersion: SHOW_CONTROL_PROTOCOL_VERSION,
    messageId: requireId(input.messageId, 'message'),
    showId: requireId(input.showId, 'show'),
    nodeId: input.nodeId ? String(input.nodeId) : null,
    sentAt: Number.isFinite(input.sentAt) ? Number(input.sentAt) : Date.now(),
    payload: input.payload ?? null,
  };
}
