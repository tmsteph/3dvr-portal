import { ACCESS_PROFILES, PERMISSIONS } from './permissions.js';

const LABELS = Object.freeze({
  [PERMISSIONS.READ]: 'Read workspace',
  [PERMISSIONS.WRITE]: 'Edit workspace',
  [PERMISSIONS.EXPORT]: 'Export workspace',
  [PERMISSIONS.MANAGE_ACCESS]: 'Manage access',
  [PERMISSIONS.SYNC]: 'Authorize sync',
});

function cell(allowed) {
  const value = document.createElement('td');
  value.textContent = allowed ? 'Yes' : 'No';
  value.setAttribute('aria-label', allowed ? 'Allowed' : 'Not allowed');
  return value;
}

function makeMatrix() {
  const section = document.createElement('section');
  section.className = 'workspace-section panel access-matrix';
  section.setAttribute('aria-labelledby', 'accessMatrixTitle');

  const copy = document.createElement('div');
  copy.className = 'section-copy';
  copy.innerHTML = `
    <p class="eyebrow">Access matrix</p>
    <h2 id="accessMatrixTitle">Who can do what?</h2>
    <p>Authorization profiles are software permissions. Team roles remain organizational labels only.</p>`;

  const wrap = document.createElement('div');
  wrap.style.overflowX = 'auto';
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.innerHTML = '<thead><tr><th scope="col">Capability</th><th scope="col">Owner</th><th scope="col">Editor</th><th scope="col">Viewer</th></tr></thead>';
  const body = document.createElement('tbody');

  for (const permission of Object.values(PERMISSIONS)) {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = LABELS[permission] || permission;
    row.append(
      label,
      cell(ACCESS_PROFILES.owner.includes(permission)),
      cell(ACCESS_PROFILES.editor.includes(permission)),
      cell(ACCESS_PROFILES.viewer.includes(permission)),
    );
    body.append(row);
  }

  table.append(body);
  wrap.append(table);
  const note = document.createElement('p');
  note.innerHTML = '<strong>Current state:</strong> this browser is the local Owner; remote grants and sync remain disabled.';
  section.append(copy, wrap, note);
  return section;
}

function mount() {
  if (document.getElementById('accessMatrixTitle')) return;
  const invite = document.querySelector('.invite-simulator');
  const panel = makeMatrix();
  if (invite) invite.after(panel);
  else document.querySelector('.focus-board')?.after(panel);
}

window.setTimeout(mount, 0);
