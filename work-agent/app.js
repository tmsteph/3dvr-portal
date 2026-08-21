(function initWorkAgent() {
  const PROFILE_KEY = '3dvr.workAgent.profile';
  const RULES_KEY = '3dvr.workAgent.rules';
  const CONNECTIONS_KEY = '3dvr.workAgent.connections';
  const RESUME_KEY = '3dvr.workAgent.resume';

  const $ = id => document.getElementById(id);

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function setStatus(id, text) {
    const target = $(id);
    if (target) target.textContent = text;
  }

  function loadProfile() {
    const profile = readJson(PROFILE_KEY, {});
    $('name').value = profile.name || '';
    $('roles').value = profile.roles || '';
    $('market').value = profile.market || '';
    $('minimum-rate').value = profile.minimumRate || '';
    $('notes').value = profile.notes || '';
  }

  function saveProfile() {
    writeJson(PROFILE_KEY, {
      name: $('name').value.trim(),
      roles: $('roles').value.trim(),
      market: $('market').value.trim(),
      minimumRate: $('minimum-rate').value.trim(),
      notes: $('notes').value.trim(),
      updatedAt: Date.now(),
    });
    setStatus('profile-status', 'Profile saved on this device.');
  }

  function loadRules() {
    const rules = readJson(RULES_KEY, {});
    $('outbound-mode').value = rules.outboundMode || 'draft';
    $('booking-mode').value = rules.bookingMode || 'ask';
  }

  function saveRules() {
    writeJson(RULES_KEY, {
      outboundMode: $('outbound-mode').value,
      bookingMode: $('booking-mode').value,
      updatedAt: Date.now(),
    });
    setStatus('rules-status', 'Agent rules saved.');
  }

  function handleResume(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      localStorage.removeItem(RESUME_KEY);
      setStatus('resume-status', 'No resume selected yet.');
      return;
    }

    writeJson(RESUME_KEY, {
      name: file.name,
      size: file.size,
      type: file.type,
      selectedAt: Date.now(),
    });
    setStatus('resume-status', `${file.name} selected. Secure upload is not enabled yet.`);
  }

  function loadResume() {
    const resume = readJson(RESUME_KEY, null);
    if (resume && resume.name) {
      setStatus('resume-status', `${resume.name} was selected previously. Choose it again when secure upload is available.`);
    }
  }

  function readConnections() {
    return readJson(CONNECTIONS_KEY, {});
  }

  function saveConnectionMetadata(result) {
    if (!result || !result.ok || !result.provider || !result.connection) return;
    const scopeKey = result.connection.scopeKey || result.scopeKey || 'identity';
    if (scopeKey !== 'mail' && scopeKey !== 'gmail' && scopeKey !== 'calendar') return;

    const connections = readConnections();
    const key = scopeKey === 'gmail' ? 'mail' : scopeKey;
    connections[key] = {
      provider: result.provider,
      email: result.connection.email || (result.identity && result.identity.email) || '',
      displayName: result.connection.displayName || (result.identity && result.identity.displayName) || '',
      scopeKey: key,
      linkedAt: result.connection.linkedAt || Date.now(),
    };
    writeJson(CONNECTIONS_KEY, connections);
  }

  function consumeOAuthResult() {
    if (!window.PortalOAuth || typeof window.PortalOAuth.consumePendingResult !== 'function') return;
    const result = window.PortalOAuth.consumePendingResult();
    if (!result) return;

    if (result.ok) {
      saveConnectionMetadata(result);
      return;
    }

    const message = result.error || 'OAuth connection failed.';
    setStatus('mail-detail', message);
    setStatus('calendar-detail', message);
  }

  function renderConnections() {
    const connections = readConnections();
    const mail = connections.mail;
    const calendar = connections.calendar;

    if (mail) {
      $('mail-pill').textContent = 'Connected';
      $('mail-pill').classList.add('connected');
      setStatus('mail-detail', mail.email ? `Connected as ${mail.email}.` : 'Google mail connected.');
      $('connect-mail').textContent = 'Reconnect Gmail';
    }

    if (calendar) {
      $('calendar-pill').textContent = 'Connected';
      $('calendar-pill').classList.add('connected');
      setStatus('calendar-detail', calendar.email ? `Connected as ${calendar.email}.` : 'Google Calendar connected.');
      $('connect-calendar').textContent = 'Reconnect calendar';
    }
  }

  function beginOAuth(scopeKey) {
    if (!window.PortalOAuth || typeof window.PortalOAuth.begin !== 'function') {
      window.alert('Portal OAuth is unavailable.');
      return;
    }
    window.PortalOAuth.begin('google', {
      intent: 'connect',
      scopeKey,
      returnTo: '/work-agent/',
    });
  }

  $('save-profile').addEventListener('click', saveProfile);
  $('save-rules').addEventListener('click', saveRules);
  $('resume').addEventListener('change', handleResume);
  $('connect-mail').addEventListener('click', () => beginOAuth('mail'));
  $('connect-calendar').addEventListener('click', () => beginOAuth('calendar'));

  loadProfile();
  loadRules();
  loadResume();
  consumeOAuthResult();
  renderConnections();
})();
