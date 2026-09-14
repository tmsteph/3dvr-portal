import { STORAGE_KEY, ensureWorkspaceIdentity } from './data.js';
import { createWorkspaceInvite } from './invite-contract.js';

let currentDraft = null;

function readWorkspace() {
  try {
    return ensureWorkspaceIdentity(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return ensureWorkspaceIdentity(null);
  }
}

function makePanel() {
  const section = document.createElement('section');
  section.className = 'workspace-section panel invite-simulator';
  section.setAttribute('aria-labelledby', 'inviteSimulatorTitle');
  section.innerHTML = `
    <div class="section-copy">
      <p class="eyebrow">Invite simulator</p>
      <h2 id="inviteSimulatorTitle">Prepare access without sharing yet.</h2>
      <p>Create an unsigned draft invitation to inspect recipient, profile, and expiry before trusted delivery exists.</p>
    </div>
    <form id="inviteDraftForm" class="quick-form three">
      <label>Recipient principal <input id="inviteRecipient" required placeholder="person_…" /></label>
      <label>Access
        <select id="inviteProfile">
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="owner">Owner</option>
        </select>
      </label>
      <label>Expires
        <select id="inviteExpiry">
          <option value="1">1 hour</option>
          <option value="24" selected>24 hours</option>
          <option value="168">7 days</option>
        </select>
      </label>
      <button class="button primary" type="submit">Prepare draft</button>
    </form>
    <div id="inviteDraftResult" hidden>
      <p><strong>Unsigned draft — this cannot authorize access.</strong></p>
      <pre id="inviteDraftPreview"></pre>
      <button id="downloadInviteDraft" class="button" type="button">Export draft JSON</button>
    </div>`;
  document.querySelector('.focus-board')?.after(section);
  return section;
}

function renderDraft(invite) {
  const result = document.getElementById('inviteDraftResult');
  const preview = document.getElementById('inviteDraftPreview');
  preview.textContent = JSON.stringify(invite, null, 2);
  result.hidden = false;
}

function downloadDraft() {
  if (!currentDraft) return;
  const blob = new Blob([JSON.stringify(currentDraft, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${currentDraft.inviteId}.assembly-invite-draft.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bindPanel() {
  if (!document.getElementById('inviteSimulatorTitle')) makePanel();
  const form = document.getElementById('inviteDraftForm');
  if (form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', event => {
    event.preventDefault();
    const state = readWorkspace();
    const hours = Number(document.getElementById('inviteExpiry').value || 24);
    currentDraft = createWorkspaceInvite({
      workspaceId: state.workspace.id,
      issuerPrincipalId: `local-owner:${state.workspace.id}`,
      recipientPrincipalId: document.getElementById('inviteRecipient').value.trim(),
      profile: document.getElementById('inviteProfile').value,
      expiresAt: Date.now() + hours * 60 * 60 * 1000,
    });
    renderDraft(currentDraft);
  });

  document.getElementById('downloadInviteDraft').addEventListener('click', downloadDraft);
}

window.setTimeout(bindPanel, 0);
