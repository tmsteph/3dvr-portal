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
  let saveTimer = null;

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

  function cloneState(input) {
    const next = createDefaultState();
    if (!input || typeof input !== 'object') {
      return next;
    }

    fieldElements.forEach((field) => {
      const key = field.dataset.field;
      if (typeof input[key] === 'string') {
        next[key] = input[key];
      }
    });

    const sourceChecks = input.checks && typeof input.checks === 'object' ? input.checks : {};
    CHECK_IDS.forEach((id) => {
      next.checks[id] = Boolean(sourceChecks[id]);
    });

    next.updatedAt = Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : 0;
    next.localSavedAt = Number.isFinite(Number(input.localSavedAt)) ? Number(input.localSavedAt) : 0;
    next.gunSavedAt = Number.isFinite(Number(input.gunSavedAt)) ? Number(input.gunSavedAt) : 0;

    if (input.author && typeof input.author === 'object') {
      next.author = {
        mode: typeof input.author.mode === 'string' ? input.author.mode : next.author.mode,
        key: typeof input.author.key === 'string' ? input.author.key : next.author.key,
        label: typeof input.author.label === 'string' ? input.author.label : next.author.label,
        detail: typeof input.author.detail === 'string' ? input.author.detail : next.author.detail
      };
    }

    return next;
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

  function buildSummary(current) {
    return [
      'Week 1 worksheet summary',
      '',
      `Credited to: ${current.author.label} (${current.author.detail})`,
      '',
      'Trusted reviewers:',
      current.trustedReviewers || '[not filled in]',
      '',
      'Key questions:',
      current.keyQuestions || '[not filled in]',
      '',
      'Objections:',
      current.objections || '[not filled in]',
      '',
      'Decision list for Thursday, March 26, 2026:',
      current.decisionList || '[not filled in]',
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
        gunDetail.textContent = 'Check your connection or Gun relay access, then keep working locally.';
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

  function loadRemoteState() {
    if (!worksheetNode || worksheetNode.__isGunStub) {
      gunStatus.textContent = 'Gun backup unavailable, local save still active';
      gunDetail.textContent = 'This worksheet will keep saving locally on this device.';
      return;
    }

    worksheetNode.once((remote) => {
      if (!remote || typeof remote !== 'object') {
        gunStatus.textContent = state.gunSavedAt
          ? `Gun backup: ${formatStamp(state.gunSavedAt)}`
          : 'Ready for first Gun backup';
        gunDetail.textContent = `Backups will be credited to ${state.author.label}.`;
        return;
      }

      const remoteState = cloneState(remote);
      if (remoteState.updatedAt > state.updatedAt) {
        state = remoteState;
        state.author = buildIdentity();
        writeLocalState();
        syncInputs();
        gunStatus.textContent = remoteState.gunSavedAt
          ? `Gun backup: ${formatStamp(remoteState.gunSavedAt)}`
          : 'Loaded remote worksheet';
        gunDetail.textContent = `Loaded the latest worksheet credited to ${remoteState.author.label || state.author.label}.`;
        return;
      }

      gunStatus.textContent = state.gunSavedAt
        ? `Gun backup: ${formatStamp(state.gunSavedAt)}`
        : 'Ready for first Gun backup';
      gunDetail.textContent = `Local worksheet is current. Backups stay credited to ${state.author.label}.`;
    });
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

    const identity = buildIdentity();
    updateIdentityUI(identity);

    storageKey = `${STORAGE_PREFIX}${identity.key}`;
    state = readLocalState();
    state.author = identity;

    const gun = gunContext && gunContext.gun && typeof gunContext.gun.get === 'function'
      ? gunContext.gun
      : createNodeStub();
    const portalRoot = gun.get('3dvr-portal');
    worksheetNode = portalRoot
      .get('roadmap')
      .get('march-april')
      .get('week-1')
      .get('worksheets')
      .get(identity.key);

    syncInputs();
    attachFieldHandlers();
    attachCopyHandlers();
    loadRemoteState();
  }

  initWorkspace();
})();
