(function initPocketWorkstation(window, document) {
  if (!window || !document) {
    return;
  }

  const STORAGE_KEY = '3dvr-pocket-workstation.identity';
  const APP_ROOT_PATH = ['3dvr-portal', 'pocketWorkstation', 'users'];
  const PAIRING_PATH = ['3dvr-portal', 'pocketWorkstation', 'pairing'];

  const refs = {
    identityLabel: document.getElementById('identity-label'),
    syncStatus: document.getElementById('sync-status'),
    notesCount: document.getElementById('notes-count'),
    commandsCount: document.getElementById('commands-count'),
    projectsCount: document.getElementById('projects-count'),
    pairingForm: document.getElementById('pairing-form'),
    pairingCodeInput: document.getElementById('pairing-code-input'),
    pairingStatus: document.getElementById('pairing-status'),
    noteForm: document.getElementById('note-form'),
    noteStatus: document.getElementById('note-status'),
    noteList: document.getElementById('note-list'),
    commandForm: document.getElementById('command-form'),
    commandStatus: document.getElementById('command-status'),
    commandList: document.getElementById('command-list'),
    projectForm: document.getElementById('project-form'),
    projectStatus: document.getElementById('project-status-text'),
    projectList: document.getElementById('project-list'),
    helperForm: document.getElementById('helper-form'),
    helperInput: document.getElementById('helper-input'),
    helperOutput: document.getElementById('helper-output'),
  };

  const state = {
    identity: null,
    notes: [],
    commands: [],
    projects: [],
  };

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createId(prefix) {
    const base = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    return prefix ? `${prefix}-${base}` : base;
  }

  function normalizeCode(value) {
    return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  function createLocalGunSubscriptionStub() {
    return {
      off() {},
    };
  }

  function createLocalGunNodeStub() {
    return {
      __isGunStub: true,
      get() {
        return createLocalGunNodeStub();
      },
      put(_value, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
        }
        return this;
      },
      once(callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(undefined), 0);
        }
        return this;
      },
      map() {
        return {
          on() {
            return createLocalGunSubscriptionStub();
          },
        };
      },
    };
  }

  function createLocalGunUserStub() {
    return {
      is: null,
      _: {},
      recall() {},
      leave() {},
    };
  }

  function ensureGunContext(factory, label) {
    const ensureGun = window.ScoreSystem && typeof window.ScoreSystem.ensureGun === 'function'
      ? window.ScoreSystem.ensureGun.bind(window.ScoreSystem)
      : null;
    if (ensureGun) {
      return ensureGun(factory, { label });
    }
    try {
      const gun = typeof factory === 'function' ? factory() : null;
      if (gun) {
        return {
          gun,
          user: typeof gun.user === 'function' ? gun.user() : createLocalGunUserStub(),
          isStub: !!gun.__isGunStub,
        };
      }
    } catch (error) {
      console.warn(`Pocket Workstation Gun init failed for ${label}`, error);
    }
    return {
      gun: {
        __isGunStub: true,
        get() {
          return createLocalGunNodeStub();
        },
        user() {
          return createLocalGunUserStub();
        },
      },
      user: createLocalGunUserStub(),
      isStub: true,
    };
  }

  function getNodeFromPath(root, path) {
    return path.reduce((node, key) => (node && typeof node.get === 'function' ? node.get(key) : createLocalGunNodeStub()), root);
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (_error) {
      return '';
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // Ignore storage write failures.
    }
  }

  function resolveIdentity() {
    if (window.AuthIdentity && typeof window.AuthIdentity.syncStorageFromSharedIdentity === 'function') {
      window.AuthIdentity.syncStorageFromSharedIdentity(window.localStorage);
    }

    const alias = normalizeText(safeStorageGet('alias'));
    const username = normalizeText(safeStorageGet('username'));
    if (alias) {
      return {
        key: `alias-${alias.toLowerCase()}`,
        label: username || alias,
        mode: 'signed-in',
      };
    }

    const storedGuest = normalizeText(safeStorageGet(STORAGE_KEY));
    const guestId = storedGuest || createId('guest');
    if (!storedGuest) {
      safeStorageSet(STORAGE_KEY, guestId);
    }
    return {
      key: guestId,
      label: `Guest ${guestId.slice(-6)}`,
      mode: 'guest',
    };
  }

  function getPairingCodeFromUrl() {
    try {
      const url = new URL(window.location.href);
      return normalizeCode(url.searchParams.get('pairCode') || '');
    } catch (_error) {
      return '';
    }
  }

  function recordToCard(record, type) {
    if (type === 'commands') {
      return `
        <article class="record-card">
          <h3>${escapeHtml(record.name || 'Untitled command')}</h3>
          <p class="record-card__meta">${escapeHtml(record.context || 'Reusable command')}</p>
          <code>${escapeHtml(record.command || '')}</code>
        </article>
      `;
    }

    if (type === 'projects') {
      return `
        <article class="record-card">
          <h3>${escapeHtml(record.name || 'Untitled project')}</h3>
          <p class="record-card__meta">${escapeHtml(record.status || 'active')}</p>
          <p>${escapeHtml(record.nextStep || '')}</p>
        </article>
      `;
    }

    return `
      <article class="record-card">
        <h3>${escapeHtml(record.title || 'Untitled note')}</h3>
        <p>${escapeHtml(record.body || '')}</p>
      </article>
    `;
  }

  function renderRecords(type) {
    const list = type === 'notes' ? refs.noteList : type === 'commands' ? refs.commandList : refs.projectList;
    const records = state[type];
    const count = records.length;

    if (type === 'notes') refs.notesCount.textContent = String(count);
    if (type === 'commands') refs.commandsCount.textContent = String(count);
    if (type === 'projects') refs.projectsCount.textContent = String(count);

    if (!list) {
      return;
    }

    if (!count) {
      list.innerHTML = `<p class="helper-output__placeholder">No ${type} yet.</p>`;
      return;
    }

    list.innerHTML = records
      .slice()
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .map(record => recordToCard(record, type))
      .join('');
  }

  function upsertRecord(type, record) {
    const key = String(record.id || '');
    if (!key) {
      return;
    }
    const existingIndex = state[type].findIndex(entry => entry.id === key);
    if (existingIndex >= 0) {
      state[type][existingIndex] = record;
    } else {
      state[type].push(record);
    }
    renderRecords(type);
  }

  function buildHelperResult(intent) {
    const normalized = normalizeText(intent).toLowerCase();
    let title = 'General builder flow';
    let steps = [
      'Clarify the target project, environment, and desired outcome.',
      'Save the important command or note so you can reuse it later.',
      'Run the smallest safe step first and verify the result.',
    ];
    let commands = [
      'git status',
      'git add .',
      'git commit -m "update"',
    ];
    let explanation = 'Pocket Workstation v0.1 starts with practical next steps and reusable commands.';

    if (normalized.includes('deploy')) {
      title = 'Deploy workflow';
      steps = [
        'Check the branch and working tree before you ship.',
        'Push the latest code and trigger the platform deploy.',
        'Verify the live route after deployment, not just the build log.',
      ];
      commands = [
        'git status',
        'git add . && git commit -m "update" && git push',
        'vercel deploy --prod',
      ];
      explanation = 'Deployment work should always end with a real runtime check.';
    } else if (normalized.includes('ssh') || normalized.includes('server') || normalized.includes('connect')) {
      title = 'Server connection flow';
      steps = [
        'Confirm the host, user, and auth method.',
        'Connect with SSH and verify the current directory and service status.',
        'Save the exact connection command for next time.',
      ];
      commands = [
        'ssh user@example-server',
        'pwd',
        'systemctl status your-service',
      ];
      explanation = 'Server access gets safer when the exact command and destination are stored.';
    } else if (normalized.includes('laravel')) {
      title = 'Laravel app deploy';
      steps = [
        'Pull the newest code on the target environment.',
        'Install dependencies and run production-safe build steps.',
        'Migrate carefully and verify the app route after deploy.',
      ];
      commands = [
        'composer install --no-dev --optimize-autoloader',
        'php artisan migrate --force',
        'php artisan optimize',
      ];
      explanation = 'Laravel deploys usually need dependency install, migration, and cache optimization in the right order.';
    } else if (normalized.includes('note')) {
      title = 'Capture and organize notes';
      steps = [
        'Write the note title around the decision or artifact.',
        'Keep the body short enough to scan later on mobile.',
        'Link the note to a project or command if it affects delivery.',
      ];
      commands = [
        '3dvr notes',
        'Open /notes in the portal',
      ];
      explanation = 'Notes become useful when they connect to the next action.';
    }

    return { title, steps, commands, explanation };
  }

  function renderHelper(intent) {
    const result = buildHelperResult(intent);
    refs.helperOutput.innerHTML = `
      <h3>${escapeHtml(result.title)}</h3>
      <ol>${result.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
      <code>${escapeHtml(result.commands.join('\n'))}</code>
      <p>${escapeHtml(result.explanation)}</p>
    `;
  }

  function bindForm(form, type, statusNode, buildRecord) {
    if (!form) {
      return;
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      const record = buildRecord(new FormData(form));
      upsertRecord(type, record);
      saveRecord(type, record, statusNode);
      form.reset();
    });
  }

  const gunContext = ensureGunContext(
    () => (typeof window.Gun === 'function'
      ? window.Gun({
          peers: window.__GUN_PEERS__ || [
            'wss://relay.3dvr.tech/gun',
            'wss://gun-relay-3dvr.fly.dev/gun',
          ],
          axe: true,
        })
      : null),
    'pocket-workstation'
  );

  const portalRoot = getNodeFromPath(gunContext.gun, ['3dvr-portal']);
  const pairingNode = getNodeFromPath(gunContext.gun, PAIRING_PATH);
  state.identity = resolveIdentity();

  function getUserNode(type) {
    return getNodeFromPath(portalRoot, ['pocketWorkstation', 'users', state.identity.key, type]);
  }

  function saveRecord(type, record, statusNode) {
    const node = getUserNode(type);
    if (statusNode) {
      statusNode.textContent = 'Saved locally. Syncing to Gun…';
    }
    node.get(record.id).put(record, ack => {
      if (!statusNode) {
        return;
      }
      if (ack && ack.err) {
        statusNode.textContent = 'Saved locally. Gun sync will retry when available.';
        return;
      }
      statusNode.textContent = 'Saved locally and synced to Gun.';
    });
  }

  function hydrateType(type) {
    const node = getUserNode(type);
    node.map().on((data, key) => {
      if (!data || key === '_' || typeof data !== 'object') {
        return;
      }
      const record = {
        ...data,
        id: String(data.id || key),
      };
      upsertRecord(type, record);
    });
  }

  function buildSignInRedirect(code) {
    return `../sign-in.html?redirect=${encodeURIComponent(`/pocket-workstation/?pairCode=${encodeURIComponent(code)}#connect-title`)}`;
  }

  function linkPairingCode(code) {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) {
      refs.pairingStatus.textContent = 'Enter the 6-character code shown in Termux.';
      return;
    }

    if (state.identity.mode !== 'signed-in') {
      refs.pairingStatus.innerHTML = `Sign in first, then come back to link this code. <a href="${escapeHtml(buildSignInRedirect(normalizedCode))}">Sign in</a>`;
      return;
    }

    refs.pairingStatus.textContent = 'Linking this browser to the Termux session…';
    pairingNode.get(normalizedCode).put({
      code: normalizedCode,
      alias: state.identity.label,
      identityKey: state.identity.key,
      pairedAt: Date.now(),
      source: 'portal-pocket-workstation',
    }, ack => {
      if (ack && ack.err) {
        refs.pairingStatus.textContent = 'Could not link the code yet. Retry when Gun is reachable.';
        return;
      }
      refs.pairingStatus.textContent = `Linked code ${normalizedCode}. Return to Termux and the CLI should finish automatically.`;
    });
  }

  function init() {
    refs.identityLabel.textContent = state.identity.mode === 'signed-in'
      ? `Signed in as ${state.identity.label}`
      : `Guest workspace for ${state.identity.label}`;
    refs.syncStatus.textContent = gunContext.isStub ? 'Offline mode' : 'Connected to Gun';

    const pairingCode = getPairingCodeFromUrl();
    if (pairingCode && refs.pairingCodeInput) {
      refs.pairingCodeInput.value = pairingCode;
      refs.pairingStatus.textContent = state.identity.mode === 'signed-in'
        ? `Ready to link code ${pairingCode}.`
        : 'Sign in on this device first, then link the code.';
    }

    renderRecords('notes');
    renderRecords('commands');
    renderRecords('projects');

    hydrateType('notes');
    hydrateType('commands');
    hydrateType('projects');

    bindForm(refs.noteForm, 'notes', refs.noteStatus, formData => ({
      id: createId('note'),
      title: normalizeText(formData.get('title')) || 'Untitled note',
      body: normalizeText(formData.get('body')),
      updatedAt: Date.now(),
      author: state.identity.label,
    }));

    bindForm(refs.commandForm, 'commands', refs.commandStatus, formData => ({
      id: createId('command'),
      name: normalizeText(formData.get('name')) || 'Untitled command',
      command: normalizeText(formData.get('command')),
      context: normalizeText(formData.get('context')) || 'Reusable command',
      updatedAt: Date.now(),
      author: state.identity.label,
    }));

    bindForm(refs.projectForm, 'projects', refs.projectStatus, formData => ({
      id: createId('project'),
      name: normalizeText(formData.get('name')) || 'Untitled project',
      status: normalizeText(formData.get('status')) || 'active',
      nextStep: normalizeText(formData.get('nextStep')),
      updatedAt: Date.now(),
      author: state.identity.label,
    }));

    if (refs.helperForm) {
      refs.helperForm.addEventListener('submit', event => {
        event.preventDefault();
        renderHelper(refs.helperInput.value);
      });
    }

    if (refs.pairingForm) {
      refs.pairingForm.addEventListener('submit', event => {
        event.preventDefault();
        linkPairingCode(refs.pairingCodeInput.value);
      });
    }
  }

  init();
})(window, document);
