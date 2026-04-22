const CRM_NODE_KEY = '3dvr-crm';
const TOUCH_LOG_NODE_PATH = ['3dvr-portal', 'crm-touch-log'];
const OUTREACH_ARTIFACT_NODE_PATH = ['3dvr', 'crm', 'outreach-artifacts'];

const state = {
  profiles: new Map(),
  artifacts: new Map(),
  sent: new Map(),
  activeProfileId: '',
  pendingArtifactId: new URLSearchParams(window.location.search).get('artifact') || '',
  pendingArtifactLoaded: false,
};

const elements = {
  profileStatus: document.getElementById('profileStatus'),
  artifactStatus: document.getElementById('artifactStatus'),
  sentStatus: document.getElementById('sentStatus'),
  profileList: document.getElementById('profileList'),
  artifactList: document.getElementById('artifactList'),
  sentList: document.getElementById('sentList'),
  profileForm: document.getElementById('profileForm'),
  profileName: document.getElementById('profileName'),
  profileEmail: document.getElementById('profileEmail'),
  profileWebsite: document.getElementById('profileWebsite'),
  profileNotes: document.getElementById('profileNotes'),
  profileSaveStatus: document.getElementById('profileSaveStatus'),
  artifactForm: document.getElementById('artifactForm'),
  artifactLeadName: document.getElementById('artifactLeadName'),
  artifactDraft: document.getElementById('artifactDraft'),
  artifactFiles: document.getElementById('artifactFiles'),
  artifactSaveStatus: document.getElementById('artifactSaveStatus'),
  sentForm: document.getElementById('sentForm'),
  sentArtifactId: document.getElementById('sentArtifactId'),
  sentLeadName: document.getElementById('sentLeadName'),
  sentChannel: document.getElementById('sentChannel'),
  sentMessage: document.getElementById('sentMessage'),
  sentFollowUp: document.getElementById('sentFollowUp'),
  sentSaveStatus: document.getElementById('sentSaveStatus'),
  countProfiles: document.querySelector('[data-count="profiles"]'),
  countArtifacts: document.querySelector('[data-count="artifacts"]'),
  countSent: document.querySelector('[data-count="sent"]'),
};

function createGun() {
  if (typeof window.Gun !== 'function') {
    return null;
  }

  const peers = window.__GUN_PEERS__ || [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun',
    'https://gun-relay-3dvr.fly.dev/gun',
  ];

  try {
    return window.Gun({ peers });
  } catch (error) {
    console.warn('Outreach CRM Gun init failed', error);
    try {
      return window.Gun({ peers, radisk: false, localStorage: false });
    } catch (fallbackError) {
      console.warn('Outreach CRM Gun fallback failed', fallbackError);
      return null;
    }
  }
}

function getNodeFromPath(gun, path) {
  return path.reduce((node, part) => node.get(part), gun);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeAttr(value) {
  return safe(value).replace(/"/g, '&quot;');
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getParticipantLabel() {
  return String(
    localStorage.getItem('username')
      || localStorage.getItem('alias')
      || localStorage.getItem('guestDisplayName')
      || 'Guest'
  ).trim();
}

function getParticipantId() {
  return String(
    localStorage.getItem('username')
      || localStorage.getItem('alias')
      || localStorage.getItem('guestId')
      || 'guest'
  ).trim();
}

function normalizeProfile(data = {}, id = '') {
  const profileId = String(data.id || data.contactId || id || '').trim();
  const name = String(data.name || data.leadName || data.company || data.email || '').trim();

  return {
    ...data,
    id: profileId,
    recordType: String(data.recordType || 'person').trim(),
    name,
    email: String(data.email || '').trim(),
    website: String(data.website || data.link || '').trim(),
    notes: String(data.notes || data.profileNotes || '').trim(),
    status: String(data.status || 'Lead').trim(),
    nextFollowUp: String(data.nextFollowUp || '').trim(),
    updatedAt: String(data.updatedAt || data.updated || '').trim(),
  };
}

function normalizeArtifact(data = {}, id = '') {
  let attachments = [];
  try {
    attachments = JSON.parse(data.attachmentsJson || '[]');
  } catch (error) {
    attachments = [];
  }

  return {
    ...data,
    id: String(data.id || id || '').trim(),
    leadName: String(data.leadName || data.name || id || '').trim(),
    draftText: String(data.draftText || '').trim(),
    attachmentCount: Number(data.attachmentCount || attachments.length || 0),
    attachments,
    updatedAt: String(data.updatedAt || data.updated || '').trim(),
  };
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const result = String(reader.result || '');
      const [, data = ''] = result.split(',');
      resolve({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        encoding: 'base64',
        data,
      });
    });
    reader.addEventListener('error', () => reject(reader.error || new Error('File read failed')));
    reader.readAsDataURL(file);
  });
}

function normalizeSent(data = {}, id = '') {
  return {
    ...data,
    id: String(data.id || id || '').trim(),
    contactName: String(data.contactName || data.leadName || data.name || '').trim(),
    timestamp: String(data.timestamp || data.time || data.updatedAt || '').trim(),
    note: String(data.note || data.message || '').trim(),
    touchType: String(data.touchType || '').trim(),
    touchTypeLabel: String(data.touchTypeLabel || data.touchType || 'Touch').trim(),
    source: String(data.source || '').trim(),
    channel: String(data.channel || '').trim(),
    artifactId: String(data.artifactId || '').trim(),
    followUp: String(data.followUp || '').trim(),
    loggedBy: String(data.loggedBy || '').trim(),
  };
}

function updateCounts() {
  elements.countProfiles.textContent = String(state.profiles.size);
  elements.countArtifacts.textContent = String(state.artifacts.size);
  elements.countSent.textContent = String(
    Array.from(state.sent.values()).filter((entry) => entry.touchType === 'outreach-sent').length
  );
}

function getRecentSentEntries(limit = 12) {
  return Array.from(state.sent.values())
    .filter((entry) => entry.touchType === 'outreach-sent')
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, limit);
}

function getMatchingProfile(leadName) {
  const leadSlug = slugify(leadName);
  return Array.from(state.profiles.values()).find((profile) => {
    return slugify(profile.name) === leadSlug || slugify(profile.company) === leadSlug || profile.id === leadSlug;
  });
}

function renderProfiles() {
  const profiles = Array.from(state.profiles.values())
    .filter((profile) => profile.name)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 30);

  elements.profileStatus.textContent = profiles.length
    ? `${profiles.length} customer profiles loaded from Gun.`
    : 'No customer profiles yet. Save the first one here or create it from a message artifact.';

  elements.profileList.innerHTML = profiles.length
    ? profiles.map((profile) => `
      <article class="rounded-xl border border-white/5 bg-slate-950/70 p-4 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-white">${safe(profile.name)}</h3>
            <p class="text-xs text-slate-400">${safe(profile.status || 'Lead')}${profile.nextFollowUp ? ` · Follow-up ${safe(profile.nextFollowUp)}` : ''}</p>
          </div>
          <button
            type="button"
            data-action="use-profile"
            data-profile-id="${safeAttr(profile.id)}"
            class="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
          >Use</button>
        </div>
        ${profile.website ? `<a href="${safeAttr(profile.website)}" class="text-sm text-emerald-200 underline underline-offset-2">${safe(profile.website)}</a>` : ''}
        ${profile.email ? `<p class="text-sm text-slate-300">${safe(profile.email)}</p>` : ''}
        ${profile.notes ? `<p class="text-sm text-slate-300 whitespace-pre-wrap">${safe(profile.notes)}</p>` : ''}
      </article>
    `).join('')
    : '<p class="rounded-xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-sm text-slate-400">Customer profile records will appear here.</p>';
}

function renderArtifacts() {
  const artifacts = Array.from(state.artifacts.values())
    .filter((artifact) => artifact.leadName || artifact.draftText)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  elements.artifactStatus.textContent = artifacts.length
    ? `${artifacts.length} potential message artifacts loaded from the local agent Gun path.`
    : 'No agent message artifacts found yet. Use ask-artifact save from the local agent.';

  elements.artifactList.innerHTML = artifacts.length
    ? artifacts.map((artifact) => {
      const profile = getMatchingProfile(artifact.leadName);
      return `
        <article class="rounded-2xl border border-white/5 bg-slate-950/70 p-4 space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold text-white">${safe(artifact.leadName || artifact.id)}</h3>
              <p class="text-xs text-slate-400">
                ${artifact.updatedAt ? `Saved ${safe(formatTimestamp(artifact.updatedAt))}` : 'Saved by local agent'}
                ${profile ? ` · Profile linked` : ' · No profile match yet'}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                data-action="load-message"
                data-artifact-id="${safeAttr(artifact.id)}"
                class="rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-200"
              >Load message</button>
              <button
                type="button"
                data-action="create-profile"
                data-artifact-id="${safeAttr(artifact.id)}"
                class="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >Profile</button>
            </div>
          </div>
          <pre class="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/5 bg-slate-900/80 p-3 text-sm text-slate-200">${safe(artifact.draftText || 'No draft text stored.')}</pre>
          <div class="grid gap-3 sm:grid-cols-2">
            ${artifact.attachments.length ? artifact.attachments.map((attachment) => renderAttachment(attachment)).join('') : '<p class="text-sm text-slate-400">No screenshots attached.</p>'}
          </div>
        </article>
      `;
    }).join('')
    : '<p class="rounded-xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-sm text-slate-400">Potential messages and screenshots will appear here after `ask-artifact save`.</p>';
}

function renderAttachment(attachment) {
  if (!attachment || !attachment.data) {
    return '';
  }

  const mime = String(attachment.mime || 'application/octet-stream');
  const name = String(attachment.name || 'attachment');
  const src = `data:${mime};base64,${attachment.data}`;

  if (mime.startsWith('image/')) {
    return `
      <figure class="rounded-xl border border-white/5 bg-slate-900/80 p-2">
        <img src="${safeAttr(src)}" alt="${safeAttr(name)}" class="max-h-72 w-full rounded-lg object-contain" loading="lazy" />
        <figcaption class="mt-2 text-xs text-slate-400">${safe(name)} · ${safe(String(attachment.size || 0))} bytes</figcaption>
      </figure>
    `;
  }

  return `<p class="text-sm text-slate-400">${safe(name)} · ${safe(mime)}</p>`;
}

function renderSent() {
  const entries = getRecentSentEntries();

  elements.sentStatus.textContent = entries.length
    ? `${entries.length} recent sent outreach messages loaded from the shared touch log.`
    : 'No sent outreach logged yet. Load a draft, send it, then log the touch.';

  elements.sentList.innerHTML = entries.length
    ? entries.map((entry) => `
      <article class="rounded-xl border border-white/5 bg-slate-950/70 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-white">${safe(entry.contactName || 'Unnamed lead')}</h3>
            <p class="text-xs text-slate-400">${safe(formatTimestamp(entry.timestamp))}${entry.channel ? ` · ${safe(entry.channel)}` : ''}</p>
          </div>
          <span class="rounded-full bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-100">${safe(entry.source || 'Outreach CRM')}</span>
        </div>
        ${entry.note ? `<p class="mt-3 text-sm text-slate-300 whitespace-pre-wrap">${safe(entry.note)}</p>` : ''}
        <p class="mt-3 text-xs text-slate-500">Logged by ${safe(entry.loggedBy || 'Unknown')}${entry.followUp ? ` · Follow-up ${safe(entry.followUp)}` : ''}</p>
      </article>
    `).join('')
    : '<p class="rounded-xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-sm text-slate-400">Sent messages will appear here after you log them.</p>';
}

function renderAll() {
  updateCounts();
  renderProfiles();
  renderArtifacts();
  renderSent();
  loadPendingArtifact();
}

function saveProfile(event) {
  event.preventDefault();
  if (!crmRecordsNode) return;

  const name = elements.profileName.value.trim();
  if (!name) {
    elements.profileSaveStatus.textContent = 'Name is required.';
    return;
  }

  const id = state.activeProfileId || slugify(name);
  const existing = state.profiles.get(id) || {};
  const now = new Date().toISOString();
  const payload = normalizeProfile({
    ...existing,
    id,
    recordType: existing.recordType || 'person',
    name,
    email: elements.profileEmail.value.trim(),
    website: elements.profileWebsite.value.trim(),
    notes: elements.profileNotes.value.trim(),
    status: existing.status || 'Lead',
    updatedAt: now,
  }, id);

  crmRecordsNode.get(id).put(payload, (ack = {}) => {
    if (ack.err) {
      elements.profileSaveStatus.textContent = `Profile save failed: ${ack.err}`;
      return;
    }
    state.profiles.set(id, payload);
    state.activeProfileId = id;
    elements.profileSaveStatus.textContent = `Saved ${name}.`;
    renderAll();
  });
}

function loadProfile(profileId) {
  const profile = state.profiles.get(profileId);
  if (!profile) return;

  state.activeProfileId = profile.id;
  elements.profileName.value = profile.name || '';
  elements.profileEmail.value = profile.email || '';
  elements.profileWebsite.value = profile.website || '';
  elements.profileNotes.value = profile.notes || '';
  elements.sentLeadName.value = profile.name || '';
}

function createProfileFromArtifact(artifactId) {
  const artifact = state.artifacts.get(artifactId);
  if (!artifact || !artifact.leadName) return;

  const id = slugify(artifact.leadName);
  const existing = state.profiles.get(id) || {};
  const now = new Date().toISOString();
  const payload = normalizeProfile({
    ...existing,
    id,
    recordType: existing.recordType || 'person',
    name: existing.name || artifact.leadName,
    notes: existing.notes || `Outreach artifact saved from local agent.\n\n${artifact.draftText.slice(0, 500)}`,
    status: existing.status || 'Lead',
    updatedAt: now,
  }, id);

  crmRecordsNode.get(id).put(payload, (ack = {}) => {
    if (ack.err) {
      elements.profileSaveStatus.textContent = `Profile sync failed: ${ack.err}`;
      return;
    }
    state.profiles.set(id, payload);
    loadProfile(id);
    renderAll();
  });
}

async function saveArtifact(event) {
  event.preventDefault();
  if (!artifactNode) return;

  const leadName = elements.artifactLeadName.value.trim();
  const draftText = elements.artifactDraft.value.trim();
  if (!leadName || !draftText) {
    elements.artifactSaveStatus.textContent = 'Lead name and message are required.';
    return;
  }

  elements.artifactSaveStatus.textContent = 'Reading screenshots…';
  const id = slugify(leadName);
  const files = Array.from(elements.artifactFiles.files || []);
  let attachments = [];

  try {
    attachments = await Promise.all(files.map(readFileAsBase64));
  } catch (error) {
    elements.artifactSaveStatus.textContent = `Screenshot read failed: ${error.message}`;
    return;
  }

  const existing = state.artifacts.get(id) || {};
  const now = new Date().toISOString();
  const payload = normalizeArtifact({
    ...existing,
    id,
    leadName,
    draftText,
    attachmentsJson: JSON.stringify(attachments),
    attachmentCount: attachments.length,
    updatedAt: now,
    createdAt: existing.createdAt || now,
  }, id);

  artifactNode.get(id).put({
    ...payload,
    attachmentsJson: JSON.stringify(attachments),
  }, (ack = {}) => {
    if (ack.err) {
      elements.artifactSaveStatus.textContent = `Artifact save failed: ${ack.err}`;
      return;
    }

    state.artifacts.set(id, payload);
    elements.artifactSaveStatus.textContent = `Saved potential message for ${leadName}.`;
    elements.artifactFiles.value = '';
    renderAll();
  });
}

function loadMessageFromArtifact(artifactId) {
  const artifact = state.artifacts.get(artifactId);
  if (!artifact) return;

  elements.sentArtifactId.value = artifact.id || '';
  elements.sentLeadName.value = artifact.leadName || '';
  elements.sentMessage.value = artifact.draftText || '';
  elements.sentMessage.focus();
}

function loadPendingArtifact() {
  if (state.pendingArtifactLoaded || !state.pendingArtifactId) {
    return;
  }

  const artifact = state.artifacts.get(state.pendingArtifactId);
  if (!artifact) {
    return;
  }

  state.pendingArtifactLoaded = true;
  loadMessageFromArtifact(state.pendingArtifactId);
  elements.artifactSaveStatus.textContent = `Loaded handoff for ${artifact.leadName}.`;
}

function saveSentMessage(event) {
  event.preventDefault();
  if (!touchLogNode) return;

  const leadName = elements.sentLeadName.value.trim();
  const message = elements.sentMessage.value.trim();
  if (!leadName || !message) {
    elements.sentSaveStatus.textContent = 'Lead name and message are required.';
    return;
  }

  const artifactId = elements.sentArtifactId.value.trim();
  const profile = getMatchingProfile(leadName);
  const logId = `${slugify(leadName) || 'outreach'}-${Date.now()}`;
  const timestamp = new Date().toISOString();
  const entry = normalizeSent({
    id: logId,
    recordId: profile ? profile.id : slugify(leadName),
    crmRecordId: profile ? profile.id : '',
    contactName: leadName,
    timestamp,
    followUp: elements.sentFollowUp.value,
    note: message,
    touchType: 'outreach-sent',
    touchTypeLabel: 'Outreach sent',
    source: 'Outreach CRM',
    channel: elements.sentChannel.value,
    artifactId,
    participantId: getParticipantId(),
    loggedBy: getParticipantLabel(),
  }, logId);

  touchLogNode.get(logId).put(entry, (ack = {}) => {
    if (ack.err) {
      elements.sentSaveStatus.textContent = `Sent log failed: ${ack.err}`;
      return;
    }

    state.sent.set(logId, entry);
    elements.sentSaveStatus.textContent = `Logged sent message for ${leadName}.`;
    elements.sentArtifactId.value = '';
    elements.sentMessage.value = '';
    renderAll();
  });
}

function handlePageClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  if (action === 'load-message') {
    loadMessageFromArtifact(target.dataset.artifactId);
  } else if (action === 'create-profile') {
    createProfileFromArtifact(target.dataset.artifactId);
  } else if (action === 'use-profile') {
    loadProfile(target.dataset.profileId);
  }
}

function subscribeMap(node, map, normalizer, onRender) {
  if (!node || typeof node.map !== 'function') {
    return;
  }

  node.map().on((data, id) => {
    if (!id) return;
    if (!data) {
      map.delete(id);
    } else {
      map.set(id, normalizer(data, id));
    }
    onRender();
  });
}

const outreachGun = createGun();
const crmRecordsNode = outreachGun ? outreachGun.get(CRM_NODE_KEY) : null;
const artifactNode = outreachGun ? getNodeFromPath(outreachGun, OUTREACH_ARTIFACT_NODE_PATH) : null;
const touchLogNode = outreachGun ? getNodeFromPath(outreachGun, TOUCH_LOG_NODE_PATH) : null;

if (!outreachGun) {
  elements.profileStatus.textContent = 'Gun is unavailable. Customer profiles cannot sync.';
  elements.artifactStatus.textContent = 'Gun is unavailable. Potential messages cannot sync.';
  elements.sentStatus.textContent = 'Gun is unavailable. Sent messages cannot sync.';
} else {
  subscribeMap(crmRecordsNode, state.profiles, normalizeProfile, renderAll);
  subscribeMap(artifactNode, state.artifacts, normalizeArtifact, renderAll);
  subscribeMap(touchLogNode, state.sent, normalizeSent, renderAll);
}

elements.profileForm.addEventListener('submit', saveProfile);
elements.artifactForm.addEventListener('submit', saveArtifact);
elements.sentForm.addEventListener('submit', saveSentMessage);
document.addEventListener('click', handlePageClick);
renderAll();
