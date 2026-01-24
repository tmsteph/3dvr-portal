(function() {
  'use strict';

  const GUN_FALLBACK_ERROR = { err: 'gun-unavailable' };
  const KEY_STORAGE_KEY = 'social-media:workspace-key';
  const scoreSystem = window.ScoreSystem || {};

  function createLocalGunSubscriptionStub() {
    return { off() {} };
  }

  function createLocalGunNodeStub() {
    const node = {
      __isGunStub: true,
      get() {
        return createLocalGunNodeStub();
      },
      put(_value, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(GUN_FALLBACK_ERROR), 0);
        }
        return node;
      },
      once(callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(undefined), 0);
        }
        return node;
      },
      on() {
        return createLocalGunSubscriptionStub();
      },
      map() {
        return {
          __isGunStub: true,
          on() {
            return createLocalGunSubscriptionStub();
          }
        };
      },
      set() {
        return node;
      },
      off() {}
    };
    return node;
  }

  function createLocalGunUserStub(baseNode) {
    const node = baseNode && typeof baseNode.get === 'function'
      ? baseNode
      : createLocalGunNodeStub();
    return {
      ...node,
      is: null,
      _: {},
      recall() {},
      auth(_alias, _password, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(GUN_FALLBACK_ERROR), 0);
        }
      },
      leave() {},
      create(_alias, _password, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(GUN_FALLBACK_ERROR), 0);
        }
      }
    };
  }

  function resolveGunNodeStub() {
    if (typeof scoreSystem.createGunNodeStub === 'function') {
      try {
        return scoreSystem.createGunNodeStub();
      } catch (err) {
        console.warn('Failed to reuse ScoreSystem node stub', err);
      }
    }
    return createLocalGunNodeStub();
  }

  function resolveGunUserStub(node) {
    if (typeof scoreSystem.createGunUserStub === 'function') {
      try {
        return scoreSystem.createGunUserStub(node);
      } catch (err) {
        console.warn('Failed to reuse ScoreSystem user stub', err);
      }
    }
    return createLocalGunUserStub(node);
  }

  const campaignForm = document.getElementById('campaignForm');
  const campaignList = document.getElementById('campaignList');
  const campaignEmpty = document.getElementById('campaignEmpty');

  const postForm = document.getElementById('postForm');
  const postList = document.getElementById('postList');
  const postEmpty = document.getElementById('postEmpty');

  const credentialForm = document.getElementById('credentialForm');
  const credentialList = document.getElementById('credentialList');
  const credentialEmpty = document.getElementById('credentialEmpty');
  const workspaceKeyInput = document.getElementById('workspaceKey');
  const keyForm = document.getElementById('keyForm');
  const clearKeyButton = document.getElementById('clearKey');
  const keyFeedback = document.getElementById('keyFeedback');

  const campaignStatusSelect = document.getElementById('campaignStatus');
  const campaignStartInput = document.getElementById('campaignStart');
  const postStatusSelect = document.getElementById('postStatus');
  const postScheduledInput = document.getElementById('postScheduledAt');

  let workspaceKey = '';
  const campaignRecords = new Map();
  const postRecords = new Map();
  const credentialRecords = new Map();

  const gunContext = ensureGunContext(() => (typeof Gun === 'function'
    ? Gun(window.__GUN_PEERS__ || [
        'wss://relay.3dvr.tech/gun',
        'wss://gun-relay-3dvr.fly.dev/gun'
      ])
    : null));

  const gun = gunContext.gun;
  const user = gunContext.user;
  const socialRoot = gun && typeof gun.get === 'function'
    ? gun.get('social-media')
    : resolveGunNodeStub();
  const campaignsNode = socialRoot && typeof socialRoot.get === 'function'
    ? socialRoot.get('campaigns')
    : resolveGunNodeStub();
  const credentialsNode = socialRoot && typeof socialRoot.get === 'function'
    ? socialRoot.get('credentials')
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
      console.warn('Failed to ensure guest identity for social planner', err);
    }
  }

  if (campaignStatusSelect) {
    campaignStatusSelect.value = 'planning';
  }

  if (campaignStartInput) {
    campaignStartInput.value = todayDate();
  }

  if (postStatusSelect) {
    postStatusSelect.value = 'planned';
  }

  if (postScheduledInput) {
    postScheduledInput.value = localDateTime();
  }

  if (keyForm) {
    keyForm.addEventListener('submit', handleWorkspaceKeySubmit);
  }

  if (clearKeyButton) {
    clearKeyButton.addEventListener('click', handleWorkspaceKeyClear);
  }

  restoreWorkspaceKey();

  if (campaignForm) {
    campaignForm.addEventListener('submit', handleCampaignSubmit);
  }

  if (postForm) {
    postForm.addEventListener('submit', handlePostSubmit);
  }

  if (credentialForm) {
    credentialForm.addEventListener('submit', handleCredentialSubmit);
  }

  if (campaignList) {
    campaignList.addEventListener('change', handleCampaignListChange);
    campaignList.addEventListener('click', handleCampaignListClick);
  }

  if (postList) {
    postList.addEventListener('change', handlePostListChange);
    postList.addEventListener('click', handlePostListClick);
  }

  if (credentialList) {
    credentialList.addEventListener('change', handleCredentialListChange);
    credentialList.addEventListener('click', handleCredentialListClick);
  }

  registerWorkspacePresence();

  if (campaignsNode && typeof campaignsNode.map === 'function') {
    campaignsNode.map().on((data, id) => {
      handleCampaignUpdate(data, id);
    }, { change: true });
  }

  if (postsNode && typeof postsNode.map === 'function') {
    postsNode.map().on((data, id) => {
      handlePostUpdate(data, id);
    }, { change: true });
  }

  if (credentialsNode && typeof credentialsNode.map === 'function') {
    credentialsNode.map().on((data, id) => {
      handleCredentialUpdate(data, id);
    }, { change: true });
  }

  function ensureGunContext(factory) {
    const ensureGun = typeof scoreSystem.ensureGun === 'function'
      ? scoreSystem.ensureGun.bind(scoreSystem)
      : null;
    if (ensureGun) {
      return ensureGun(factory, { label: 'social-media' });
    }

    let instance = null;
    if (typeof factory === 'function') {
      try {
        instance = factory();
      } catch (err) {
        console.warn('Failed to initialize Gun for social planner', err);
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

    console.warn('Gun.js is unavailable for social planner; using offline stub.');
    const stubGun = {
      __isGunStub: true,
      get() {
        return resolveGunNodeStub();
      },
      user() {
        return resolveGunUserStub();
      }
    };
    return {
      gun: stubGun,
      user: stubGun.user(),
      isStub: true
    };
  }

  function recallUserSessionIfAvailable(targetUser) {
    if (!targetUser || typeof targetUser.recall !== 'function') {
      return;
    }

    if (typeof scoreSystem.recallUserSession === 'function') {
      try {
        const reused = scoreSystem.recallUserSession(targetUser);
        if (reused) {
          return;
        }
      } catch (err) {
        console.warn('Failed to recall session via ScoreSystem', err);
      }
    }

    try {
      targetUser.recall({ sessionStorage: true, localStorage: true });
    } catch (err) {
      console.warn('Unable to recall user session for social planner', err);
    }
  }

  function registerWorkspacePresence() {
    if (!workspaceRegistry || typeof workspaceRegistry.put !== 'function') {
      return;
    }
    const now = Date.now();
    const payload = {
      name: 'Social Media Command Center',
      description: 'Plan campaigns and credentials together from one hub.',
      lastOpenedAt: now
    };
    try {
      workspaceRegistry.put(payload);
    } catch (err) {
      console.warn('Failed to register social workspace metadata', err);
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

  function todayDate() {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }

  function localDateTime() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  function handleCampaignSubmit(event) {
    event.preventDefault();
    if (!campaignForm) return;

    const name = campaignForm.campaignName.value.trim();
    const platform = campaignForm.campaignPlatform.value.trim();
    if (!name || !platform) {
      campaignForm.reportValidity();
      return;
    }

    const record = {
      name,
      platform,
      objective: campaignForm.campaignObjective.value.trim(),
      status: campaignForm.campaignStatus.value || 'planning',
      startDate: campaignForm.campaignStart.value || '',
      endDate: campaignForm.campaignEnd.value || '',
      notes: campaignForm.campaignNotes.value.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      campaignsNode.set(record);
      markWorkspaceActivity('lastCampaignChangeAt');
      campaignForm.reset();
      if (campaignStatusSelect) {
        campaignStatusSelect.value = 'planning';
      }
      if (campaignStartInput) {
        campaignStartInput.value = todayDate();
      }
    } catch (err) {
      console.error('Failed to store campaign', err);
    }
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

    const imageUrls = parseImageUrls(postForm.postImages.value);
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

  function handleCredentialSubmit(event) {
    event.preventDefault();
    if (!credentialForm) return;

    const platform = credentialForm.credentialPlatform.value.trim();
    const accountLabel = credentialForm.credentialAccount.value.trim();
    const username = credentialForm.credentialUsername.value.trim();
    const password = credentialForm.credentialPassword.value.trim();

    if (!platform || !accountLabel || !username || !password) {
      credentialForm.reportValidity();
      return;
    }

    const loginUrl = credentialForm.credentialUrl.value.trim();
    const twoFactor = credentialForm.credential2fa.value.trim();
    const instructions = credentialForm.credentialInstructions.value.trim();

    const baseRecord = {
      platform,
      accountLabel,
      loginUrl,
      instructions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sensitiveStorage: workspaceKey ? 'encrypted' : 'plain'
    };

    persistCredentialSecret(baseRecord, { username, password, twoFactor, loginUrl })
      .then((payload) => {
        try {
          credentialsNode.set(payload);
          markWorkspaceActivity('lastCredentialChangeAt');
          credentialForm.reset();
        } catch (err) {
          console.error('Failed to store credential', err);
        }
      })
      .catch((err) => {
        console.error('Unable to save credential secret', err);
        showKeyFeedback('Could not encrypt credentials with the current key.', true);
      });
  }

  function handleCampaignUpdate(data, id) {
    markWorkspaceActivity('lastCampaignSyncAt');
    const record = sanitizeRecord(data);
    if (!record) {
      campaignRecords.delete(id);
      removeCampaignCard(id);
      updateCampaignEmptyState();
      return;
    }

    campaignRecords.set(id, record);
    const card = ensureCampaignCard(id);
    renderCampaignCard(card, record);
    updateCampaignEmptyState();
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

  function handleCredentialUpdate(data, id) {
    markWorkspaceActivity('lastCredentialSyncAt');
    const record = sanitizeRecord(data);
    if (!record) {
      credentialRecords.delete(id);
      removeCredentialCard(id);
      updateCredentialEmptyState();
      return;
    }

    let state = credentialRecords.get(id);
    if (!state) {
      const card = ensureCredentialCard(id);
      state = { card, record: null, secretData: null };
      credentialRecords.set(id, state);
    }
    state.record = record;
    renderCredentialCard(state.card, record, state)
      .then(() => {
        updateCredentialEmptyState();
      })
      .catch((err) => {
        console.error('Failed to render credential', err);
      });
  }

  function handleCampaignListChange(event) {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.dataset.campaignId) {
      const id = target.dataset.campaignId;
      const status = target.value;
      campaignsNode.get(id).put({ status, updatedAt: Date.now() });
      markWorkspaceActivity('lastCampaignChangeAt');
    } else if (target instanceof HTMLTextAreaElement && target.dataset.campaignId) {
      const id = target.dataset.campaignId;
      campaignsNode.get(id).put({ notes: target.value, updatedAt: Date.now() });
      markWorkspaceActivity('lastCampaignChangeAt');
    }
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

  function handleCampaignListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const id = target.dataset.campaignId;
    if (!id) return;

    if (action === 'delete-campaign') {
      campaignsNode.get(id).put(null);
      markWorkspaceActivity('lastCampaignChangeAt');
      return;
    }

    if (action === 'edit-campaign') {
      toggleCampaignEdit(id);
      return;
    }

    if (action === 'save-campaign') {
      saveCampaignEdits(id);
      return;
    }

    if (action === 'cancel-campaign') {
      cancelCampaignEdits(id);
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

  function handleCredentialListChange(event) {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && target.dataset.credentialId && target.dataset.field === 'instructions') {
      const id = target.dataset.credentialId;
      credentialsNode.get(id).put({ instructions: target.value, updatedAt: Date.now() });
      markWorkspaceActivity('lastCredentialChangeAt');
    } else if (target instanceof HTMLInputElement && target.dataset.secretField && target.closest('[data-secret-container]')) {
      const container = target.closest('[data-secret-container]');
      if (container) {
        container.dataset.dirty = 'true';
      }
    }
  }

  function handleCredentialListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const id = target.dataset.credentialId;
    if (!id) return;

    if (action === 'delete-credential') {
      credentialsNode.get(id).put(null);
      markWorkspaceActivity('lastCredentialChangeAt');
      return;
    }

    if (action === 'toggle-secret') {
      toggleSecretView(id);
      return;
    }

    if (action === 'save-secret') {
      const cardState = credentialRecords.get(id);
      if (!cardState) return;
      const container = cardState.card.querySelector('[data-secret-container]');
      if (!container) return;
      const values = readSecretInputs(container);
      persistCredentialSecret({ ...cardState.record, updatedAt: Date.now() }, values)
        .then((payload) => {
          credentialsNode.get(id).put(payload);
          markWorkspaceActivity('lastCredentialChangeAt');
          container.dataset.dirty = 'false';
          showKeyFeedback('Credentials updated.', false);
        })
        .catch((err) => {
          console.error('Failed to update credential secret', err);
          showKeyFeedback('Could not encrypt credentials with the current key.', true);
        });
    }

    if (action === 'edit-credential') {
      toggleCredentialEdit(id);
      return;
    }

    if (action === 'save-credential') {
      saveCredentialEdits(id);
      return;
    }

    if (action === 'cancel-credential') {
      cancelCredentialEdits(id);
    }
  }

  function ensureCampaignCard(id) {
    let card = campaignList.querySelector(`[data-campaign-id="${id}"]`);
    if (card) return card;
    card = createCampaignCard(id);
    campaignList.prepend(card);
    return card;
  }

  function createCampaignCard(id) {
    const card = document.createElement('div');
    card.className = 'campaign-card';
    card.dataset.campaignId = id;

    const header = document.createElement('div');
    header.className = 'card-header';

    const title = document.createElement('h3');
    title.dataset.role = 'campaignTitle';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.role = 'campaignStatus';
    actions.appendChild(badge);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.dataset.action = 'delete-campaign';
    deleteButton.dataset.campaignId = id;
    deleteButton.textContent = 'Delete';
    actions.appendChild(deleteButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'ghost-action';
    editButton.dataset.action = 'edit-campaign';
    editButton.dataset.campaignId = id;
    editButton.textContent = 'Edit';
    actions.appendChild(editButton);

    header.appendChild(actions);
    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const platformLine = document.createElement('span');
    platformLine.dataset.role = 'campaignPlatform';
    meta.appendChild(platformLine);

    const objectiveLine = document.createElement('span');
    objectiveLine.dataset.role = 'campaignObjective';
    meta.appendChild(objectiveLine);

    const windowLine = document.createElement('span');
    windowLine.dataset.role = 'campaignWindow';
    meta.appendChild(windowLine);

    card.appendChild(meta);

    const statusField = document.createElement('label');
    statusField.className = 'field';
    const statusLabel = document.createElement('span');
    statusLabel.className = 'field__label';
    statusLabel.textContent = 'Status';
    const statusSelect = document.createElement('select');
    statusSelect.dataset.campaignId = id;
    ['planning', 'drafting', 'scheduled', 'in-flight', 'completed', 'paused'].forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = labelForStatus(value);
      statusSelect.appendChild(option);
    });
    statusField.append(statusLabel, statusSelect);
    card.appendChild(statusField);

    const notesField = document.createElement('label');
    notesField.className = 'field';
    const notesLabel = document.createElement('span');
    notesLabel.className = 'field__label';
    notesLabel.textContent = 'Creative brief & checklist';
    const notesArea = document.createElement('textarea');
    notesArea.dataset.campaignId = id;
    notesField.append(notesLabel, notesArea);
    card.appendChild(notesField);

    const editSection = createCampaignEditSection(id);
    card.appendChild(editSection.wrapper);

    card.titleEl = title;
    card.statusBadge = badge;
    card.platformLine = platformLine;
    card.objectiveLine = objectiveLine;
    card.windowLine = windowLine;
    card.statusSelect = statusSelect;
    card.notesArea = notesArea;
    card.editSection = editSection;
    card.editButton = editButton;

    return card;
  }

  function createCampaignEditSection(id) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card-edit';
    wrapper.hidden = true;
    wrapper.dataset.editSection = 'campaign';

    const fields = document.createElement('div');
    fields.className = 'form-grid';

    const nameField = createEditField('Campaign name', 'name', id);
    const platformField = createEditField('Primary platform', 'platform', id);
    const objectiveField = createEditField('Objective', 'objective', id);
    const startField = createEditField('Start date', 'startDate', id, 'date');
    const endField = createEditField('End date', 'endDate', id, 'date');

    fields.append(nameField.wrapper, platformField.wrapper, objectiveField.wrapper, startField.wrapper, endField.wrapper);
    wrapper.appendChild(fields);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-action';
    saveButton.dataset.action = 'save-campaign';
    saveButton.dataset.campaignId = id;
    saveButton.textContent = 'Save changes';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'ghost-action';
    cancelButton.dataset.action = 'cancel-campaign';
    cancelButton.dataset.campaignId = id;
    cancelButton.textContent = 'Cancel';

    actions.append(saveButton, cancelButton);
    wrapper.appendChild(actions);

    return {
      wrapper,
      inputs: {
        name: nameField.input,
        platform: platformField.input,
        objective: objectiveField.input,
        startDate: startField.input,
        endDate: endField.input
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
    input.dataset.campaignEditField = field;
    input.dataset.campaignId = id;
    wrapper.append(label, input);
    return { wrapper, input };
  }

  function renderCampaignCard(card, record) {
    if (!card) return;
    card.titleEl.textContent = record.name || 'Untitled campaign';
    card.statusBadge.textContent = `${labelForStatus(record.status)} • ${formatRelativeTime(record.updatedAt)}`;
    card.statusSelect.value = record.status || 'planning';

    card.platformLine.textContent = `Platform: ${record.platform || 'Unassigned'}`;
    card.objectiveLine.textContent = record.objective ? `Objective: ${record.objective}` : 'Objective: —';
    card.windowLine.textContent = formatCampaignWindow(record.startDate, record.endDate);

    if (document.activeElement !== card.notesArea) {
      card.notesArea.value = record.notes || '';
    }

    if (card.editSection && card.editSection.wrapper.hidden) {
      updateCampaignEditInputs(card, record);
    }
  }

  function updateCampaignEditInputs(card, record) {
    const inputs = card.editSection ? card.editSection.inputs : null;
    if (!inputs) return;
    if (document.activeElement !== inputs.name) {
      inputs.name.value = record.name || '';
    }
    if (document.activeElement !== inputs.platform) {
      inputs.platform.value = record.platform || '';
    }
    if (document.activeElement !== inputs.objective) {
      inputs.objective.value = record.objective || '';
    }
    if (document.activeElement !== inputs.startDate) {
      inputs.startDate.value = record.startDate || '';
    }
    if (document.activeElement !== inputs.endDate) {
      inputs.endDate.value = record.endDate || '';
    }
  }

  function removeCampaignCard(id) {
    const card = campaignList.querySelector(`[data-campaign-id="${id}"]`);
    if (card) {
      card.remove();
    }
  }

  function updateCampaignEmptyState() {
    if (!campaignEmpty) return;
    const hasItems = campaignList && campaignList.querySelector('.campaign-card');
    campaignEmpty.hidden = !!hasItems;
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
      const imageUrls = Array.isArray(record.imageUrls)
        ? record.imageUrls
        : parseImageUrls(record.imageUrls);
      inputs.imageUrls.value = imageUrls.join('\n');
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

  function ensureCredentialCard(id) {
    let card = credentialList.querySelector(`[data-credential-id="${id}"]`);
    if (card) return card;
    card = createCredentialCard(id);
    credentialList.prepend(card);
    return card;
  }

  function createCredentialCard(id) {
    const card = document.createElement('div');
    card.className = 'credential-card';
    card.dataset.credentialId = id;

    const header = document.createElement('div');
    header.className = 'card-header';

    const title = document.createElement('h3');
    title.dataset.role = 'credentialTitle';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.role = 'credentialUpdated';
    actions.appendChild(badge);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.dataset.action = 'delete-credential';
    deleteButton.dataset.credentialId = id;
    deleteButton.textContent = 'Delete';
    actions.appendChild(deleteButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'ghost-action';
    editButton.dataset.action = 'edit-credential';
    editButton.dataset.credentialId = id;
    editButton.textContent = 'Edit';
    actions.appendChild(editButton);

    header.appendChild(actions);
    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const accountLine = document.createElement('span');
    accountLine.dataset.role = 'credentialAccount';
    meta.appendChild(accountLine);

    const loginLine = document.createElement('span');
    loginLine.dataset.role = 'credentialLogin';
    meta.appendChild(loginLine);

    card.appendChild(meta);

    const instructionsField = document.createElement('label');
    instructionsField.className = 'field';
    const instructionsLabel = document.createElement('span');
    instructionsLabel.className = 'field__label';
    instructionsLabel.textContent = 'Posting instructions';
    const instructionsArea = document.createElement('textarea');
    instructionsArea.dataset.credentialId = id;
    instructionsArea.dataset.field = 'instructions';
    instructionsField.append(instructionsLabel, instructionsArea);
    card.appendChild(instructionsField);

    const secretWrapper = document.createElement('div');
    secretWrapper.className = 'secret-wrapper';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'ghost-action';
    toggleButton.dataset.action = 'toggle-secret';
    toggleButton.dataset.credentialId = id;
    toggleButton.textContent = 'Show credentials';
    secretWrapper.appendChild(toggleButton);

    const lockedHint = document.createElement('div');
    lockedHint.className = 'locked-hint';
    lockedHint.dataset.lockedHint = 'true';
    lockedHint.textContent = 'Set the workspace key to decrypt usernames and passwords.';
    lockedHint.hidden = true;
    secretWrapper.appendChild(lockedHint);

    const secretDetails = document.createElement('div');
    secretDetails.className = 'secret-details';
    secretDetails.dataset.secretContainer = 'true';
    secretDetails.hidden = true;

    const urlField = createSecretField('Login URL', 'loginUrl');
    const usernameField = createSecretField('Username / email', 'username');
    const passwordField = createSecretField('Password / passphrase', 'password');
    const twoFactorField = createSecretField('Two-factor instructions', 'twoFactor', true);

    secretDetails.append(urlField.wrapper, usernameField.wrapper, passwordField.wrapper, twoFactorField.wrapper);

    const secretActions = document.createElement('div');
    secretActions.className = 'card-actions';
    const saveSecretButton = document.createElement('button');
    saveSecretButton.type = 'button';
    saveSecretButton.className = 'primary-action';
    saveSecretButton.dataset.action = 'save-secret';
    saveSecretButton.dataset.credentialId = id;
    saveSecretButton.textContent = 'Save credentials';
    secretActions.appendChild(saveSecretButton);
    secretDetails.appendChild(secretActions);

    secretWrapper.appendChild(secretDetails);
    card.appendChild(secretWrapper);

    const editSection = createCredentialEditSection(id);
    card.appendChild(editSection.wrapper);

    card.titleEl = title;
    card.badgeEl = badge;
    card.accountLine = accountLine;
    card.loginLine = loginLine;
    card.instructionsArea = instructionsArea;
    card.toggleButton = toggleButton;
    card.lockedHint = lockedHint;
    card.secretContainer = secretDetails;
    card.secretInputs = {
      loginUrl: urlField.input,
      username: usernameField.input,
      password: passwordField.input,
      twoFactor: twoFactorField.input
    };
    card.editSection = editSection;
    card.editButton = editButton;

    return card;
  }

  function createCredentialEditSection(id) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card-edit';
    wrapper.hidden = true;
    wrapper.dataset.editSection = 'credential';

    const fields = document.createElement('div');
    fields.className = 'form-grid';

    const platformField = createCredentialEditField('Platform', 'platform', id);
    const accountField = createCredentialEditField('Account label', 'accountLabel', id);
    const loginField = createCredentialEditField('Login URL', 'loginUrl', id, 'url');

    fields.append(platformField.wrapper, accountField.wrapper, loginField.wrapper);
    wrapper.appendChild(fields);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-action';
    saveButton.dataset.action = 'save-credential';
    saveButton.dataset.credentialId = id;
    saveButton.textContent = 'Save changes';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'ghost-action';
    cancelButton.dataset.action = 'cancel-credential';
    cancelButton.dataset.credentialId = id;
    cancelButton.textContent = 'Cancel';

    actions.append(saveButton, cancelButton);
    wrapper.appendChild(actions);

    return {
      wrapper,
      inputs: {
        platform: platformField.input,
        accountLabel: accountField.input,
        loginUrl: loginField.input
      }
    };
  }

  function createCredentialEditField(labelText, field, id, type) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const label = document.createElement('span');
    label.className = 'field__label';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type || 'text';
    input.dataset.credentialEditField = field;
    input.dataset.credentialId = id;
    wrapper.append(label, input);
    return { wrapper, input };
  }

  function createSecretField(labelText, field, multiline) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const label = document.createElement('span');
    label.className = 'field__label';
    label.textContent = labelText;
    let input;
    if (multiline) {
      input = document.createElement('textarea');
    } else {
      input = document.createElement('input');
      input.type = field === 'password' ? 'password' : 'text';
    }
    input.dataset.secretField = field;
    wrapper.append(label, input);
    return { wrapper, input };
  }

  async function renderCredentialCard(card, record, state) {
    if (!card) return;
    card.titleEl.textContent = record.platform || 'Unnamed platform';
    card.badgeEl.textContent = `Updated ${formatRelativeTime(record.updatedAt)}${record.sensitiveStorage === 'encrypted' ? ' • encrypted' : ''}`;
    card.accountLine.textContent = `Account: ${record.accountLabel || '—'}`;

    if (record.loginUrl) {
      card.loginLine.innerHTML = `Login: <a class="card-link" href="${record.loginUrl}" target="_blank" rel="noopener">${record.loginUrl}</a>`;
    } else {
      card.loginLine.textContent = 'Login: —';
    }

    if (document.activeElement !== card.instructionsArea) {
      card.instructionsArea.value = record.instructions || '';
    }

    if (card.editSection && card.editSection.wrapper.hidden) {
      updateCredentialEditInputs(card, record);
    }

    const secretData = await resolveSecretData(record);
    state.secretData = secretData;

    if (secretData) {
      card.dataset.secretState = 'unlocked';
      card.lockedHint.hidden = true;
      Object.entries(card.secretInputs).forEach(([key, input]) => {
        const value = secretData[key] || '';
        if (document.activeElement !== input) {
          input.value = value;
        }
      });
    } else {
      card.dataset.secretState = record.secret ? 'locked' : 'unavailable';
      card.lockedHint.hidden = !record.secret;
      Object.values(card.secretInputs).forEach((input) => {
        if (document.activeElement !== input) {
          input.value = '';
        }
      });
      card.secretContainer.hidden = true;
      card.toggleButton.textContent = record.secret ? 'Show credentials' : 'No sensitive data stored';
      return;
    }

    card.toggleButton.textContent = card.secretContainer.hidden ? 'Show credentials' : 'Hide credentials';
  }

  function updateCredentialEditInputs(card, record) {
    const inputs = card.editSection ? card.editSection.inputs : null;
    if (!inputs) return;
    if (document.activeElement !== inputs.platform) {
      inputs.platform.value = record.platform || '';
    }
    if (document.activeElement !== inputs.accountLabel) {
      inputs.accountLabel.value = record.accountLabel || '';
    }
    if (document.activeElement !== inputs.loginUrl) {
      inputs.loginUrl.value = record.loginUrl || '';
    }
  }

  function removeCredentialCard(id) {
    const card = credentialList.querySelector(`[data-credential-id="${id}"]`);
    if (card) {
      card.remove();
    }
  }

  function updateCredentialEmptyState() {
    if (!credentialEmpty) return;
    const hasItems = credentialList && credentialList.querySelector('.credential-card');
    credentialEmpty.hidden = !!hasItems;
  }

  function labelForStatus(value) {
    switch (value) {
      case 'drafting':
        return 'Drafting';
      case 'scheduled':
        return 'Scheduled';
      case 'in-flight':
        return 'In flight';
      case 'completed':
        return 'Completed';
      case 'paused':
        return 'Paused';
      case 'planning':
      default:
        return 'Planning';
    }
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

  function formatCampaignWindow(start, end) {
    if (!start && !end) return 'Window: TBD';
    if (start && end) return `Window: ${start} → ${end}`;
    if (start) return `Window: from ${start}`;
    return `Window: until ${end}`;
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
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function buildAssetLines(record) {
    const lines = [];
    if (record.assetLink) {
      lines.push(`Asset folder: <a class="card-link" href="${record.assetLink}" target="_blank" rel="noopener">${record.assetLink}</a>`);
    }
    const imageUrls = Array.isArray(record.imageUrls)
      ? record.imageUrls
      : parseImageUrls(record.imageUrls);
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

  function toggleSecretView(id) {
    const state = credentialRecords.get(id);
    if (!state) return;
    const card = state.card;
    if (card.dataset.secretState === 'locked') {
      card.lockedHint.hidden = false;
      showKeyFeedback('Enter the workspace key to unlock credentials.', true);
      return;
    }
    if (card.dataset.secretState === 'unavailable') {
      showKeyFeedback('This entry does not include sensitive fields yet.', false);
      return;
    }
    card.secretContainer.hidden = !card.secretContainer.hidden;
    card.toggleButton.textContent = card.secretContainer.hidden ? 'Show credentials' : 'Hide credentials';
  }

  function toggleCampaignEdit(id) {
    const record = campaignRecords.get(id);
    const card = campaignList.querySelector(`[data-campaign-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    const { wrapper } = card.editSection;
    wrapper.hidden = !wrapper.hidden;
    if (!wrapper.hidden) {
      updateCampaignEditInputs(card, record);
      card.editButton.textContent = 'Close';
    } else {
      card.editButton.textContent = 'Edit';
    }
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

  function saveCampaignEdits(id) {
    const record = campaignRecords.get(id);
    const card = campaignList.querySelector(`[data-campaign-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    const { inputs } = card.editSection;
    const name = inputs.name.value.trim();
    const platform = inputs.platform.value.trim();
    if (!name || !platform) {
      showKeyFeedback('Campaign name and platform are required.', true);
      return;
    }
    // Partial updates keep Gun node shape stable while preserving existing notes/status data.
    campaignsNode.get(id).put({
      name,
      platform,
      objective: inputs.objective.value.trim(),
      startDate: inputs.startDate.value,
      endDate: inputs.endDate.value,
      updatedAt: Date.now()
    });
    markWorkspaceActivity('lastCampaignChangeAt');
    card.editSection.wrapper.hidden = true;
    card.editButton.textContent = 'Edit';
    showKeyFeedback('Campaign updated.', false);
  }

  function savePostEdits(id) {
    const record = postRecords.get(id);
    const card = postList.querySelector(`[data-post-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    const { inputs } = card.editSection;
    const title = inputs.title.value.trim();
    const platform = inputs.platform.value.trim();
    if (!title || !platform) {
      showKeyFeedback('Post title and platform are required.', true);
      return;
    }
    const imageUrls = parseImageUrls(inputs.imageUrls.value);
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
    showKeyFeedback('Scheduled post updated.', false);
  }

  function cancelCampaignEdits(id) {
    const record = campaignRecords.get(id);
    const card = campaignList.querySelector(`[data-campaign-id="${id}"]`);
    if (!record || !card || !card.editSection) return;
    updateCampaignEditInputs(card, record);
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

  function toggleCredentialEdit(id) {
    const state = credentialRecords.get(id);
    if (!state || !state.card || !state.card.editSection) return;
    const { wrapper } = state.card.editSection;
    wrapper.hidden = !wrapper.hidden;
    if (!wrapper.hidden) {
      updateCredentialEditInputs(state.card, state.record);
      state.card.editButton.textContent = 'Close';
    } else {
      state.card.editButton.textContent = 'Edit';
    }
  }

  function saveCredentialEdits(id) {
    const state = credentialRecords.get(id);
    if (!state || !state.card || !state.card.editSection) return;
    const { inputs } = state.card.editSection;
    const platform = inputs.platform.value.trim();
    const accountLabel = inputs.accountLabel.value.trim();
    if (!platform || !accountLabel) {
      showKeyFeedback('Platform and account label are required.', true);
      return;
    }
    // Keep secrets intact while updating visible metadata stored in the credential node.
    credentialsNode.get(id).put({
      platform,
      accountLabel,
      loginUrl: inputs.loginUrl.value.trim(),
      updatedAt: Date.now()
    });
    markWorkspaceActivity('lastCredentialChangeAt');
    state.card.editSection.wrapper.hidden = true;
    state.card.editButton.textContent = 'Edit';
    showKeyFeedback('Credential details updated.', false);
  }

  function cancelCredentialEdits(id) {
    const state = credentialRecords.get(id);
    if (!state || !state.card || !state.card.editSection) return;
    updateCredentialEditInputs(state.card, state.record);
    state.card.editSection.wrapper.hidden = true;
    state.card.editButton.textContent = 'Edit';
  }

  function readSecretInputs(container) {
    const values = {};
    container.querySelectorAll('[data-secret-field]').forEach((input) => {
      values[input.dataset.secretField] = input.value.trim();
    });
    return values;
  }

  async function persistCredentialSecret(baseRecord, fields) {
    const payload = { ...baseRecord };
    const cleanFields = {
      username: fields.username || '',
      password: fields.password || '',
      twoFactor: fields.twoFactor || '',
      loginUrl: fields.loginUrl || baseRecord.loginUrl || ''
    };

    if (workspaceKey && Gun.SEA && typeof Gun.SEA.encrypt === 'function') {
      payload.secret = await Gun.SEA.encrypt(cleanFields, workspaceKey);
      payload.secretVersion = 'v1';
      payload.sensitiveStorage = 'encrypted';
      payload.username = null;
      payload.password = null;
      payload.twoFactor = null;
    } else {
      payload.secret = null;
      payload.secretVersion = null;
      payload.sensitiveStorage = 'plain';
      payload.username = cleanFields.username;
      payload.password = cleanFields.password;
      payload.twoFactor = cleanFields.twoFactor;
    }

    payload.loginUrl = cleanFields.loginUrl;
    payload.updatedAt = Date.now();
    return payload;
  }

  async function resolveSecretData(record) {
    if (record.secret && workspaceKey && Gun.SEA && typeof Gun.SEA.decrypt === 'function') {
      try {
        const decrypted = await Gun.SEA.decrypt(record.secret, workspaceKey);
        if (decrypted && typeof decrypted === 'object') {
          return {
            loginUrl: decrypted.loginUrl || record.loginUrl || '',
            username: decrypted.username || '',
            password: decrypted.password || '',
            twoFactor: decrypted.twoFactor || ''
          };
        }
      } catch (err) {
        console.warn('Failed to decrypt credential', err);
        return null;
      }
      return null;
    }

    if (typeof record.username === 'string' || typeof record.password === 'string' || typeof record.twoFactor === 'string') {
      return {
        loginUrl: record.loginUrl || '',
        username: record.username || '',
        password: record.password || '',
        twoFactor: record.twoFactor || ''
      };
    }

    return null;
  }

  function handleWorkspaceKeySubmit(event) {
    event.preventDefault();
    const value = workspaceKeyInput.value.trim();
    if (!value) {
      workspaceKeyInput.focus();
      return;
    }
    workspaceKey = value;
    persistWorkspaceKey(value);
    markWorkspaceActivity('lastKeyUpdateAt');
    showKeyFeedback('Workspace key set. Encrypted credentials will unlock for this session.', false);
    refreshCredentialSecrets();
    keyForm.reset();
  }

  function handleWorkspaceKeyClear() {
    workspaceKey = '';
    persistWorkspaceKey('');
    markWorkspaceActivity('lastKeyUpdateAt');
    showKeyFeedback('Workspace key cleared. Sensitive fields are locked.', false);
    credentialRecords.forEach((state) => {
      if (state.card) {
        state.card.secretContainer.hidden = true;
        state.card.dataset.secretState = state.record && state.record.secret ? 'locked' : 'unavailable';
        state.card.toggleButton.textContent = state.record && state.record.secret ? 'Show credentials' : 'No sensitive data stored';
        state.card.lockedHint.hidden = !(state.record && state.record.secret);
      }
    });
  }

  function refreshCredentialSecrets() {
    credentialRecords.forEach((state, id) => {
      if (!state.record) return;
      renderCredentialCard(state.card, state.record, state).catch((err) => {
        console.error('Failed to refresh credential secret', err);
      });
    });
  }

  function showKeyFeedback(message, isError) {
    if (!keyFeedback) return;
    keyFeedback.textContent = message;
    keyFeedback.style.color = isError ? 'rgba(220, 53, 69, 0.85)' : 'inherit';
  }

  function persistWorkspaceKey(value) {
    try {
      if (value) {
        sessionStorage.setItem(KEY_STORAGE_KEY, value);
      } else {
        sessionStorage.removeItem(KEY_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Failed to persist workspace key', err);
    }
  }

  function restoreWorkspaceKey() {
    try {
      const stored = sessionStorage.getItem(KEY_STORAGE_KEY);
      if (stored) {
        workspaceKey = stored;
        showKeyFeedback('Workspace key restored for this session. Credentials are ready to unlock.', false);
        refreshCredentialSecrets();
      }
    } catch (err) {
      console.warn('Failed to restore workspace key', err);
    }
  }
})();
