(function() {
  'use strict';

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
  const scheduleStatusSelect = document.getElementById('scheduleStatus');
  const scheduleDateInput = document.getElementById('scheduleDate');

  const scheduleRecords = new Map();

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
  // Node shape: social-media/post-schedule/<id> -> { title, platforms, status, scheduledDate, scheduledTime, mediaType, ... }
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

  if (scheduleForm) {
    scheduleForm.addEventListener('submit', handleScheduleSubmit);
  }

  if (scheduleList) {
    scheduleList.addEventListener('change', handleScheduleListChange);
    scheduleList.addEventListener('click', handleScheduleListClick);
  }

  registerWorkspacePresence();

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

  function handleScheduleSubmit(event) {
    event.preventDefault();
    if (!scheduleForm) return;

    const title = scheduleForm.scheduleTitle.value.trim();
    const platforms = scheduleForm.schedulePlatforms.value.trim();
    const scheduledDate = scheduleForm.scheduleDate.value;

    if (!title || !platforms || !scheduledDate) {
      scheduleForm.reportValidity();
      return;
    }

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
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      scheduleNode.set(record);
      markWorkspaceActivity('lastScheduleChangeAt');
      scheduleForm.reset();
      if (scheduleStatusSelect) {
        scheduleStatusSelect.value = 'scheduled';
      }
      if (scheduleDateInput) {
        scheduleDateInput.value = todayDate();
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
      removeScheduleCard(id);
      updateScheduleEmptyState();
      return;
    }

    scheduleRecords.set(id, record);
    const card = ensureScheduleCard(id);
    renderScheduleCard(card, record);
    updateScheduleOrdering();
    updateScheduleEmptyState();
  }

  function handleScheduleListChange(event) {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.dataset.scheduleId) {
      const id = target.dataset.scheduleId;
      scheduleNode.get(id).put({ status: target.value, updatedAt: Date.now() });
      markWorkspaceActivity('lastScheduleChangeAt');
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
      return;
    }

    if (action === 'edit-schedule') {
      toggleScheduleEdit(id);
      return;
    }

    if (action === 'save-schedule') {
      saveScheduleEdits(id);
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

    const hashtagsLine = document.createElement('p');
    hashtagsLine.dataset.role = 'scheduleHashtags';
    summary.appendChild(hashtagsLine);

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
    card.hashtagsLine = hashtagsLine;
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
    const ownerField = createEditField('Approval owner', 'owner', id);

    fields.append(
      titleField.wrapper,
      platformsField.wrapper,
      dateField.wrapper,
      timeField.wrapper,
      timezoneField.wrapper,
      mediaTypeField.wrapper,
      mediaUrlField.wrapper,
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
    card.hashtagsLine.textContent = record.hashtags ? `Hashtags: ${record.hashtags}` : 'Hashtags: —';
    card.notesLine.textContent = record.notes ? `Notes: ${record.notes}` : 'Notes: —';

    if (record.mediaUrl) {
      card.mediaLinkLine.innerHTML = `Asset: <a class="card-link" href="${record.mediaUrl}" target="_blank" rel="noopener">${record.mediaUrl}</a>`;
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

  function saveScheduleEdits(id) {
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

    scheduleNode.get(id).put({
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
      updatedAt: Date.now()
    });
    markWorkspaceActivity('lastScheduleChangeAt');
    card.editSection.wrapper.hidden = true;
    card.editButton.textContent = 'Edit';
    showInlineFeedback(card, 'Schedule updated.');
  }

  function cancelScheduleEdits(id) {
    const record = scheduleRecords.get(id);
    const card = scheduleList.querySelector(`[data-schedule-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    updateScheduleEditInputs(card, record);
    card.editSection.wrapper.hidden = true;
    card.editButton.textContent = 'Edit';
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

  function scheduleSortKey(record) {
    if (!record) return Number.MAX_SAFE_INTEGER;
    const date = record.scheduledDate || '';
    if (!date) return Number.MAX_SAFE_INTEGER;
    const time = record.scheduledTime || '00:00';
    const iso = `${date}T${time}`;
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
  }

  function formatScheduleWindow(date, time, timezone) {
    if (!date) return 'Schedule: TBD';
    const timeLabel = time ? ` at ${time}` : '';
    const tzLabel = timezone ? ` ${timezone}` : '';
    return `Schedule: ${date}${timeLabel}${tzLabel}`;
  }

  function labelForStatus(value) {
    switch (value) {
      case 'idea':
        return 'Idea';
      case 'drafting':
        return 'Drafting';
      case 'queued':
        return 'Queued';
      case 'published':
        return 'Published';
      case 'scheduled':
      default:
        return 'Scheduled';
    }
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return 'just now';
    const now = Date.now();
    const diff = Math.max(0, now - Number(timestamp));
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.round(hours / 24);
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    const weeks = Math.round(days / 7);
    if (weeks === 1) return '1 week ago';
    return `${weeks} weeks ago`;
  }

  function sanitizeRecord(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const result = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === '_' || typeof value === 'function') continue;
      result[key] = value;
    }
    return result;
  }
})();
