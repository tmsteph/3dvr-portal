(function() {
  'use strict';

  const scoreSystem = window.ScoreSystem || {};
  const gunHelpers = window.SocialGunHelpers || {};
  const ensureGunContext = gunHelpers.ensureGunContext || (() => ({ gun: null, user: null, isStub: true }));
  const resolveGunNodeStub = gunHelpers.resolveGunNodeStub || (() => ({ get() {}, put() {}, on() {}, map() {}, set() {} }));
  const recallUserSessionIfAvailable = gunHelpers.recallUserSessionIfAvailable || (() => {});

  const postForm = document.getElementById('postForm');
  const postList = document.getElementById('postList');
  const postEmpty = document.getElementById('postEmpty');
  const postStatusSelect = document.getElementById('postStatus');
  const postScheduledInput = document.getElementById('postScheduledAt');

  const postRecords = new Map();

  const gunContext = ensureGunContext(() => (typeof Gun === 'function'
    ? Gun(window.__GUN_PEERS__ || [
        'wss://relay.3dvr.tech/gun',
        'wss://gun-relay-3dvr.fly.dev/gun'
      ])
    : null), { label: 'social-media' });

  const gun = gunContext.gun;
  const user = gunContext.user;
  const socialRoot = gun && typeof gun.get === 'function'
    ? gun.get('social-media')
    : resolveGunNodeStub();
  // post-schedule nodes store individual posts with scheduling metadata and assets:
  // { title, platform, status, scheduledAt, timezone, campaign, format, cadence, assetLink, imageUrls, imageAlt,
  //   hashtags, cta, copy, notes, createdAt, updatedAt }
  const postsNode = socialRoot && typeof socialRoot.get === 'function'
    ? socialRoot.get('post-schedule')
    : resolveGunNodeStub();
  const portalRoot = gun && typeof gun.get === 'function'
    ? gun.get('3dvr-portal')
    : resolveGunNodeStub();
  // social-media workspace metadata lives under 3dvr-portal/workspaces/social-media to match other workspace registries.
  const workspaceRegistry = portalRoot && typeof portalRoot.get === 'function'
    ? portalRoot.get('workspaces').get('social-media')
    : resolveGunNodeStub();

  recallUserSessionIfAvailable(user);

  if (window.ScoreSystem && typeof window.ScoreSystem.ensureGuestIdentity === 'function') {
    try {
      window.ScoreSystem.ensureGuestIdentity();
    } catch (err) {
      console.warn('Failed to ensure guest identity for post planner', err);
    }
  }

  if (postStatusSelect) {
    postStatusSelect.value = 'planned';
  }

  if (postScheduledInput) {
    postScheduledInput.value = localDateTime();
  }

  if (postForm) {
    postForm.addEventListener('submit', handlePostSubmit);
  }

  if (postList) {
    postList.addEventListener('change', handlePostListChange);
    postList.addEventListener('click', handlePostListClick);
  }

  registerWorkspacePresence();

  if (postsNode && typeof postsNode.map === 'function') {
    postsNode.map().on((data, id) => {
      handlePostUpdate(data, id);
    }, { change: true });
  }

  function registerWorkspacePresence() {
    if (!workspaceRegistry || typeof workspaceRegistry.put !== 'function') {
      return;
    }
    const now = Date.now();
    const payload = {
      name: 'Social Media Planning Studio',
      description: 'Schedule individual posts and keep content runways aligned.',
      lastOpenedAt: now
    };
    try {
      workspaceRegistry.put(payload);
    } catch (err) {
      console.warn('Failed to register post planner metadata', err);
    }
  }

  function markWorkspaceActivity(field) {
    if (!workspaceRegistry || typeof workspaceRegistry.put !== 'function') {
      return;
    }
    if (!field) return;
    const payload = { [field]: Date.now() };
    try {
      workspaceRegistry.put(payload);
    } catch (err) {
      console.warn(`Failed to update social workspace field ${field}`, err);
    }
  }

  function localDateTime() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  function handlePostSubmit(event) {
    event.preventDefault();
    if (!postForm) return;

    const title = postForm.postTitle.value.trim();
    const platform = postForm.postPlatform.value.trim();
    if (!title || !platform) {
      postForm.reportValidity();
      return;
    }

    const imageUrls = normalizeImageUrls(postForm.postImages.value);
    const record = {
      title,
      platform,
      campaign: postForm.postCampaign.value.trim(),
      status: postForm.postStatus.value || 'planned',
      scheduledAt: postForm.postScheduledAt.value || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      format: postForm.postFormat.value.trim(),
      cadence: postForm.postCadence.value.trim(),
      assetLink: postForm.postAssetLink.value.trim(),
      imageUrls,
      imageAlt: postForm.postAltText.value.trim(),
      hashtags: postForm.postHashtags.value.trim(),
      cta: postForm.postCta.value.trim(),
      copy: postForm.postCopy.value.trim(),
      notes: postForm.postNotes.value.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      postsNode.set(record);
      markWorkspaceActivity('lastPostChangeAt');
      postForm.reset();
      if (postStatusSelect) {
        postStatusSelect.value = 'planned';
      }
      if (postScheduledInput) {
        postScheduledInput.value = localDateTime();
      }
    } catch (err) {
      console.error('Failed to store scheduled post', err);
    }
  }

  function handlePostUpdate(data, id) {
    markWorkspaceActivity('lastPostSyncAt');
    const record = sanitizeRecord(data);
    if (!record) {
      postRecords.delete(id);
      removePostCard(id);
      updatePostEmptyState();
      return;
    }

    postRecords.set(id, record);
    const card = ensurePostCard(id);
    renderPostCard(card, record);
    updatePostEmptyState();
  }

  function handlePostListChange(event) {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.dataset.postId) {
      const id = target.dataset.postId;
      postsNode.get(id).put({ status: target.value, updatedAt: Date.now() });
      markWorkspaceActivity('lastPostChangeAt');
      return;
    }

    if (target instanceof HTMLTextAreaElement && target.dataset.postId) {
      const id = target.dataset.postId;
      const field = target.dataset.field;
      if (field === 'copy' || field === 'notes') {
        postsNode.get(id).put({ [field]: target.value, updatedAt: Date.now() });
        markWorkspaceActivity('lastPostChangeAt');
      }
    }
  }

  function handlePostListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const id = target.dataset.postId;
    if (!id) return;

    if (action === 'delete-post') {
      postsNode.get(id).put(null);
      markWorkspaceActivity('lastPostChangeAt');
      return;
    }

    if (action === 'edit-post') {
      togglePostEdit(id);
      return;
    }

    if (action === 'save-post') {
      savePostEdits(id);
      return;
    }

    if (action === 'cancel-post') {
      cancelPostEdits(id);
    }
  }

  function ensurePostCard(id) {
    let card = postList.querySelector(`[data-post-id="${id}"]`);
    if (card) return card;
    card = createPostCard(id);
    postList.prepend(card);
    return card;
  }

  function createPostCard(id) {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.dataset.postId = id;

    const header = document.createElement('div');
    header.className = 'card-header';

    const title = document.createElement('h3');
    title.dataset.role = 'postTitle';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.role = 'postStatus';
    actions.appendChild(badge);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.dataset.action = 'delete-post';
    deleteButton.dataset.postId = id;
    deleteButton.textContent = 'Delete';
    actions.appendChild(deleteButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'ghost-action';
    editButton.dataset.action = 'edit-post';
    editButton.dataset.postId = id;
    editButton.textContent = 'Edit';
    actions.appendChild(editButton);

    header.appendChild(actions);
    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const platformLine = document.createElement('span');
    platformLine.dataset.role = 'postPlatform';
    meta.appendChild(platformLine);

    const scheduleLine = document.createElement('span');
    scheduleLine.dataset.role = 'postSchedule';
    meta.appendChild(scheduleLine);

    const formatLine = document.createElement('span');
    formatLine.dataset.role = 'postFormat';
    meta.appendChild(formatLine);

    const cadenceLine = document.createElement('span');
    cadenceLine.dataset.role = 'postCadence';
    meta.appendChild(cadenceLine);

    const campaignLine = document.createElement('span');
    campaignLine.dataset.role = 'postCampaign';
    meta.appendChild(campaignLine);

    card.appendChild(meta);

    const statusField = document.createElement('label');
    statusField.className = 'field';
    const statusLabel = document.createElement('span');
    statusLabel.className = 'field__label';
    statusLabel.textContent = 'Status';
    const statusSelect = document.createElement('select');
    statusSelect.dataset.postId = id;
    ['planned', 'drafting', 'ready', 'scheduled', 'published', 'paused'].forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = labelForPostStatus(value);
      statusSelect.appendChild(option);
    });
    statusField.append(statusLabel, statusSelect);
    card.appendChild(statusField);

    const copyField = document.createElement('label');
    copyField.className = 'field';
    const copyLabel = document.createElement('span');
    copyLabel.className = 'field__label';
    copyLabel.textContent = 'Post copy';
    const copyArea = document.createElement('textarea');
    copyArea.dataset.postId = id;
    copyArea.dataset.field = 'copy';
    copyField.append(copyLabel, copyArea);
    card.appendChild(copyField);

    const notesField = document.createElement('label');
    notesField.className = 'field';
    const notesLabel = document.createElement('span');
    notesLabel.className = 'field__label';
    notesLabel.textContent = 'Notes & approvals';
    const notesArea = document.createElement('textarea');
    notesArea.dataset.postId = id;
    notesArea.dataset.field = 'notes';
    notesField.append(notesLabel, notesArea);
    card.appendChild(notesField);

    const assets = document.createElement('div');
    assets.className = 'post-assets';
    const assetsTitle = document.createElement('p');
    assetsTitle.className = 'post-assets__title';
    assetsTitle.textContent = 'Assets & links';
    const assetsList = document.createElement('ul');
    assetsList.className = 'post-assets__list';
    assets.append(assetsTitle, assetsList);
    card.appendChild(assets);

    const editSection = createPostEditSection(id);
    card.appendChild(editSection.wrapper);

    card.titleEl = title;
    card.statusBadge = badge;
    card.platformLine = platformLine;
    card.scheduleLine = scheduleLine;
    card.formatLine = formatLine;
    card.cadenceLine = cadenceLine;
    card.campaignLine = campaignLine;
    card.statusSelect = statusSelect;
    card.copyArea = copyArea;
    card.notesArea = notesArea;
    card.assetsList = assetsList;
    card.editSection = editSection;
    card.editButton = editButton;

    return card;
  }

  function createPostEditSection(id) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card-edit';
    wrapper.hidden = true;
    wrapper.dataset.editSection = 'post';

    const fields = document.createElement('div');
    fields.className = 'form-grid';

    const titleField = createPostEditField('Post title', 'title', id);
    const platformField = createPostEditField('Platform', 'platform', id);
    const scheduledField = createPostEditField('Scheduled for', 'scheduledAt', id, 'datetime-local');
    const campaignField = createPostEditField('Campaign link', 'campaign', id);
    const formatField = createPostEditField('Format', 'format', id);
    const cadenceField = createPostEditField('Cadence slot', 'cadence', id);
    const assetField = createPostEditField('Asset folder', 'assetLink', id, 'url');
    const imageAltField = createPostEditField('Alt text', 'imageAlt', id);
    const hashtagsField = createPostEditField('Hashtags', 'hashtags', id);
    const ctaField = createPostEditField('Primary CTA', 'cta', id);

    fields.append(
      titleField.wrapper,
      platformField.wrapper,
      scheduledField.wrapper,
      campaignField.wrapper,
      formatField.wrapper,
      cadenceField.wrapper,
      assetField.wrapper,
      imageAltField.wrapper,
      hashtagsField.wrapper,
      ctaField.wrapper
    );
    wrapper.appendChild(fields);

    const imageField = document.createElement('label');
    imageField.className = 'field';
    const imageLabel = document.createElement('span');
    imageLabel.className = 'field__label';
    imageLabel.textContent = 'Image or media URLs';
    const imageArea = document.createElement('textarea');
    imageArea.dataset.postEditField = 'imageUrls';
    imageArea.dataset.postId = id;
    imageField.append(imageLabel, imageArea);
    wrapper.appendChild(imageField);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-action';
    saveButton.dataset.action = 'save-post';
    saveButton.dataset.postId = id;
    saveButton.textContent = 'Save changes';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'ghost-action';
    cancelButton.dataset.action = 'cancel-post';
    cancelButton.dataset.postId = id;
    cancelButton.textContent = 'Cancel';

    actions.append(saveButton, cancelButton);
    wrapper.appendChild(actions);

    return {
      wrapper,
      inputs: {
        title: titleField.input,
        platform: platformField.input,
        scheduledAt: scheduledField.input,
        campaign: campaignField.input,
        format: formatField.input,
        cadence: cadenceField.input,
        assetLink: assetField.input,
        imageAlt: imageAltField.input,
        hashtags: hashtagsField.input,
        cta: ctaField.input,
        imageUrls: imageArea
      }
    };
  }

  function createPostEditField(labelText, field, id, type) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const label = document.createElement('span');
    label.className = 'field__label';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type || 'text';
    input.dataset.postEditField = field;
    input.dataset.postId = id;
    wrapper.append(label, input);
    return { wrapper, input };
  }

  function renderPostCard(card, record) {
    if (!card) return;
    card.titleEl.textContent = record.title || 'Untitled post';
    card.statusBadge.textContent = `${labelForPostStatus(record.status)} • ${formatRelativeTime(record.updatedAt)}`;
    card.statusSelect.value = record.status || 'planned';

    card.platformLine.textContent = `Platform: ${record.platform || 'Unassigned'}`;
    card.scheduleLine.textContent = formatScheduledAt(record.scheduledAt, record.timezone);
    card.formatLine.textContent = record.format ? `Format: ${record.format}` : 'Format: —';
    card.cadenceLine.textContent = record.cadence ? `Cadence: ${record.cadence}` : 'Cadence: —';
    card.campaignLine.textContent = record.campaign ? `Campaign: ${record.campaign}` : 'Campaign: —';

    if (document.activeElement !== card.copyArea) {
      card.copyArea.value = record.copy || '';
    }
    if (document.activeElement !== card.notesArea) {
      card.notesArea.value = record.notes || '';
    }

    const assets = buildAssetLines(record);
    card.assetsList.innerHTML = '';
    if (assets.length) {
      assets.forEach((line) => {
        const item = document.createElement('li');
        item.innerHTML = line;
        card.assetsList.appendChild(item);
      });
    } else {
      const item = document.createElement('li');
      item.textContent = 'No assets linked yet.';
      card.assetsList.appendChild(item);
    }

    if (card.editSection && card.editSection.wrapper.hidden) {
      updatePostEditInputs(card, record);
    }
  }

  function updatePostEditInputs(card, record) {
    const inputs = card.editSection ? card.editSection.inputs : null;
    if (!inputs) return;
    if (document.activeElement !== inputs.title) {
      inputs.title.value = record.title || '';
    }
    if (document.activeElement !== inputs.platform) {
      inputs.platform.value = record.platform || '';
    }
    if (document.activeElement !== inputs.scheduledAt) {
      inputs.scheduledAt.value = record.scheduledAt || '';
    }
    if (document.activeElement !== inputs.campaign) {
      inputs.campaign.value = record.campaign || '';
    }
    if (document.activeElement !== inputs.format) {
      inputs.format.value = record.format || '';
    }
    if (document.activeElement !== inputs.cadence) {
      inputs.cadence.value = record.cadence || '';
    }
    if (document.activeElement !== inputs.assetLink) {
      inputs.assetLink.value = record.assetLink || '';
    }
    if (document.activeElement !== inputs.imageAlt) {
      inputs.imageAlt.value = record.imageAlt || '';
    }
    if (document.activeElement !== inputs.hashtags) {
      inputs.hashtags.value = record.hashtags || '';
    }
    if (document.activeElement !== inputs.cta) {
      inputs.cta.value = record.cta || '';
    }
    if (document.activeElement !== inputs.imageUrls) {
      inputs.imageUrls.value = normalizeImageUrls(record.imageUrls).join('\n');
    }
  }

  function removePostCard(id) {
    const card = postList.querySelector(`[data-post-id="${id}"]`);
    if (card) {
      card.remove();
    }
  }

  function updatePostEmptyState() {
    if (!postEmpty) return;
    const hasItems = postList && postList.querySelector('.post-card');
    postEmpty.hidden = !!hasItems;
  }

  function labelForPostStatus(value) {
    switch (value) {
      case 'drafting':
        return 'Drafting';
      case 'ready':
        return 'Ready';
      case 'scheduled':
        return 'Scheduled';
      case 'published':
        return 'Published';
      case 'paused':
        return 'Paused';
      case 'planned':
      default:
        return 'Planned';
    }
  }

  function formatScheduledAt(scheduledAt, timezone) {
    if (!scheduledAt) return 'Schedule: TBD';
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime())) {
      return `Schedule: ${scheduledAt}`;
    }
    const formatted = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return `Schedule: ${formatted}${timezone ? ` • ${timezone}` : ''}`;
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

  function parseImageUrls(value) {
    if (!value) return [];
    if (typeof value !== 'string') return [];
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeImageUrls(value) {
    if (Array.isArray(value)) {
      return value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      return parseImageUrls(value);
    }
    if (value && typeof value === 'object') {
      return Object.values(value)
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function buildAssetLines(record) {
    const lines = [];
    if (record.assetLink) {
      lines.push(
        `Asset folder: <a class="card-link" href="${record.assetLink}" target="_blank" rel="noopener">${record.assetLink}</a>`
      );
    }
    const imageUrls = normalizeImageUrls(record.imageUrls);
    if (imageUrls.length) {
      const formatted = imageUrls
        .map((url) => `<a class="card-link" href="${url}" target="_blank" rel="noopener">${url}</a>`)
        .join(', ');
      lines.push(`Media: ${formatted}`);
    }
    if (record.imageAlt) {
      lines.push(`Alt text: ${record.imageAlt}`);
    }
    if (record.hashtags) {
      lines.push(`Hashtags: ${record.hashtags}`);
    }
    if (record.cta) {
      lines.push(`CTA: ${record.cta}`);
    }
    return lines;
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

  function togglePostEdit(id) {
    const record = postRecords.get(id);
    const card = postList.querySelector(`[data-post-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    const { wrapper } = card.editSection;
    wrapper.hidden = !wrapper.hidden;
    if (!wrapper.hidden) {
      updatePostEditInputs(card, record);
      card.editButton.textContent = 'Close';
    } else {
      card.editButton.textContent = 'Edit';
    }
  }

  function savePostEdits(id) {
    const record = postRecords.get(id);
    const card = postList.querySelector(`[data-post-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    const { inputs } = card.editSection;
    const title = inputs.title.value.trim();
    const platform = inputs.platform.value.trim();
    if (!title || !platform) {
      console.warn('Post title and platform are required.');
      return;
    }
    const imageUrls = normalizeImageUrls(inputs.imageUrls.value);
    postsNode.get(id).put({
      title,
      platform,
      scheduledAt: inputs.scheduledAt.value,
      campaign: inputs.campaign.value.trim(),
      format: inputs.format.value.trim(),
      cadence: inputs.cadence.value.trim(),
      assetLink: inputs.assetLink.value.trim(),
      imageUrls,
      imageAlt: inputs.imageAlt.value.trim(),
      hashtags: inputs.hashtags.value.trim(),
      cta: inputs.cta.value.trim(),
      updatedAt: Date.now()
    });
    markWorkspaceActivity('lastPostChangeAt');
    card.editSection.wrapper.hidden = true;
    card.editButton.textContent = 'Edit';
  }

  function cancelPostEdits(id) {
    const record = postRecords.get(id);
    const card = postList.querySelector(`[data-post-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    updatePostEditInputs(card, record);
    card.editSection.wrapper.hidden = true;
    card.editButton.textContent = 'Edit';
  }
})();
