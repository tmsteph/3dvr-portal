(function weekOneWorksheet() {
  const STORAGE_PREFIX = '3dvr:roadmap:march-april:week-1:worksheet:';
  const DEFAULT_PEERS = [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun'
  ];
  const CHECK_IDS = [
    'list-five-reviewers',
    'rewrite-pitch',
    'capture-one-question',
    'capture-one-objection',
    'trim-decision-list',
    'collect-proof',
    'test-message',
    'final-readout'
  ];
  const CHECK_LABELS = {
    'list-five-reviewers': 'List five useful reviewers',
    'rewrite-pitch': 'Rewrite the pitch in 20 words or less',
    'capture-one-question': 'Capture one exact question',
    'capture-one-objection': 'Capture one real objection',
    'trim-decision-list': 'Trim the Thursday decision list',
    'collect-proof': 'Collect one proof asset',
    'test-message': 'Test the current pitch in one message',
    'final-readout': 'Prepare the Thursday readout'
  };
  const ITEM_FIELDS = ['trustedReviewers', 'keyQuestions', 'objections', 'decisionList'];
  const DEFAULT_DATA = {
    trustedReviewers: '',
    keyQuestions: '',
    objections: '',
    decisionList: '',
    oneSentencePitch: '',
    checks: {},
    updatedAt: 0,
    localSavedAt: 0,
    gunSavedAt: 0,
    author: {
      mode: 'guest',
      key: 'guest',
      label: 'Guest',
      detail: 'Guest worksheet'
    }
  };

  const fieldElements = Array.from(document.querySelectorAll('[data-field]'));
  const checkElements = Array.from(document.querySelectorAll('[data-check]'));
  const promptButtons = Array.from(document.querySelectorAll('[data-copy-prompt]'));
  const entryContainers = Array.from(document.querySelectorAll('[data-entry-field]'));
  const identityLabel = document.getElementById('identityLabel');
  const identityValue = document.getElementById('identityValue');
  const identityDetail = document.getElementById('identityDetail');
  const localStatus = document.getElementById('localStatus');
  const gunStatus = document.getElementById('gunStatus');
  const gunDetail = document.getElementById('gunDetail');
  const worksheetSummary = document.getElementById('worksheetSummary');
  const summaryStatus = document.getElementById('summaryStatus');
  const copySummaryButton = document.getElementById('copySummary');

  let gunContext = null;
  let worksheetNode = null;
  let storageKey = '';
  let state = createDefaultState();
  let activeIdentity = { ...DEFAULT_DATA.author };
  let saveTimer = null;
  const entryControls = new Map();

  function createDefaultState() {
    const freshChecks = {};
    CHECK_IDS.forEach((id) => {
      freshChecks[id] = false;
    });
    return {
      ...DEFAULT_DATA,
      checks: freshChecks,
      author: { ...DEFAULT_DATA.author }
    };
  }

  function assignStateValues(target, input) {
    if (!target || !input || typeof input !== 'object') {
      return target;
    }

    fieldElements.forEach((field) => {
      const key = field.dataset.field;
      if (typeof input[key] === 'string') {
        target[key] = input[key];
      }
    });

    if (input.checks && typeof input.checks === 'object') {
      CHECK_IDS.forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(input.checks, id)) {
          target.checks[id] = Boolean(input.checks[id]);
        }
      });
    }

    const updatedAt = Number(input.updatedAt);
    if (Number.isFinite(updatedAt)) {
      target.updatedAt = updatedAt;
    }

    const localSavedAt = Number(input.localSavedAt);
    if (Number.isFinite(localSavedAt)) {
      target.localSavedAt = localSavedAt;
    }

    const gunSavedAt = Number(input.gunSavedAt);
    if (Number.isFinite(gunSavedAt)) {
      target.gunSavedAt = gunSavedAt;
    }

    if (input.author && typeof input.author === 'object') {
      target.author = {
        mode: typeof input.author.mode === 'string' ? input.author.mode : target.author.mode,
        key: typeof input.author.key === 'string' ? input.author.key : target.author.key,
        label: typeof input.author.label === 'string' ? input.author.label : target.author.label,
        detail: typeof input.author.detail === 'string' ? input.author.detail : target.author.detail
      };
    }

    return target;
  }

  function cloneState(input, base = null) {
    const next = createDefaultState();
    assignStateValues(next, base);
    assignStateValues(next, input);
    return next;
  }

  function normalizeItem(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  function splitStoredItems(value) {
    if (typeof value !== 'string') return [];
    return value
      .split('\n')
      .map(normalizeItem)
      .filter(Boolean);
  }

  function splitInputItems(value, { allowCommas = false } = {}) {
    if (typeof value !== 'string') return [];
    return value
      .split(allowCommas ? /[\n,;]+/ : /\n+/)
      .map(normalizeItem)
      .filter(Boolean);
  }

  function formatStamp(timestamp) {
    if (!timestamp) return 'No saves yet';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'No saves yet';
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  function displayNameFromAlias(alias) {
    if (typeof alias !== 'string') return '';
    const normalized = alias.trim();
    if (!normalized) return '';
    return normalized.includes('@') ? normalized.split('@')[0] : normalized;
  }

  function createNodeStub() {
    const node = {
      __isGunStub: true,
      get() {
        return createNodeStub();
      },
      put(_value, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
        }
        return node;
      },
      once(callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(undefined), 0);
        }
        return node;
      }
    };
    return node;
  }

  function buildIdentity() {
    try {
      if (window.AuthIdentity && typeof window.AuthIdentity.syncStorageFromSharedIdentity === 'function') {
        window.AuthIdentity.syncStorageFromSharedIdentity(window.localStorage);
      }
    } catch (err) {
      console.warn('Unable to sync shared identity before worksheet init', err);
    }

    if (window.ScoreSystem && typeof window.ScoreSystem.ensureGuestIdentity === 'function') {
      const initialState = window.ScoreSystem.computeAuthState
        ? window.ScoreSystem.computeAuthState()
        : { mode: 'anon' };
      if (!initialState || initialState.mode === 'anon') {
        window.ScoreSystem.ensureGuestIdentity();
      }
    }

    const authState = window.ScoreSystem && typeof window.ScoreSystem.computeAuthState === 'function'
      ? window.ScoreSystem.computeAuthState()
      : { mode: 'guest' };

    if (authState.mode === 'user') {
      const alias = (authState.alias || '').trim();
      const username = (authState.username || '').trim() || displayNameFromAlias(alias) || 'Portal user';
      return {
        mode: 'user',
        key: `user:${alias.toLowerCase() || 'account'}`,
        label: username,
        detail: alias || 'Signed-in portal account'
      };
    }

    if (authState.mode === 'guest') {
      const guestId = (authState.guestId || '').trim() || 'guest';
      const guestName = (authState.guestDisplayName || '').trim() || 'Guest';
      return {
        mode: 'guest',
        key: `guest:${guestId}`,
        label: guestName,
        detail: `Guest workspace ${guestId}`
      };
    }

    return {
      mode: 'guest',
      key: 'guest:local',
      label: 'Guest',
      detail: 'Guest workspace'
    };
  }

  function updateIdentityUI(identity) {
    identityLabel.textContent = identity.mode === 'user' ? 'Signed-in credit' : 'Guest credit';
    identityValue.textContent = identity.label;
    identityDetail.textContent = identity.detail;
  }

  function mergeAuthorWithIdentity(author) {
    const nextAuthor = author && typeof author === 'object'
      ? { ...DEFAULT_DATA.author, ...author }
      : { ...DEFAULT_DATA.author };

    if (!activeIdentity || typeof activeIdentity !== 'object') {
      return nextAuthor;
    }

    if (nextAuthor.key && activeIdentity.key && nextAuthor.key !== activeIdentity.key) {
      return nextAuthor;
    }

    return {
      mode: activeIdentity.mode || nextAuthor.mode,
      key: activeIdentity.key || nextAuthor.key,
      label: activeIdentity.label || nextAuthor.label,
      detail: activeIdentity.detail || nextAuthor.detail
    };
  }

  function buildSummary(current) {
    const formatList = (value) => {
      const items = splitStoredItems(value);
      if (!items.length) return '[not filled in]';
      return items.map((item) => `- ${item}`).join('\n');
    };

    return [
      'Week 1 worksheet summary',
      '',
      `Credited to: ${current.author.label} (${current.author.detail})`,
      '',
      'Trusted reviewers:',
      formatList(current.trustedReviewers),
      '',
      'Key questions:',
      formatList(current.keyQuestions),
      '',
      'Objections:',
      formatList(current.objections),
      '',
      'Decision list for Thursday, March 26, 2026:',
      formatList(current.decisionList),
      '',
      'Current one-sentence pitch:',
      current.oneSentencePitch || '[not filled in]',
      '',
      'Completed 5-minute tasks:',
      CHECK_IDS.filter((id) => current.checks[id]).map((id) => CHECK_LABELS[id]).join(', ') || '[none yet]'
    ].join('\n');
  }

  function syncSummary() {
    worksheetSummary.value = buildSummary(state);
  }

  function syncInputs() {
    fieldElements.forEach((field) => {
      const key = field.dataset.field;
      field.value = typeof state[key] === 'string' ? state[key] : '';
    });

    ITEM_FIELDS.forEach((key) => {
      renderEntryField(key);
    });

    checkElements.forEach((checkbox) => {
      const key = checkbox.dataset.check;
      checkbox.checked = Boolean(state.checks[key]);
    });

    syncSummary();
    localStatus.textContent = state.localSavedAt
      ? `Local save: ${formatStamp(state.localSavedAt)}`
      : 'Waiting for first local save';
    gunStatus.textContent = state.gunSavedAt
      ? `Gun backup: ${formatStamp(state.gunSavedAt)}`
      : 'Waiting for first Gun backup';
  }

  function readLocalState() {
    if (!storageKey) return createDefaultState();
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return createDefaultState();
      return cloneState(JSON.parse(raw));
    } catch (err) {
      console.warn('Unable to read local worksheet state', err);
      return createDefaultState();
    }
  }

  function writeLocalState() {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStatus.textContent = `Local save: ${formatStamp(state.localSavedAt)}`;
    } catch (err) {
      console.warn('Unable to write local worksheet state', err);
      localStatus.textContent = 'Local save failed on this device';
    }
  }

  function toPayload() {
    const payload = {
      updatedAt: state.updatedAt,
      localSavedAt: state.localSavedAt,
      gunSavedAt: state.gunSavedAt,
      author: state.author,
      checks: {}
    };

    fieldElements.forEach((field) => {
      const key = field.dataset.field;
      payload[key] = state[key];
    });

    CHECK_IDS.forEach((id) => {
      payload.checks[id] = Boolean(state.checks[id]);
    });

    return payload;
  }

  function scheduleRemoteSave() {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      saveRemoteState();
    }, 700);
  }

  function saveRemoteState() {
    if (!worksheetNode || worksheetNode.__isGunStub) {
      gunStatus.textContent = 'Gun backup unavailable, local save still active';
      gunDetail.textContent = 'This browser will keep saving locally until Gun connects.';
      return;
    }

    gunStatus.textContent = 'Backing up to Gun...';
    gunDetail.textContent = `Writing this worksheet to the roadmap workspace as ${state.author.label}.`;
    worksheetNode.put(toPayload(), (ack) => {
      if (ack && ack.err) {
        console.warn('Gun backup failed', ack.err);
        gunStatus.textContent = 'Gun backup failed, local save still active';
        gunDetail.textContent = 'Check your connection or Brave shields / Gun relay access, then keep working locally.';
        return;
      }
      state.gunSavedAt = Date.now();
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Unable to refresh local worksheet state after Gun backup', err);
      }
      gunStatus.textContent = `Gun backup: ${formatStamp(state.gunSavedAt)}`;
      gunDetail.textContent = `Backed up under ${state.author.label}.`;
    });
  }

  function commitLocalChange() {
    state.updatedAt = Date.now();
    state.localSavedAt = state.updatedAt;
    syncSummary();
    writeLocalState();
    scheduleRemoteSave();
  }

  function attachFieldHandlers() {
    fieldElements.forEach((field) => {
      if (ITEM_FIELDS.includes(field.dataset.field)) {
        return;
      }
      field.addEventListener('input', () => {
        const key = field.dataset.field;
        state[key] = field.value;
        commitLocalChange();
      });
    });

    checkElements.forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        state.checks[checkbox.dataset.check] = checkbox.checked;
        commitLocalChange();
      });
    });
  }

  function resetEntryComposer(key, { keepValue = false } = {}) {
    const control = entryControls.get(key);
    if (!control) return;
    control.editIndex = -1;
    control.addButton.textContent = control.addLabel;
    control.cancelButton.hidden = true;
    if (!keepValue) {
      control.input.value = '';
    }
  }

  function renderEntryField(key) {
    const control = entryControls.get(key);
    if (!control) return;
    const items = splitStoredItems(state[key]);
    control.hidden.value = state[key];
    control.list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'entry-empty';
      empty.textContent = 'No entries yet. Add the first one above.';
      control.list.appendChild(empty);
      return;
    }

    items.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = 'entry-card';

      const text = document.createElement('p');
      text.className = 'entry-card__text';
      text.textContent = item;
      card.appendChild(text);

      const actions = document.createElement('div');
      actions.className = 'entry-card__actions';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'mini-button mini-button--ghost mini-button--small';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        control.editIndex = index;
        control.input.value = item;
        control.addButton.textContent = 'Update';
        control.cancelButton.hidden = false;
        control.input.focus();
      });
      actions.appendChild(edit);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mini-button mini-button--ghost mini-button--small';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        const nextItems = splitStoredItems(state[key]);
        nextItems.splice(index, 1);
        setEntryItems(key, nextItems);
      });
      actions.appendChild(remove);

      card.appendChild(actions);
      control.list.appendChild(card);
    });
  }

  function setEntryItems(key, items) {
    const control = entryControls.get(key);
    const normalized = items
      .map(normalizeItem)
      .filter(Boolean);
    const joined = normalized.join('\n');

    state[key] = joined;
    if (control && control.hidden) {
      control.hidden.value = joined;
    }
    resetEntryComposer(key);
    renderEntryField(key);
    commitLocalChange();
  }

  function parseEntryDraft(key, rawValue) {
    const allowCommas = key === 'trustedReviewers';
    return splitInputItems(rawValue, { allowCommas });
  }

  function submitEntry(key) {
    const control = entryControls.get(key);
    if (!control) return;

    const draftItems = parseEntryDraft(key, control.input.value);
    if (!draftItems.length) {
      return;
    }

    const nextItems = splitStoredItems(state[key]);
    if (Number.isInteger(control.editIndex) && control.editIndex >= 0) {
      nextItems.splice(control.editIndex, 1, ...draftItems);
    } else {
      nextItems.push(...draftItems);
    }

    setEntryItems(key, nextItems);
  }

  function attachEntryHandlers() {
    entryContainers.forEach((container) => {
      const key = container.dataset.entryField;
      const list = container.querySelector(`[data-entry-list="${key}"]`);
      const input = container.querySelector(`[data-entry-input="${key}"]`);
      const addButton = container.querySelector(`[data-entry-add="${key}"]`);
      const cancelButton = container.querySelector(`[data-entry-cancel="${key}"]`);
      const hidden = container.querySelector(`[data-field="${key}"]`);

      if (!key || !list || !input || !addButton || !cancelButton || !hidden) {
        return;
      }

      entryControls.set(key, {
        container,
        list,
        input,
        addButton,
        cancelButton,
        addLabel: addButton.textContent,
        hidden,
        editIndex: -1,
        multiline: input.tagName === 'TEXTAREA'
      });

      addButton.addEventListener('click', () => {
        submitEntry(key);
      });

      cancelButton.addEventListener('click', () => {
        resetEntryComposer(key);
      });

      input.addEventListener('keydown', (event) => {
        const control = entryControls.get(key);
        if (!control) return;
        if (!control.multiline && event.key === 'Enter' && input.value.trim()) {
          event.preventDefault();
          submitEntry(key);
          return;
        }
        if (control.multiline && (event.metaKey || event.ctrlKey) && event.key === 'Enter' && input.value.trim()) {
          event.preventDefault();
          submitEntry(key);
        }
      });

      input.addEventListener('paste', (event) => {
        const text = event.clipboardData ? event.clipboardData.getData('text') : '';
        const allowCommas = key === 'trustedReviewers';
        const splitPattern = allowCommas ? /[\n,;]+/ : /\n+/;
        if (!text || !splitPattern.test(text)) {
          return;
        }
        event.preventDefault();
        const parsed = parseEntryDraft(key, text);
        if (!parsed.length) return;
        const nextItems = splitStoredItems(state[key]).concat(parsed);
        setEntryItems(key, nextItems);
      });
    });
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      summaryStatus.textContent = successMessage;
    } catch (err) {
      console.warn('Clipboard write failed', err);
      summaryStatus.textContent = 'Copy failed in this browser.';
    }
  }

  function attachCopyHandlers() {
    copySummaryButton.addEventListener('click', () => {
      copyText(worksheetSummary.value, 'Worksheet summary copied.');
    });

    promptButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const promptId = button.dataset.copyPrompt;
        const source = document.querySelector(`[data-prompt="${promptId}"]`);
        if (!source) return;
        await copyText(source.value, 'Prompt copied.');
      });
    });
  }

  function applyIncomingState(input, { source = 'remote', persistLocal = true } = {}) {
    const nextState = cloneState(input, state);
    if (nextState.updatedAt <= state.updatedAt) {
      return false;
    }

    state = nextState;
    state.author = mergeAuthorWithIdentity(state.author);
    updateIdentityUI(state.author);
    syncInputs();

    if (persistLocal) {
      writeLocalState();
    }

    if (source === 'remote') {
      gunStatus.textContent = state.gunSavedAt
        ? `Gun backup: ${formatStamp(state.gunSavedAt)}`
        : 'Loaded remote worksheet';
      gunDetail.textContent = `Synced the latest worksheet credited to ${state.author.label}.`;
    } else if (source === 'storage') {
      summaryStatus.textContent = 'Synced changes from another 3DVR window.';
    }

    return true;
  }

  function handleRemoteSnapshot(remote, { initial = false } = {}) {
    if (!remote || typeof remote !== 'object') {
      if (!initial) {
        return;
      }
      gunStatus.textContent = state.gunSavedAt
        ? `Gun backup: ${formatStamp(state.gunSavedAt)}`
        : 'Ready for first Gun backup';
      gunDetail.textContent = `Backups will be credited to ${state.author.label}.`;
      return;
    }

    if (applyIncomingState(remote, { source: 'remote', persistLocal: true })) {
      return;
    }

    if (!initial) {
      return;
    }

    gunStatus.textContent = state.gunSavedAt
      ? `Gun backup: ${formatStamp(state.gunSavedAt)}`
      : 'Ready for first Gun backup';
    gunDetail.textContent = `Local worksheet is current. Backups stay credited to ${state.author.label}.`;
  }

  function loadRemoteState() {
    if (!worksheetNode || worksheetNode.__isGunStub) {
      gunStatus.textContent = 'Gun backup unavailable, local save still active';
      gunDetail.textContent = 'This worksheet will keep saving locally on this device.';
      return;
    }

    worksheetNode.once((remote) => {
      handleRemoteSnapshot(remote, { initial: true });
    });
  }

  function subscribeRemoteState() {
    if (!worksheetNode || worksheetNode.__isGunStub) {
      return;
    }

    try {
      worksheetNode.on((remote) => {
        handleRemoteSnapshot(remote, { initial: false });
      });
    } catch (err) {
      console.warn('Unable to subscribe to worksheet updates', err);
    }
  }

  function syncStateFromStorage() {
    const localState = readLocalState();
    applyIncomingState(localState, { source: 'storage', persistLocal: false });
  }

  function attachCrossWindowSync() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (!event || event.key !== storageKey) {
          return;
        }
        syncStateFromStorage();
      });

      window.addEventListener('focus', () => {
        syncStateFromStorage();
        loadRemoteState();
      });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          return;
        }
        syncStateFromStorage();
        loadRemoteState();
      });
    }
  }

  function initGun() {
    const peers = Array.isArray(window.__GUN_PEERS__) && window.__GUN_PEERS__.length
      ? window.__GUN_PEERS__
      : DEFAULT_PEERS;
    const ensureGun = window.ScoreSystem && typeof window.ScoreSystem.ensureGun === 'function'
      ? window.ScoreSystem.ensureGun.bind(window.ScoreSystem)
      : null;

    if (ensureGun) {
      gunContext = ensureGun(() => (typeof Gun === 'function'
        ? Gun({ peers, axe: true })
        : null), { label: 'roadmap-week-1' });
    } else if (typeof Gun === 'function') {
      const instance = Gun({ peers, axe: true });
      gunContext = {
        gun: instance,
        user: typeof instance.user === 'function' ? instance.user() : null,
        isStub: false
      };
    } else {
      gunContext = {
        gun: createNodeStub(),
        user: null,
        isStub: true
      };
    }

    if (window.ScoreSystem && gunContext && gunContext.user && typeof window.ScoreSystem.recallUserSession === 'function') {
      window.ScoreSystem.recallUserSession(gunContext.user);
    }
  }

  function initWorkspace() {
    initGun();

    activeIdentity = buildIdentity();
    updateIdentityUI(activeIdentity);

    storageKey = `${STORAGE_PREFIX}${activeIdentity.key}`;
    state = readLocalState();
    state.author = mergeAuthorWithIdentity(state.author);

    const gun = gunContext && gunContext.gun && typeof gunContext.gun.get === 'function'
      ? gunContext.gun
      : createNodeStub();
    const portalRoot = gun.get('3dvr-portal');
    worksheetNode = portalRoot
      .get('roadmap')
      .get('march-april')
      .get('week-1')
      .get('worksheets')
      .get(activeIdentity.key);

    attachEntryHandlers();
    syncInputs();
    attachFieldHandlers();
    attachCopyHandlers();
    attachCrossWindowSync();
    loadRemoteState();
    subscribeRemoteState();
  }

  initWorkspace();
})();
