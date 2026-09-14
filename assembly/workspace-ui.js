import { STORAGE_KEY, ensureWorkspaceIdentity } from './data.js';
import { createLocalOwnerPrincipal } from './permissions.js';

function readWorkspace() {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    parsed = null;
  }
  const state = ensureWorkspaceIdentity(parsed);
  const previousId = parsed?.workspace?.id || '';
  const created = previousId !== state.workspace.id;
  if (created) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return { state, created };
}

function shortId(id) {
  return id.length > 20 ? `${id.slice(0, 12)}…${id.slice(-6)}` : id;
}

function renderWorkspaceTrust() {
  const note = document.querySelector('.privacy-note');
  if (!note) return;
  const { state, created } = readWorkspace();

  // app.js may already hold pre-migration state in memory. Reload once after
  // assigning an ID so its next save cannot overwrite the new workspace identity.
  if (created) {
    window.location.reload();
    return;
  }

  const principal = createLocalOwnerPrincipal(state.workspace.id);
  let status = document.getElementById('workspaceTrust');
  if (!status) {
    status = document.createElement('div');
    status.id = 'workspaceTrust';
    status.className = 'workspace-trust';
    note.append(status);
  }
  status.replaceChildren();
  const line = document.createElement('small');
  const id = document.createElement('code');
  id.textContent = shortId(state.workspace.id);
  id.title = state.workspace.id;
  line.append('Workspace ', id, ` · ${principal.profile} · sync off`);
  const boundary = document.createElement('small');
  boundary.textContent = 'Team roles organize work; they do not grant security permissions.';
  status.append(line, boundary);
}

const scheduleRender = () => window.setTimeout(renderWorkspaceTrust, 0);
document.addEventListener('change', event => {
  if (event.target.id === 'importAssembly') scheduleRender();
});
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) renderWorkspaceTrust();
});

renderWorkspaceTrust();
