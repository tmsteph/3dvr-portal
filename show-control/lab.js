import {
  createShowState,
  heartbeat,
  markNodeOffline,
  resolveCue,
} from '../src/show-control/protocol.js';

const seed = {
  showId: '3dvr-demo',
  nodes: [
    {
      id: 'foh-mac',
      label: 'FOH MacBook',
      priority: 10,
      capabilities: ['display-output', 'presentation-renderer', 'audio-output', 'show-control'],
    },
    {
      id: 'backup-laptop',
      label: 'Backup Laptop',
      priority: 5,
      capabilities: ['display-output', 'presentation-renderer', 'audio-output'],
    },
    {
      id: 'stage-pi',
      label: 'Stage Pi',
      priority: 8,
      capabilities: ['usb-dmx', 'audio-output', 'gpio'],
    },
    {
      id: 'phone',
      label: 'Operator Phone',
      priority: 2,
      capabilities: ['touchscreen', 'show-control'],
    },
  ],
  roles: [
    { id: 'presentation-output', label: 'Presentation', requires: ['display-output', 'presentation-renderer'] },
    { id: 'lighting-output', label: 'Lighting', requires: ['usb-dmx'] },
    { id: 'audio-playback', label: 'Audio', requires: ['audio-output'] },
    { id: 'show-master', label: 'Show Master', requires: ['show-control'] },
  ],
};

let state = createShowState(seed);
const cue = {
  id: 'keynote-start',
  label: 'Keynote start',
  actions: [
    { role: 'presentation-output', command: 'presentation.next' },
    { role: 'lighting-output', command: 'lighting.scene', payload: { scene: 'Keynote', fadeMs: 3000 } },
    { role: 'audio-playback', command: 'audio.fade', payload: { bus: 'walk-in', level: 0, fadeMs: 1500 } },
  ],
};

const nodesEl = document.querySelector('#nodes');
const rolesEl = document.querySelector('#roles');
const logEl = document.querySelector('#eventLog');
const goButton = document.querySelector('#goCue');
const resetButton = document.querySelector('#resetDemo');

function nodeLabel(id) {
  return state.nodes.find(node => node.id === id)?.label || id || 'unassigned';
}

function log(line) {
  const stamp = new Date().toLocaleTimeString();
  logEl.textContent = `[${stamp}] ${line}\n${logEl.textContent}`.trim();
}

function render() {
  nodesEl.innerHTML = state.nodes.map(node => `
    <article class="lab-card ${node.status === 'offline' ? 'is-offline' : ''}">
      <div class="lab-card__top">
        <strong>${node.label}</strong>
        <span>${node.status}</span>
      </div>
      <div class="lab-capabilities">${node.capabilities.map(cap => `<code>${cap}</code>`).join('')}</div>
      <button data-node="${node.id}" data-action="${node.status === 'online' ? 'offline' : 'online'}">
        ${node.status === 'online' ? 'Simulate failure' : 'Bring online'}
      </button>
    </article>
  `).join('');

  rolesEl.innerHTML = state.roles.map(role => {
    const nodeId = state.assignments[role.id];
    return `
      <article class="lab-card">
        <div class="lab-card__top"><strong>${role.label}</strong><span>${nodeId ? 'assigned' : 'unresolved'}</span></div>
        <p>${role.requires.join(' + ')}</p>
        <div class="role-arrow">→ ${nodeLabel(nodeId)}</div>
      </article>
    `;
  }).join('');
}

nodesEl.addEventListener('click', event => {
  const button = event.target.closest('button[data-node]');
  if (!button) return;
  const nodeId = button.dataset.node;
  if (button.dataset.action === 'offline') {
    state = markNodeOffline(state, nodeId);
    log(`${nodeLabel(nodeId)} went offline. Roles recalculated.`);
  } else {
    state = heartbeat(state, nodeId);
    log(`${nodeLabel(nodeId)} rejoined. Existing valid role assignments stayed stable.`);
  }
  render();
});

goButton.addEventListener('click', () => {
  const resolved = resolveCue(state, cue);
  if (resolved.unresolved.length) {
    log(`GO blocked for ${resolved.unresolved.length} unresolved action(s).`);
  }
  resolved.commands.forEach(command => {
    log(`${command.command} → ${nodeLabel(command.target.nodeId)} via ${command.target.role}`);
  });
});

resetButton.addEventListener('click', () => {
  state = createShowState(seed);
  log('Demo reset. Nodes discovered and roles assigned.');
  render();
});

log('Protocol 0.1 demo ready. Nodes discovered and roles assigned.');
render();
