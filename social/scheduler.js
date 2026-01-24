import {
  createScheduleId,
  formatFileSize,
  formatRelativeTime,
  formatScheduleWindow,
  labelForStatus,
  sanitizeRecord,
  scheduleSortKey
} from './scheduler-utils.js';

const socialGun = window.SocialGun || {};
const scoreSystem = window.ScoreSystem || {};

const resolveGunNodeStub = typeof socialGun.resolveGunNodeStub === 'function'
  ? socialGun.resolveGunNodeStub
  : createBasicGunNodeStub;
const resolveGunUserStub = typeof socialGun.resolveGunUserStub === 'function'
  ? socialGun.resolveGunUserStub
  : createBasicGunUserStub;
const ensureGunContext = typeof socialGun.ensureGunContext === 'function'
  ? socialGun.ensureGunContext
  : createBasicGunContext;
const recallUserSessionIfAvailable = typeof socialGun.recallUserSessionIfAvailable === 'function'
  ? socialGun.recallUserSessionIfAvailable
  : function() {};

const scheduleForm = document.getElementById('scheduleForm');
const scheduleList = document.getElementById('scheduleList');
const scheduleEmpty = document.getElementById('scheduleEmpty');
const scheduleFilterEmpty = document.getElementById('scheduleFilterEmpty');
const scheduleStatusSelect = document.getElementById('scheduleStatus');
const scheduleDateInput = document.getElementById('scheduleDate');
const scheduleUploadInput = document.getElementById('scheduleMediaUpload');
const scheduleUploadList = document.getElementById('scheduleUploadList');
const scheduleUploadFeedback = document.getElementById('scheduleUploadFeedback');
const statusFilterInputs = Array.from(document.querySelectorAll('[data-status-filter]'));
const scheduleFilterReset = document.getElementById('scheduleFilterReset');
const calendarGrid = document.getElementById('calendarGrid');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');
const calendarPrev = document.getElementById('calendarPrev');
const calendarNext = document.getElementById('calendarNext');

const scheduleRecords = new Map();
const scheduleAssetOverrides = new Map();
const activeStatuses = new Set();
let activeMonth = new Date();

const MAX_ASSET_BYTES = 10 * 1024 * 1024;

const gunContext = ensureGunContext(() => (typeof Gun === 'function'
  ? Gun(window.__GUN_PEERS__ || [
      'wss://relay.3dvr.tech/gun',
      'wss://gun-relay-3dvr.fly.dev/gun'
    ])
  : null), { label: 'social-scheduler' });

const gun = gunContext.gun;
const user = gunContext.user;
const socialRoot = gun && typeof gun.get === 'function'
  ? gun.get('social-media')
  : resolveGunNodeStub();
// Node shape: social-media/post-schedule/<id> -> {
//   title, platforms, status, scheduledDate, assets: [{ name, type, size, dataUrl }], ...
// }
const scheduleNode = socialRoot && typeof socialRoot.get === 'function'
  ? socialRoot.get('post-schedule')
  : resolveGunNodeStub();
const portalRoot = gun && typeof gun.get === 'function'
  ? gun.get('3dvr-portal')
  : resolveGunNodeStub();
// Workspace metadata lives under 3dvr-portal/workspaces/social-scheduler.
const workspaceRegistry = portalRoot && typeof portalRoot.get === 'function'
  ? portalRoot.get('workspaces').get('social-scheduler')
  : resolveGunNodeStub();

recallUserSessionIfAvailable(user);

if (scoreSystem && typeof scoreSystem.ensureGuestIdentity === 'function') {
  try {
    scoreSystem.ensureGuestIdentity();
  } catch (err) {
    console.warn('Failed to ensure guest identity for post scheduler', err);
  }
}

if (scheduleStatusSelect) {
  scheduleStatusSelect.value = 'scheduled';
}

if (scheduleDateInput) {
  scheduleDateInput.value = todayDate();
}

if (scheduleUploadInput) {
  scheduleUploadInput.addEventListener('change', handleUploadSelection);
}

if (statusFilterInputs.length) {
  statusFilterInputs.forEach((input) => {
    activeStatuses.add(input.value);
    input.addEventListener('change', handleFilterChange);
  });
}

if (scheduleFilterReset) {
  scheduleFilterReset.addEventListener('click', resetStatusFilters);
}

if (calendarPrev) {
  calendarPrev.addEventListener('click', () => shiftCalendarMonth(-1));
}

if (calendarNext) {
  calendarNext.addEventListener('click', () => shiftCalendarMonth(1));
}

if (scheduleForm) {
  scheduleForm.addEventListener('submit', handleScheduleSubmit);
}

if (scheduleList) {
  scheduleList.addEventListener('change', handleScheduleListChange);
  scheduleList.addEventListener('click', handleScheduleListClick);
}

registerWorkspacePresence();
renderCalendar();

if (scheduleNode && typeof scheduleNode.map === 'function') {
  scheduleNode.map().on((data, id) => {
    handleScheduleUpdate(data, id);
  }, { change: true });
}

function createBasicGunNodeStub() {
  const node = {
    __isGunStub: true,
    get() {
      return createBasicGunNodeStub();
    },
    put() {
      return node;
    },
    map() {
      return {
        on() {
          return { off() {} };
        }
      };
    },
    set() {
      return node;
    }
  };
  return node;
}

function createBasicGunUserStub(node) {
  return node || createBasicGunNodeStub();
}

function createBasicGunContext(factory) {
  let instance = null;
  if (typeof factory === 'function') {
    try {
      instance = factory();
    } catch (err) {
      console.warn('Failed to initialize Gun for scheduler', err);
    }
  }

  if (instance) {
    const resolvedUser = typeof instance.user === 'function'
      ? instance.user()
      : resolveGunUserStub(instance);
    return {
      gun: instance,
      user: resolvedUser,
      isStub: !!instance.__isGunStub
    };
  }

  const stubGun = {
    __isGunStub: true,
    get() {
      return resolveGunNodeStub();
    },
    user() {
      return resolveGunUserStub();
    }
  };
  return { gun: stubGun, user: stubGun.user(), isStub: true };
}

function registerWorkspacePresence() {
  if (!workspaceRegistry || typeof workspaceRegistry.put !== 'function') {
    return;
  }
  const payload = {
    name: 'Post Scheduling Studio',
    description: 'Plan social posts with timing, assets, and approvals.',
    lastOpenedAt: Date.now()
  };
  try {
    workspaceRegistry.put(payload);
  } catch (err) {
    console.warn('Failed to register scheduler workspace metadata', err);
  }
}

function markWorkspaceActivity(field) {
  if (!workspaceRegistry || typeof workspaceRegistry.put !== 'function') {
    return;
  }
  if (!field) return;
  try {
    workspaceRegistry.put({ [field]: Date.now() });
  } catch (err) {
    console.warn(`Failed to update scheduler workspace field ${field}`, err);
  }
}

function todayDate() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

  function handleUploadSelection(event) {
    const input = event.target;
    if (!input || !scheduleUploadList) return;
    const files = input.files ? Array.from(input.files) : [];
    renderUploadList(files, scheduleUploadList);
    if (scheduleUploadFeedback) {
      scheduleUploadFeedback.textContent = files.length
        ? `${files.length} file${files.length === 1 ? '' : 's'} ready to upload.`
        : '';
    }
  }

  function renderUploadList(files, listEl) {
    listEl.innerHTML = '';
    if (!files.length) return;
    files.forEach((file) => {
      const item = document.createElement('li');
      item.textContent = `${file.name} (${formatFileSize(file.size)})`;
      listEl.appendChild(item);
    });
  }

  async function resolveUploads(fileList) {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return [];
    const oversized = files.filter((file) => file.size > MAX_ASSET_BYTES);
    if (oversized.length && scheduleUploadFeedback) {
      scheduleUploadFeedback.textContent = 'Some files exceed 10MB and were skipped.';
    }
    const validFiles = files.filter((file) => file.size <= MAX_ASSET_BYTES);
    if (!validFiles.length) return [];
    return readFilesAsDataUrls(validFiles);
  }

  function readFilesAsDataUrls(files) {
    return Promise.all(files.map((file) => readFileAsDataUrl(file)));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: reader.result
        });
      };
      reader.onerror = () => {
        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: ''
        });
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleScheduleSubmit(event) {
  event.preventDefault();
  if (!scheduleForm) return;

    const title = scheduleForm.scheduleTitle.value.trim();
    const platforms = scheduleForm.schedulePlatforms.value.trim();
    const scheduledDate = scheduleForm.scheduleDate.value;

    if (!title || !platforms || !scheduledDate) {
      scheduleForm.reportValidity();
      return;
    }

  const assets = await resolveUploads(scheduleUploadInput ? scheduleUploadInput.files : null);
  const record = {
    title,
    platforms,
    status: scheduleForm.scheduleStatus.value || 'scheduled',
    scheduledDate,
      scheduledTime: scheduleForm.scheduleTime.value,
      timezone: scheduleForm.scheduleTimezone.value.trim(),
      mediaType: scheduleForm.scheduleMediaType.value,
      mediaUrl: scheduleForm.scheduleMediaUrl.value.trim(),
      altText: scheduleForm.scheduleAltText.value.trim(),
      owner: scheduleForm.scheduleOwner.value.trim(),
      caption: scheduleForm.scheduleCaption.value.trim(),
      hashtags: scheduleForm.scheduleHashtags.value.trim(),
      cta: scheduleForm.scheduleCta.value.trim(),
      notes: scheduleForm.scheduleNotes.value.trim(),
      assets,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  try {
    const recordId = createScheduleId();
    scheduleNode.get(recordId).put(record);
    handleScheduleUpdate(record, recordId);
    markWorkspaceActivity('lastScheduleChangeAt');
    scheduleForm.reset();
    if (scheduleStatusSelect) {
        scheduleStatusSelect.value = 'scheduled';
      }
      if (scheduleDateInput) {
        scheduleDateInput.value = todayDate();
      }
      if (scheduleUploadList) {
        scheduleUploadList.innerHTML = '';
      }
    if (scheduleUploadFeedback) {
      scheduleUploadFeedback.textContent = '';
    }
  } catch (err) {
    console.error('Failed to store scheduled post', err);
  }
}

  function handleScheduleUpdate(data, id) {
    markWorkspaceActivity('lastScheduleSyncAt');
    const record = sanitizeRecord(data);
    if (!record) {
      scheduleRecords.delete(id);
      scheduleAssetOverrides.delete(id);
      removeScheduleCard(id);
      updateScheduleEmptyState();
      updateScheduleFilterEmptyState();
      renderCalendar();
      return;
    }

    scheduleRecords.set(id, record);
    const card = ensureScheduleCard(id);
    renderScheduleCard(card, record);
    updateScheduleOrdering();
    updateScheduleEmptyState();
    updateScheduleVisibility();
    updateScheduleFilterEmptyState();
    renderCalendar();
  }

  function handleScheduleListChange(event) {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.dataset.scheduleId) {
      const id = target.dataset.scheduleId;
      scheduleNode.get(id).put({ status: target.value, updatedAt: Date.now() });
      markWorkspaceActivity('lastScheduleChangeAt');
    } else if (target instanceof HTMLInputElement && target.dataset.scheduleAssets && target.files) {
      const id = target.dataset.scheduleAssets;
      scheduleAssetOverrides.set(id, target.files);
      showInlineFeedback(target.closest('.schedule-card'), 'New uploads selected. Save to apply.');
    }
  }

  function handleScheduleListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const id = target.dataset.scheduleId;
    if (!id) return;

  if (action === 'delete-schedule') {
    scheduleNode.get(id).put(null);
    markWorkspaceActivity('lastScheduleChangeAt');
    scheduleRecords.delete(id);
    scheduleAssetOverrides.delete(id);
    removeScheduleCard(id);
    updateScheduleEmptyState();
    updateScheduleVisibility();
    updateScheduleFilterEmptyState();
    renderCalendar();
    return;
  }

    if (action === 'edit-schedule') {
      toggleScheduleEdit(id);
      return;
    }

    if (action === 'save-schedule') {
      saveScheduleEdits(id).catch((err) => {
        console.error('Failed to save schedule edits', err);
      });
      return;
    }

    if (action === 'cancel-schedule') {
      cancelScheduleEdits(id);
    }
  }

  function ensureScheduleCard(id) {
    let card = scheduleList.querySelector(`[data-schedule-id="${id}"]`);
    if (card) return card;
    card = createScheduleCard(id);
    scheduleList.prepend(card);
    return card;
  }

  function createScheduleCard(id) {
    const card = document.createElement('div');
    card.className = 'schedule-card';
    card.dataset.scheduleId = id;

    const header = document.createElement('div');
    header.className = 'card-header';

    const title = document.createElement('h3');
    title.dataset.role = 'scheduleTitle';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.role = 'scheduleStatus';
    actions.appendChild(badge);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.dataset.action = 'delete-schedule';
    deleteButton.dataset.scheduleId = id;
    deleteButton.textContent = 'Delete';
    actions.appendChild(deleteButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'ghost-action';
    editButton.dataset.action = 'edit-schedule';
    editButton.dataset.scheduleId = id;
    editButton.textContent = 'Edit';
    actions.appendChild(editButton);

    header.appendChild(actions);
    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const dateLine = document.createElement('span');
    dateLine.dataset.role = 'scheduleWindow';
    meta.appendChild(dateLine);

    const platformLine = document.createElement('span');
    platformLine.dataset.role = 'schedulePlatforms';
    meta.appendChild(platformLine);

    const mediaLine = document.createElement('span');
    mediaLine.dataset.role = 'scheduleMedia';
    meta.appendChild(mediaLine);

    const ownerLine = document.createElement('span');
    ownerLine.dataset.role = 'scheduleOwner';
    meta.appendChild(ownerLine);

    card.appendChild(meta);

    const statusField = document.createElement('label');
    statusField.className = 'field';
    const statusLabel = document.createElement('span');
    statusLabel.className = 'field__label';
    statusLabel.textContent = 'Status';
    const statusSelect = document.createElement('select');
    statusSelect.dataset.scheduleId = id;
    ['idea', 'drafting', 'scheduled', 'queued', 'published'].forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = labelForStatus(value);
      statusSelect.appendChild(option);
    });
    statusField.append(statusLabel, statusSelect);
    card.appendChild(statusField);

    const summary = document.createElement('div');
    summary.className = 'schedule-summary';

    const captionLine = document.createElement('p');
    captionLine.dataset.role = 'scheduleCaption';
    summary.appendChild(captionLine);

    const ctaLine = document.createElement('p');
    ctaLine.dataset.role = 'scheduleCta';
    summary.appendChild(ctaLine);

    const hashtagsLine = document.createElement('p');
    hashtagsLine.dataset.role = 'scheduleHashtags';
    summary.appendChild(hashtagsLine);

    const assetsLine = document.createElement('p');
    assetsLine.dataset.role = 'scheduleAssets';
    summary.appendChild(assetsLine);

    const mediaLinkLine = document.createElement('p');
    mediaLinkLine.dataset.role = 'scheduleMediaLink';
    summary.appendChild(mediaLinkLine);

    const notesLine = document.createElement('p');
    notesLine.dataset.role = 'scheduleNotes';
    summary.appendChild(notesLine);

    card.appendChild(summary);

    const editSection = createScheduleEditSection(id);
    card.appendChild(editSection.wrapper);

    card.titleEl = title;
    card.badgeEl = badge;
    card.dateLine = dateLine;
    card.platformLine = platformLine;
    card.mediaLine = mediaLine;
    card.ownerLine = ownerLine;
    card.statusSelect = statusSelect;
    card.captionLine = captionLine;
    card.ctaLine = ctaLine;
    card.hashtagsLine = hashtagsLine;
    card.assetsLine = assetsLine;
    card.mediaLinkLine = mediaLinkLine;
    card.notesLine = notesLine;
    card.editSection = editSection;
    card.editButton = editButton;

    return card;
  }

  function createScheduleEditSection(id) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card-edit';
    wrapper.hidden = true;
    wrapper.dataset.editSection = 'schedule';

    const fields = document.createElement('div');
    fields.className = 'form-grid';

    const titleField = createEditField('Post title', 'title', id);
    const platformsField = createEditField('Platforms', 'platforms', id);
    const dateField = createEditField('Scheduled date', 'scheduledDate', id, 'date');
    const timeField = createEditField('Scheduled time', 'scheduledTime', id, 'time');
    const timezoneField = createEditField('Time zone', 'timezone', id);
    const mediaTypeField = createEditField('Content type', 'mediaType', id);
    const mediaUrlField = createEditField('Primary asset URL', 'mediaUrl', id, 'url');
    const uploadField = createUploadField(id);
    const ownerField = createEditField('Approval owner', 'owner', id);

    fields.append(
      titleField.wrapper,
      platformsField.wrapper,
      dateField.wrapper,
      timeField.wrapper,
      timezoneField.wrapper,
      mediaTypeField.wrapper,
      mediaUrlField.wrapper,
      uploadField.wrapper,
      ownerField.wrapper
    );
    wrapper.appendChild(fields);

    const captionField = createEditArea('Caption draft', 'caption', id);
    wrapper.appendChild(captionField.wrapper);

    const hashtagsField = createEditField('Hashtags / keywords', 'hashtags', id);
    const ctaField = createEditField('Call to action', 'cta', id);
    const altTextField = createEditField('Alt text', 'altText', id);

    const secondaryFields = document.createElement('div');
    secondaryFields.className = 'form-grid';
    secondaryFields.append(hashtagsField.wrapper, ctaField.wrapper, altTextField.wrapper);
    wrapper.appendChild(secondaryFields);

    const notesField = createEditArea('Extra notes', 'notes', id);
    wrapper.appendChild(notesField.wrapper);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-action';
    saveButton.dataset.action = 'save-schedule';
    saveButton.dataset.scheduleId = id;
    saveButton.textContent = 'Save changes';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'ghost-action';
    cancelButton.dataset.action = 'cancel-schedule';
    cancelButton.dataset.scheduleId = id;
    cancelButton.textContent = 'Cancel';

    actions.append(saveButton, cancelButton);
    wrapper.appendChild(actions);

    return {
      wrapper,
      inputs: {
        title: titleField.input,
        platforms: platformsField.input,
        scheduledDate: dateField.input,
        scheduledTime: timeField.input,
        timezone: timezoneField.input,
        mediaType: mediaTypeField.input,
        mediaUrl: mediaUrlField.input,
        uploads: uploadField.input,
        owner: ownerField.input,
        caption: captionField.input,
        hashtags: hashtagsField.input,
        cta: ctaField.input,
        altText: altTextField.input,
        notes: notesField.input
      }
    };
  }

  function createEditField(labelText, field, id, type) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const label = document.createElement('span');
    label.className = 'field__label';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type || 'text';
    input.dataset.scheduleEditField = field;
    input.dataset.scheduleId = id;
    wrapper.append(label, input);
    return { wrapper, input };
  }

  function createEditArea(labelText, field, id) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const label = document.createElement('span');
    label.className = 'field__label';
    label.textContent = labelText;
    const input = document.createElement('textarea');
    input.dataset.scheduleEditField = field;
    input.dataset.scheduleId = id;
    wrapper.append(label, input);
    return { wrapper, input };
  }

  function createUploadField(id) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const label = document.createElement('span');
    label.className = 'field__label';
    label.textContent = 'Upload media';
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*';
    input.dataset.scheduleAssets = id;
    const hint = document.createElement('span');
    hint.className = 'field__hint';
    hint.textContent = 'Selecting files replaces existing uploads for this post.';
    wrapper.append(label, input, hint);
    return { wrapper, input };
  }

  function renderScheduleCard(card, record) {
    if (!card) return;
    const sortKey = scheduleSortKey(record);
    card.dataset.sortKey = String(sortKey);

    card.titleEl.textContent = record.title || 'Untitled post';
    card.badgeEl.textContent = `${labelForStatus(record.status)} • ${formatRelativeTime(record.updatedAt)}`;
    card.statusSelect.value = record.status || 'scheduled';

    card.dateLine.textContent = formatScheduleWindow(record.scheduledDate, record.scheduledTime, record.timezone);
    card.platformLine.textContent = `Platforms: ${record.platforms || '—'}`;
    card.mediaLine.textContent = `Content: ${record.mediaType || '—'}`;
    card.ownerLine.textContent = record.owner ? `Approval: ${record.owner}` : 'Approval: —';

    card.captionLine.textContent = record.caption ? `Caption: ${record.caption}` : 'Caption: —';
    card.ctaLine.textContent = record.cta ? `CTA: ${record.cta}` : 'CTA: —';
    card.hashtagsLine.textContent = record.hashtags ? `Hashtags: ${record.hashtags}` : 'Hashtags: —';
    card.notesLine.textContent = record.notes ? `Notes: ${record.notes}` : 'Notes: —';

    if (Array.isArray(record.assets) && record.assets.length) {
      const assetNames = record.assets.map((asset) => asset.name).join(', ');
      card.assetsLine.textContent = `Uploads: ${assetNames}`;
    } else {
      card.assetsLine.textContent = 'Uploads: —';
    }

    if (record.mediaUrl) {
      card.mediaLinkLine.innerHTML = [
        'Asset: ',
        `<a class="card-link" href="${record.mediaUrl}" target="_blank" rel="noopener">`,
        `${record.mediaUrl}</a>`
      ].join('');
    } else {
      card.mediaLinkLine.textContent = 'Asset: —';
    }

    if (card.editSection && card.editSection.wrapper.hidden) {
      updateScheduleEditInputs(card, record);
    }
  }

  function updateScheduleEditInputs(card, record) {
    const inputs = card.editSection ? card.editSection.inputs : null;
    if (!inputs) return;
    setInputValue(inputs.title, record.title);
    setInputValue(inputs.platforms, record.platforms);
    setInputValue(inputs.scheduledDate, record.scheduledDate);
    setInputValue(inputs.scheduledTime, record.scheduledTime);
    setInputValue(inputs.timezone, record.timezone);
    setInputValue(inputs.mediaType, record.mediaType);
    setInputValue(inputs.mediaUrl, record.mediaUrl);
    setInputValue(inputs.owner, record.owner);
    setInputValue(inputs.caption, record.caption);
    setInputValue(inputs.hashtags, record.hashtags);
    setInputValue(inputs.cta, record.cta);
    setInputValue(inputs.altText, record.altText);
    setInputValue(inputs.notes, record.notes);
  }

  function setInputValue(input, value) {
    if (!input || document.activeElement === input) return;
    input.value = value || '';
  }

  function removeScheduleCard(id) {
    const card = scheduleList.querySelector(`[data-schedule-id="${id}"]`);
    if (card) {
      card.remove();
    }
  }

  function updateScheduleOrdering() {
    const cards = Array.from(scheduleList.querySelectorAll('.schedule-card'));
    cards.sort((a, b) => Number(a.dataset.sortKey) - Number(b.dataset.sortKey));
    cards.forEach((card) => scheduleList.appendChild(card));
  }

  function updateScheduleEmptyState() {
    if (!scheduleEmpty) return;
    const hasItems = scheduleList && scheduleList.querySelector('.schedule-card');
    scheduleEmpty.hidden = !!hasItems;
  }

  function updateScheduleVisibility() {
    const statuses = getActiveStatuses();
    const cards = scheduleList ? scheduleList.querySelectorAll('.schedule-card') : [];
    cards.forEach((card) => {
      const id = card.dataset.scheduleId;
      const record = id ? scheduleRecords.get(id) : null;
      if (!record) {
        card.hidden = true;
        return;
      }
      card.hidden = !statuses.has(record.status || 'scheduled');
    });
  }

  function updateScheduleFilterEmptyState() {
    if (!scheduleFilterEmpty) return;
    const visibleCard = scheduleList && scheduleList.querySelector('.schedule-card:not([hidden])');
    const hasAny = scheduleList && scheduleList.querySelector('.schedule-card');
    scheduleFilterEmpty.hidden = !hasAny || !!visibleCard;
  }

  function handleFilterChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.checked) {
      activeStatuses.add(input.value);
    } else {
      activeStatuses.delete(input.value);
    }
    updateScheduleVisibility();
    updateScheduleFilterEmptyState();
    renderCalendar();
  }

  function resetStatusFilters() {
    activeStatuses.clear();
    statusFilterInputs.forEach((input) => {
      input.checked = true;
      activeStatuses.add(input.value);
    });
    updateScheduleVisibility();
    updateScheduleFilterEmptyState();
    renderCalendar();
  }

  function getActiveStatuses() {
    if (activeStatuses.size) {
      return activeStatuses;
    }
    return new Set(['idea', 'drafting', 'scheduled', 'queued', 'published']);
  }

  function toggleScheduleEdit(id) {
    const record = scheduleRecords.get(id);
    const card = scheduleList.querySelector(`[data-schedule-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    const { wrapper } = card.editSection;
    wrapper.hidden = !wrapper.hidden;
    if (!wrapper.hidden) {
      updateScheduleEditInputs(card, record);
      card.editButton.textContent = 'Close';
    } else {
      card.editButton.textContent = 'Edit';
    }
  }

  async function saveScheduleEdits(id) {
    const record = scheduleRecords.get(id);
    const card = scheduleList.querySelector(`[data-schedule-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    const { inputs } = card.editSection;

    const title = inputs.title.value.trim();
    const platforms = inputs.platforms.value.trim();
    const scheduledDate = inputs.scheduledDate.value;
    if (!title || !platforms || !scheduledDate) {
      showInlineFeedback(card, 'Title, platforms, and date are required.');
      return;
    }

    const overrideFiles = scheduleAssetOverrides.get(id);
    const assets = overrideFiles
      ? await resolveUploads(overrideFiles)
      : record.assets || [];

  const nextRecord = {
    ...record,
    title,
    platforms,
    scheduledDate,
    scheduledTime: inputs.scheduledTime.value,
      timezone: inputs.timezone.value.trim(),
      mediaType: inputs.mediaType.value.trim(),
      mediaUrl: inputs.mediaUrl.value.trim(),
      owner: inputs.owner.value.trim(),
      caption: inputs.caption.value.trim(),
      hashtags: inputs.hashtags.value.trim(),
    cta: inputs.cta.value.trim(),
    altText: inputs.altText.value.trim(),
    notes: inputs.notes.value.trim(),
    assets,
    updatedAt: Date.now()
  };
  scheduleNode.get(id).put(nextRecord);
  handleScheduleUpdate(nextRecord, id);
  markWorkspaceActivity('lastScheduleChangeAt');
    card.editSection.wrapper.hidden = true;
    card.editButton.textContent = 'Edit';
    showInlineFeedback(card, 'Schedule updated.');
    scheduleAssetOverrides.delete(id);
    if (inputs.uploads) {
      inputs.uploads.value = '';
    }
  }

  function cancelScheduleEdits(id) {
    const record = scheduleRecords.get(id);
    const card = scheduleList.querySelector(`[data-schedule-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    updateScheduleEditInputs(card, record);
    card.editSection.wrapper.hidden = true;
    card.editButton.textContent = 'Edit';
    scheduleAssetOverrides.delete(id);
    if (card.editSection.inputs && card.editSection.inputs.uploads) {
      card.editSection.inputs.uploads.value = '';
    }
  }

  function showInlineFeedback(card, message) {
    if (!card) return;
    let feedback = card.querySelector('[data-schedule-feedback]');
    if (!feedback) {
      feedback = document.createElement('p');
      feedback.className = 'card-feedback';
      feedback.dataset.scheduleFeedback = 'true';
      card.appendChild(feedback);
    }
    feedback.textContent = message;
  }

  function shiftCalendarMonth(direction) {
    const year = activeMonth.getFullYear();
    const month = activeMonth.getMonth() + direction;
    activeMonth = new Date(year, month, 1);
    renderCalendar();
  }

  function renderCalendar() {
    if (!calendarGrid || !calendarMonthLabel) return;
    calendarGrid.innerHTML = '';

    const year = activeMonth.getFullYear();
    const month = activeMonth.getMonth();
    const monthStart = new Date(year, month, 1);
    const startDay = monthStart.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    calendarMonthLabel.textContent = monthStart.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric'
    });

    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((label) => {
      const header = document.createElement('div');
      header.className = 'calendar-cell calendar-cell--header';
      header.textContent = label;
      calendarGrid.appendChild(header);
    });

    const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
    const statusFilter = getActiveStatuses();
    const records = Array.from(scheduleRecords.values());

    for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
      const dayNumber = cellIndex - startDay + 1;
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';

      if (dayNumber < 1 || dayNumber > daysInMonth) {
        cell.dataset.empty = 'true';
        calendarGrid.appendChild(cell);
        continue;
      }

      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      const dateLabel = document.createElement('div');
      dateLabel.className = 'calendar-cell__date';
      dateLabel.textContent = String(dayNumber);
      cell.appendChild(dateLabel);

      const dayRecords = records.filter((record) => record.scheduledDate === dateKey
        && statusFilter.has(record.status || 'scheduled'));

      dayRecords.sort((a, b) => scheduleSortKey(a) - scheduleSortKey(b));
      dayRecords.forEach((record) => {
        const event = document.createElement('div');
        event.className = 'calendar-event';

        const status = document.createElement('div');
        status.className = 'calendar-event__status';
        status.textContent = labelForStatus(record.status);
        event.appendChild(status);

        const title = document.createElement('div');
        title.className = 'calendar-event__title';
        title.textContent = record.title || 'Untitled';
        event.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'calendar-event__meta';
        meta.textContent = record.platforms ? record.platforms : 'Platforms TBD';
        event.appendChild(meta);

        cell.appendChild(event);
      });

      calendarGrid.appendChild(cell);
    }
  }
