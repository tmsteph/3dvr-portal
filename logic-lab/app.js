'use strict';

(function initLogicLab(window, document) {
  if (!window || !document) {
    return;
  }

  const STORAGE_KEY = 'portal-logic-lab-sessions';
  const DRAFT_KEY = 'portal-logic-lab-draft';
  const MAX_SESSIONS = 12;
  const SESSION_VERSION = '2026-04-09-logic-lab-v1';
  const DEFAULT_GUN_PEERS = [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun',
  ];
  const LENSES = {
    logic: {
      key: 'logic',
      title: 'Logic',
      description: 'Check structure first. A valid argument can still rest on weak premises.',
      checklist: [
        'Define the key terms before evaluating the claim.',
        'List the premises in plain language.',
        'Ask whether the conclusion follows from those premises.',
        'Look for contradiction, ambiguity, or hidden assumptions.',
      ],
    },
    epistemology: {
      key: 'epistemology',
      title: 'Epistemology',
      description: 'Focus on evidence quality, uncertainty, and what would change the answer.',
      checklist: [
        'Separate observation from interpretation.',
        'Name the evidence that supports or weakens the claim.',
        'Say what remains unknown.',
        'Lower confidence when the support is thin or second-hand.',
      ],
    },
    ethics: {
      key: 'ethics',
      title: 'Ethics',
      description: 'Make the value conflict explicit instead of hiding it in the wording.',
      checklist: [
        'Identify who is helped, harmed, or ignored.',
        'Separate factual predictions from moral judgments.',
        'Name the values in conflict.',
        'Explain why the chosen tradeoff beats the alternatives.',
      ],
    },
    agency: {
      key: 'agency',
      title: 'Agency',
      description: 'Model goals, incentives, and how an agent could drift from its stated objective.',
      checklist: [
        'State the agent goal in operational terms.',
        'Identify incentives that can distort behavior.',
        'Check for reward hacking or proxy gaming.',
        'Describe what the agent should refuse or escalate.',
      ],
    },
  };

  const refs = {
    form: document.getElementById('reasoning-form'),
    claimInput: document.getElementById('claim-input'),
    lensSelect: document.getElementById('lens-select'),
    depthSelect: document.getElementById('depth-select'),
    goalInput: document.getElementById('goal-input'),
    notesInput: document.getElementById('notes-input'),
    scaffoldOutput: document.getElementById('scaffold-output'),
    promptOutput: document.getElementById('prompt-output'),
    connectionBadge: document.getElementById('connection-badge'),
    identityBadge: document.getElementById('identity-badge'),
    saveBadge: document.getElementById('save-badge'),
    disciplineGrid: document.getElementById('discipline-grid'),
    lensSummaryTitle: document.getElementById('lens-summary-title'),
    lensSummaryBody: document.getElementById('lens-summary-body'),
    checklistList: document.getElementById('checklist-list'),
    drillList: document.getElementById('drill-list'),
    sessionList: document.getElementById('session-list'),
    jumpLinks: Array.from(document.querySelectorAll('[data-jump-target]')),
    metricDrillCount: document.getElementById('metric-drill-count'),
    metricSessionCount: document.getElementById('metric-session-count'),
    metricChecklistCount: document.getElementById('metric-checklist-count'),
    metricChecklistLabel: document.getElementById('metric-checklist-label'),
    buildScaffold: document.getElementById('build-scaffold'),
    saveSession: document.getElementById('save-session'),
    copyScaffold: document.getElementById('copy-scaffold'),
    copyPrompt: document.getElementById('copy-prompt'),
  };

  if (!refs.form || !refs.claimInput || !refs.scaffoldOutput || !refs.promptOutput) {
    return;
  }

  const DRILLS = seedDrills();
  const gunContext = ensureGunContext(() => createLogicLabGun(), 'logic-lab');
  const gun = gunContext.gun;
  const portalRoot = gun && typeof gun.get === 'function' ? gun.get('3dvr-portal') : createLocalGunNodeStub();
  const sessionsNode = portalRoot.get('philosophyLogic').get('sessions');
  const state = {
    activeLens: 'logic',
    activeDrillId: '',
    activeSessionId: '',
    author: resolveAuthor(),
    sessions: readSessions(),
  };

  hydrateDraft();
  bindEvents();
  renderLensDeck();
  renderDrillList();
  renderSessions();
  renderConnectionState();
  renderIdentity();
  updateOutputs();

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (_error) {
      return '';
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function safeReadJson(key, fallback) {
    const raw = safeLocalStorageGet(key);
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return fallback;
    }
  }

  function safeWriteJson(key, value) {
    try {
      return safeLocalStorageSet(key, JSON.stringify(value));
    } catch (_error) {
      return false;
    }
  }

  function createLocalGunSubscriptionStub() {
    return {
      off() {},
    };
  }

  function createLocalGunNodeStub() {
    const node = {
      __isGunStub: true,
      get() {
        return createLocalGunNodeStub();
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
      },
      on() {
        return createLocalGunSubscriptionStub();
      },
      map() {
        return {
          on() {
            return createLocalGunSubscriptionStub();
          },
        };
      },
      off() {},
    };
    return node;
  }

  function createLocalGunUserStub() {
    const node = createLocalGunNodeStub();
    return {
      ...node,
      is: null,
      _: {},
      recall() {},
    };
  }

  function createGunStub() {
    return {
      __isGunStub: true,
      get() {
        return createLocalGunNodeStub();
      },
      user() {
        return createLocalGunUserStub();
      },
    };
  }

  function ensureGunContext(factory, label) {
    const ensureGun = window.ScoreSystem && typeof window.ScoreSystem.ensureGun === 'function'
      ? window.ScoreSystem.ensureGun.bind(window.ScoreSystem)
      : null;

    if (ensureGun) {
      return ensureGun(factory, { label });
    }

    if (typeof factory === 'function') {
      try {
        const instance = factory();
        if (instance) {
          return {
            gun: instance,
            user: typeof instance.user === 'function' ? instance.user() : createLocalGunUserStub(),
            isStub: !!instance.__isGunStub,
          };
        }
      } catch (error) {
        console.warn(`Failed to initialize ${label || 'gun'} context`, error);
      }
    }

    const stub = createGunStub();
    return {
      gun: stub,
      user: stub.user(),
      isStub: true,
    };
  }

  function createLogicLabGun() {
    if (typeof Gun !== 'function') {
      return null;
    }

    const peers = window.__GUN_PEERS__ || DEFAULT_GUN_PEERS;

    try {
      return Gun({ peers, axe: true });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      if (/storage|quota|blocked|third-party/i.test(message)) {
        try {
          return Gun({ peers, axe: true, radisk: false, localStorage: false });
        } catch (fallbackError) {
          console.warn('Logic Lab Gun fallback init failed', fallbackError);
        }
      } else {
        console.warn('Logic Lab Gun init failed unexpectedly', error);
      }
    }

    return null;
  }

  function resolveAuthor() {
    if (window.AuthIdentity && typeof window.AuthIdentity.syncStorageFromSharedIdentity === 'function') {
      try {
        window.AuthIdentity.syncStorageFromSharedIdentity(window.localStorage);
      } catch (error) {
        console.warn('Failed to sync shared identity into local storage', error);
      }
    }

    const signedIn = safeLocalStorageGet('signedIn') === 'true';
    const alias = normalizeText(safeLocalStorageGet('alias'));
    const username = normalizeText(safeLocalStorageGet('username'));
    if (signedIn && alias) {
      return {
        mode: 'user',
        key: `user-${alias.toLowerCase()}`,
        label: username || alias.split('@')[0],
      };
    }

    const ensureGuestIdentity = window.ScoreSystem
      && typeof window.ScoreSystem.ensureGuestIdentity === 'function'
      ? window.ScoreSystem.ensureGuestIdentity.bind(window.ScoreSystem)
      : null;
    const guestId = normalizeText(ensureGuestIdentity ? ensureGuestIdentity() : safeLocalStorageGet('guestId'));
    return {
      mode: 'guest',
      key: guestId || `guest-${Date.now()}`,
      label: normalizeText(safeLocalStorageGet('guestDisplayName')) || 'Guest',
    };
  }

  function seedDrills() {
    return [
      {
        id: 'hidden-premise',
        title: 'Hidden premise audit',
        lens: 'logic',
        depth: 'balanced',
        claim: 'A bot that answers faster is automatically a better teacher.',
        goal: 'Expose the hidden premise and test whether speed implies learning quality.',
        notes: 'Push the model to separate delivery speed from comprehension, retention, and calibration.',
      },
      {
        id: 'evidence-ladder',
        title: 'Evidence ladder',
        lens: 'epistemology',
        depth: 'deep',
        claim: 'Users say the feature feels better, so the feature definitely improved outcomes.',
        goal: 'Separate anecdote, proxy metrics, and direct evidence before making a strong claim.',
        notes: 'Ask what evidence would confirm or overturn the conclusion.',
      },
      {
        id: 'is-ought-split',
        title: 'Is / ought split',
        lens: 'ethics',
        depth: 'balanced',
        claim: 'Because automation is possible, the team ought to automate customer replies.',
        goal: 'Force the model to distinguish factual capability from moral or strategic justification.',
        notes: 'Identify the stakeholders, the failure modes, and the approval boundary.',
      },
      {
        id: 'goal-drift',
        title: 'Goal drift map',
        lens: 'agency',
        depth: 'deep',
        claim: 'If the bot is rewarded for ticket closure time, it will help customers better.',
        goal: 'Model the incentive and look for reward hacking or shallow optimization.',
        notes: 'Push the agent to state what behavior the metric rewards and what it leaves out.',
      },
      {
        id: 'counterexample-builder',
        title: 'Counterexample builder',
        lens: 'logic',
        depth: 'quick',
        claim: 'Every persuasive answer is also a truthful answer.',
        goal: 'Generate one clean counterexample and lower confidence accordingly.',
        notes: 'Avoid rhetoric. Use a compact, concrete case.',
      },
      {
        id: 'value-conflict',
        title: 'Value conflict map',
        lens: 'ethics',
        depth: 'balanced',
        claim: 'A tutoring bot should always tell the full truth, even if it overwhelms the student.',
        goal: 'Name the values in conflict and justify a revised practical policy.',
        notes: 'Balance honesty, clarity, pacing, and learner agency.',
      },
    ];
  }

  function readDraft() {
    const draft = safeReadJson(DRAFT_KEY, null);
    if (!draft || typeof draft !== 'object') {
      return {
        lens: 'logic',
        depth: 'balanced',
        claim: '',
        goal: '',
        notes: '',
      };
    }

    return {
      lens: Object.prototype.hasOwnProperty.call(LENSES, draft.lens) ? draft.lens : 'logic',
      depth: ['quick', 'balanced', 'deep'].includes(draft.depth) ? draft.depth : 'balanced',
      claim: normalizeText(draft.claim),
      goal: normalizeText(draft.goal),
      notes: normalizeText(draft.notes),
    };
  }

  function writeDraft() {
    const draft = {
      lens: state.activeLens,
      depth: refs.depthSelect.value,
      claim: refs.claimInput.value,
      goal: refs.goalInput.value,
      notes: refs.notesInput.value,
    };
    safeWriteJson(DRAFT_KEY, draft);
  }

  function readSessions() {
    const stored = safeReadJson(STORAGE_KEY, []);
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored
      .filter(entry => entry && typeof entry === 'object')
      .slice(0, MAX_SESSIONS);
  }

  function writeSessions(sessions) {
    safeWriteJson(STORAGE_KEY, sessions.slice(0, MAX_SESSIONS));
  }

  function hydrateDraft() {
    const draft = readDraft();
    state.activeLens = draft.lens;
    refs.claimInput.value = draft.claim;
    refs.lensSelect.value = draft.lens;
    refs.depthSelect.value = draft.depth;
    refs.goalInput.value = draft.goal;
    refs.notesInput.value = draft.notes;
  }

  function bindEvents() {
    refs.form.addEventListener('submit', event => {
      event.preventDefault();
      writeDraft();
      updateOutputs();
      setSaveBadge('Scaffold rebuilt from the current draft.', 'neutral');
    });

    refs.claimInput.addEventListener('input', handleDraftInput);
    refs.goalInput.addEventListener('input', handleDraftInput);
    refs.notesInput.addEventListener('input', handleDraftInput);
    refs.depthSelect.addEventListener('change', handleDraftInput);
    refs.lensSelect.addEventListener('change', event => {
      const value = normalizeText(event.target.value);
      if (!Object.prototype.hasOwnProperty.call(LENSES, value)) {
        return;
      }
      state.activeLens = value;
      state.activeDrillId = '';
      writeDraft();
      renderLensDeck();
      renderDrillList();
      updateOutputs();
    });

    refs.saveSession.addEventListener('click', saveCurrentSession);
    refs.copyScaffold.addEventListener('click', () => {
      copyText(refs.scaffoldOutput.value, 'Scaffold copied to the clipboard.');
    });
    refs.copyPrompt.addEventListener('click', () => {
      copyText(refs.promptOutput.value, 'Prompt copied to the clipboard.');
    });

    refs.jumpLinks.forEach(link => {
      link.addEventListener('click', event => {
        const targetId = normalizeText(link.getAttribute('data-jump-target'));
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) {
          return;
        }

        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
          if (typeof target.focus === 'function') {
            target.focus({ preventScroll: true });
          }
        }, 220);
      });
    });
  }

  function handleDraftInput() {
    writeDraft();
    updateOutputs();
  }

  function getCurrentLens() {
    return LENSES[state.activeLens] || LENSES.logic;
  }

  function getCurrentDrill() {
    return DRILLS.find(drill => drill.id === state.activeDrillId) || null;
  }

  function renderConnectionState() {
    if (gunContext.isStub) {
      refs.connectionBadge.textContent = 'Offline draft mode';
      refs.connectionBadge.className = 'logic-status-badge logic-status-badge--warn';
      return;
    }

    refs.connectionBadge.textContent = 'Connected to Gun';
    refs.connectionBadge.className = 'logic-status-badge';
  }

  function renderIdentity() {
    const label = state.author.mode === 'user'
      ? `Signed in as ${state.author.label}`
      : `Guest deck for ${state.author.label}`;
    refs.identityBadge.textContent = label;
  }

  function renderLensDeck() {
    const lensEntries = Object.values(LENSES);
    refs.disciplineGrid.innerHTML = '';
    lensEntries.forEach(lens => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `discipline-card${lens.key === state.activeLens ? ' is-active' : ''}`;
      button.setAttribute('role', 'listitem');
      button.innerHTML = [
        `<span class="discipline-card__title">${escapeHtml(lens.title)}</span>`,
        `<span class="discipline-card__meta">${escapeHtml(lens.description)}</span>`,
      ].join('');
      button.addEventListener('click', () => {
        state.activeLens = lens.key;
        state.activeDrillId = '';
        refs.lensSelect.value = lens.key;
        writeDraft();
        renderLensDeck();
        renderDrillList();
        updateOutputs();
      });
      refs.disciplineGrid.appendChild(button);
    });
  }

  function renderDrillList() {
    refs.metricDrillCount.textContent = String(DRILLS.length);
    refs.drillList.innerHTML = '';

    DRILLS.forEach(drill => {
      const button = document.createElement('button');
      button.type = 'button';
      const isActive = drill.id === state.activeDrillId;
      button.className = `drill-card${isActive ? ' is-active' : ''}`;
      button.setAttribute('role', 'listitem');
      button.innerHTML = [
        `<span class="drill-card__title">${escapeHtml(drill.title)}</span>`,
        `<span class="drill-card__meta">${escapeHtml(drill.goal)}</span>`,
      ].join('');
      button.addEventListener('click', () => applyDrill(drill));
      refs.drillList.appendChild(button);
    });
  }

  function applyDrill(drill) {
    state.activeDrillId = drill.id;
    state.activeLens = drill.lens;
    state.activeSessionId = '';
    refs.claimInput.value = drill.claim;
    refs.goalInput.value = drill.goal;
    refs.notesInput.value = drill.notes;
    refs.depthSelect.value = drill.depth;
    refs.lensSelect.value = drill.lens;
    writeDraft();
    renderLensDeck();
    renderDrillList();
    updateOutputs();
    setSaveBadge(`Loaded drill: ${drill.title}.`, 'neutral');
  }

  function renderSessions() {
    refs.metricSessionCount.textContent = String(state.sessions.length);
    refs.sessionList.innerHTML = '';

    if (!state.sessions.length) {
      const empty = document.createElement('p');
      empty.className = 'logic-empty';
      empty.textContent = 'No saved sessions yet. Save a scaffold to build a reusable training deck.';
      refs.sessionList.appendChild(empty);
      return;
    }

    state.sessions.forEach(session => {
      const button = document.createElement('button');
      button.type = 'button';
      const isActive = session.sessionId === state.activeSessionId;
      button.className = `session-card${isActive ? ' is-active' : ''}`;
      button.setAttribute('role', 'listitem');
      button.innerHTML = [
        `<span class="session-card__title">${escapeHtml(session.claim || 'Untitled session')}</span>`,
        `<span class="session-card__meta">${escapeHtml(session.goal || getLensLabel(session.lens))}</span>`,
        `<span class="session-card__timestamp">${escapeHtml(formatTimestamp(session.savedAt))}</span>`,
      ].join('');
      button.addEventListener('click', () => applySession(session));
      refs.sessionList.appendChild(button);
    });
  }

  function applySession(session) {
    state.activeSessionId = session.sessionId;
    state.activeDrillId = normalizeText(session.drillId);
    state.activeLens = Object.prototype.hasOwnProperty.call(LENSES, session.lens) ? session.lens : 'logic';
    refs.claimInput.value = normalizeText(session.claim);
    refs.goalInput.value = normalizeText(session.goal);
    refs.notesInput.value = normalizeText(session.notes);
    refs.depthSelect.value = ['quick', 'balanced', 'deep'].includes(session.depth) ? session.depth : 'balanced';
    refs.lensSelect.value = state.activeLens;
    writeDraft();
    renderLensDeck();
    renderDrillList();
    renderSessions();
    updateOutputs();
    setSaveBadge('Loaded saved session.', 'neutral');
  }

  function updateOutputs() {
    const lens = getCurrentLens();
    const drill = getCurrentDrill();
    const draft = {
      claim: normalizeText(refs.claimInput.value),
      goal: normalizeText(refs.goalInput.value),
      notes: normalizeText(refs.notesInput.value),
      depth: normalizeText(refs.depthSelect.value) || 'balanced',
    };

    refs.scaffoldOutput.value = buildReasoningScaffold(draft, lens, drill);
    refs.promptOutput.value = buildTrainingPrompt(draft, lens, drill);

    refs.lensSummaryTitle.textContent = lens.title;
    refs.lensSummaryBody.textContent = lens.description;
    refs.checklistList.innerHTML = '';
    lens.checklist.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      refs.checklistList.appendChild(li);
    });
    refs.metricChecklistCount.textContent = String(lens.checklist.length);
    refs.metricChecklistLabel.textContent = `${lens.title} checklist ready.`;
  }

  function buildReasoningScaffold(draft, lens, drill) {
    const claim = draft.claim || 'Add a claim or a question you want the bot to analyze.';
    const goal = draft.goal || 'Clarify what better reasoning should look like.';
    const notes = draft.notes || 'Add domain constraints, known risks, or stakeholder context.';
    const drillTitle = drill ? drill.title : 'Custom session';

    return [
      '# Question',
      claim,
      '',
      '# Goal',
      goal,
      '',
      '# Lens',
      `${lens.title}: ${lens.description}`,
      '',
      '# Drill',
      drillTitle,
      '',
      '# Definitions',
      '- Which terms need to be defined before the claim can be judged?',
      '- Which words are vague, overloaded, or likely to shift meaning?',
      '',
      '# Facts vs Values',
      '- What descriptive claims are being made?',
      '- What normative or strategic judgments are being assumed?',
      '',
      '# Premises',
      '1. Premise one:',
      '2. Premise two:',
      '3. Hidden premise:',
      '',
      '# Inference Check',
      '- Does the conclusion follow from the premises?',
      '- If not, what leap or missing bridge is present?',
      '',
      '# Evidence Check',
      '- What evidence supports the premises?',
      '- What evidence is missing or weak?',
      '',
      '# Counterexample',
      '- Give one concrete case that would pressure-test the claim.',
      '',
      '# Strongest Objection',
      '- State the best opposing view without caricature.',
      '',
      '# Revision',
      '- Rewrite the conclusion in a form that survives the objections better.',
      '',
      '# Confidence',
      '- Report a confidence score from 0.0 to 1.0 and explain why.',
      '',
      '# Constraints',
      notes,
    ].join('\n');
  }

  function buildTrainingPrompt(draft, lens, drill) {
    const claim = draft.claim || 'Add a claim or a question first.';
    const goal = draft.goal || 'Improve reasoning quality.';
    const notes = draft.notes || 'No extra constraints provided.';
    const drillLine = drill ? `Drill focus: ${drill.title}.` : 'Drill focus: custom reasoning session.';

    return [
      `Analyze the following claim using ${lens.title}.`,
      '',
      `Claim: ${claim}`,
      `Goal: ${goal}`,
      `Depth: ${describeDepth(draft.depth)}`,
      drillLine,
      `Context: ${notes}`,
      '',
      'Return exactly these sections:',
      '1. Definitions',
      '2. Facts vs values',
      '3. Premises',
      '4. Validity check',
      '5. Evidence check',
      '6. Strongest objection',
      '7. Counterexample',
      '8. Revised conclusion',
      '9. Confidence from 0.0 to 1.0',
      '',
      'Rules:',
      '- Do not hide uncertainty.',
      '- Name missing definitions.',
      '- Separate descriptive claims from normative claims.',
      '- Distinguish validity from truth.',
      '- Lower confidence when evidence is thin.',
      '- Prefer short concrete sentences over rhetoric.',
      '',
      'Lens checklist:',
      ...lens.checklist.map(item => `- ${item}`),
    ].join('\n');
  }

  function describeDepth(depth) {
    if (depth === 'quick') {
      return 'quick pass';
    }
    if (depth === 'deep') {
      return 'deep review';
    }
    return 'balanced';
  }

  function saveCurrentSession() {
    const claim = normalizeText(refs.claimInput.value);
    if (!claim) {
      refs.claimInput.focus();
      setSaveBadge('Add a question or claim before saving.', 'warn');
      return;
    }

    const sessionId = state.activeSessionId || createSessionId();
    const session = {
      sessionId,
      version: SESSION_VERSION,
      savedAt: new Date().toISOString(),
      lens: state.activeLens,
      depth: refs.depthSelect.value,
      claim,
      goal: normalizeText(refs.goalInput.value),
      notes: normalizeText(refs.notesInput.value),
      drillId: state.activeDrillId,
      scaffold: refs.scaffoldOutput.value,
      prompt: refs.promptOutput.value,
      author: state.author,
    };

    state.activeSessionId = sessionId;
    state.sessions = [session]
      .concat(state.sessions.filter(entry => entry.sessionId !== sessionId))
      .slice(0, MAX_SESSIONS);
    writeSessions(state.sessions);
    renderSessions();
    setSaveBadge('Saved locally. Syncing to Gun.', 'neutral');

    sessionsNode.get(sessionId).put(session, acknowledgement => {
      if (acknowledgement && acknowledgement.err) {
        setSaveBadge('Saved locally. Gun sync will retry when available.', 'warn');
        return;
      }
      setSaveBadge('Saved locally and synced to Gun.', 'neutral');
    });
  }

  function createSessionId() {
    const randomPart = Math.random().toString(36).slice(2, 8);
    return `logic-${Date.now()}-${randomPart}`;
  }

  async function copyText(value, successMessage) {
    const text = normalizeText(value);
    if (!text) {
      setSaveBadge('Nothing to copy yet.', 'warn');
      return;
    }

    if (window.navigator && window.navigator.clipboard && typeof window.navigator.clipboard.writeText === 'function') {
      try {
        await window.navigator.clipboard.writeText(text);
        setSaveBadge(successMessage, 'neutral');
        return;
      } catch (error) {
        console.warn('Clipboard write failed', error);
      }
    }

    try {
      const fallback = document.createElement('textarea');
      fallback.value = text;
      fallback.setAttribute('readonly', 'readonly');
      fallback.style.position = 'absolute';
      fallback.style.left = '-9999px';
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand('copy');
      fallback.remove();
      setSaveBadge(successMessage, 'neutral');
    } catch (error) {
      console.warn('Fallback copy failed', error);
      setSaveBadge('Copy failed on this device.', 'warn');
    }
  }

  function setSaveBadge(message, tone) {
    refs.saveBadge.textContent = message;
    refs.saveBadge.className = 'logic-status-badge';
    if (tone === 'warn') {
      refs.saveBadge.className += ' logic-status-badge--warn';
      return;
    }
    refs.saveBadge.className += ' logic-status-badge--neutral';
  }

  function formatTimestamp(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return 'Saved recently';
    }
    return new Date(timestamp).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function getLensLabel(key) {
    return Object.prototype.hasOwnProperty.call(LENSES, key) ? LENSES[key].title : 'Logic';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : null);
