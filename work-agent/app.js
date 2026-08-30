(function initWorkAgent() {
  const STATE_KEY = '3dvr.workAgent.state.v2';
  const OAUTH_PREFIX = '3dvr.workAgent.oauth.';
  const MAIL_QUERY = 'newer_than:90d {schedule booked booking "call time" availability available freelance crew labor "day rate" rate reschedule cancelled canceled}';

  const $ = id => document.getElementById(id);
  const now = () => new Date();

  const emptyState = () => ({
    profile: {},
    rules: {
      targetRate: 600,
      minimumRate: 450,
      dayLength: 10,
      overtimeRate: 1.5,
      travelRadius: 50,
      responseStyle: 'warm',
      standingInstructions: '',
    },
    daysOff: [],
    calendarEvents: [],
    mailSignals: [],
    companies: [],
    activity: [],
  });

  let state = readJson(STATE_KEY, emptyState());
  state = { ...emptyState(), ...state };
  state.profile = state.profile || {};
  state.rules = { ...emptyState().rules, ...(state.rules || {}) };
  state.daysOff = Array.isArray(state.daysOff) ? state.daysOff : [];
  state.calendarEvents = Array.isArray(state.calendarEvents) ? state.calendarEvents : [];
  state.mailSignals = Array.isArray(state.mailSignals) ? state.mailSignals : [];
  state.companies = Array.isArray(state.companies) ? state.companies : [];
  state.activity = Array.isArray(state.activity) ? state.activity : [];

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_err) {
      return false;
    }
  }

  function saveState() {
    writeJson(STATE_KEY, state);
  }

  function uniqueId(prefix = 'item') {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function setStatus(id, text) {
    const target = $(id);
    if (target) target.textContent = text;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function dateKey(date) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dateFromKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!match) return null;
    const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
    return Number.isNaN(result.getTime()) ? null : result;
  }

  function formatShortDate(key) {
    const value = dateFromKey(key);
    return value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value) : key;
  }

  function formatLongDate(key) {
    const value = dateFromKey(key);
    return value ? new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(value) : key;
  }

  function addActivity(text) {
    state.activity.unshift({ id: uniqueId('activity'), at: Date.now(), text: String(text || '').slice(0, 240) });
    state.activity = state.activity.slice(0, 60);
    saveState();
    renderActivity();
  }

  function readOAuth(scopeKey) {
    return readJson(`${OAUTH_PREFIX}${scopeKey}`, null);
  }

  function saveOAuth(scopeKey, connection) {
    writeJson(`${OAUTH_PREFIX}${scopeKey}`, connection);
  }

  function oauthConnected(scopeKey) {
    const connection = readOAuth(scopeKey);
    return Boolean(connection && connection.accessToken);
  }

  function beginOAuth(scopeKey) {
    if (!window.PortalOAuth || typeof window.PortalOAuth.begin !== 'function') {
      window.alert('Portal OAuth is unavailable on this deployment.');
      return;
    }
    window.PortalOAuth.begin('google', {
      intent: 'connect',
      scopeKey,
      returnTo: '/work-agent/',
    });
  }

  function consumeOAuthResult() {
    if (!window.PortalOAuth || typeof window.PortalOAuth.consumePendingResult !== 'function') return;
    const result = window.PortalOAuth.consumePendingResult();
    if (!result) return;
    const scopeKey = String(result.scopeKey || result.connection?.scopeKey || '').toLowerCase();
    if (!result.ok) {
      addActivity(`Connection failed: ${result.error || 'OAuth error'}`);
      return;
    }
    if (!['mail', 'gmail', 'calendar'].includes(scopeKey) || !result.connection?.accessToken) return;
    const key = scopeKey === 'gmail' ? 'mail' : scopeKey;
    saveOAuth(key, { ...result.connection, provider: result.provider || 'google', scopeKey: key });
    addActivity(`${key === 'mail' ? 'Gmail' : 'Google Calendar'} connected.`);
  }

  async function ensureFreshOAuth(scopeKey) {
    let connection = readOAuth(scopeKey);
    if (!connection?.accessToken) return null;
    const expiresAt = Number(connection.expiresAt) || 0;
    if (!expiresAt || expiresAt > Date.now() + 90_000 || !connection.refreshToken) return connection;

    const response = await fetch('/api/oauth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'refresh',
        refreshToken: connection.refreshToken,
        scopeKey,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to refresh Google connection.');
    connection = {
      ...connection,
      ...payload,
      refreshToken: payload.refreshToken || connection.refreshToken,
      scopeKey,
    };
    saveOAuth(scopeKey, connection);
    return connection;
  }

  function renderConnections() {
    const calendar = readOAuth('calendar');
    const mail = readOAuth('mail');

    const calendarConnected = Boolean(calendar?.accessToken);
    const mailConnected = Boolean(mail?.accessToken);
    $('calendar-pill').textContent = calendarConnected ? 'Connected' : 'Not connected';
    $('calendar-pill').classList.toggle('connected', calendarConnected);
    $('connect-calendar').textContent = calendarConnected ? 'Reconnect' : 'Connect';
    setStatus('calendar-detail', calendarConnected
      ? `Connected${calendar.email ? ` as ${calendar.email}` : ''}.`
      : 'Use your calendar as a source of busy time.');
    setStatus('calendar-stat', calendarConnected ? 'Connected' : 'Not connected');

    $('mail-pill').textContent = mailConnected ? 'Connected' : 'Not connected';
    $('mail-pill').classList.toggle('connected', mailConnected);
    $('connect-mail').textContent = mailConnected ? 'Reconnect' : 'Connect';
    setStatus('mail-detail', mailConnected
      ? `Connected${mail.email ? ` as ${mail.email}` : ''}.`
      : 'Scan for booking requests, call times, rate offers, and schedule changes.');
    setStatus('mail-stat', mailConnected ? 'Connected' : 'Not connected');
    setStatus('mail-scan-status', mailConnected ? 'Ready to scan recent work-related messages.' : 'Connect Gmail to begin.');
  }

  function normalizeGoogleEvent(event) {
    if (!event || event.status === 'cancelled') return null;
    const startValue = event.start?.dateTime || event.start?.date || '';
    const key = event.start?.date || dateKey(startValue);
    if (!key) return null;
    return {
      id: `google:${event.id || uniqueId('event')}`,
      date: key,
      title: String(event.summary || 'Calendar event').slice(0, 160),
      start: startValue,
      end: event.end?.dateTime || event.end?.date || '',
      source: 'google-calendar',
    };
  }

  async function syncCalendar() {
    if (!oauthConnected('calendar')) {
      setStatus('calendar-detail', 'Connect Google Calendar first.');
      return;
    }
    const button = $('sync-calendar');
    button.disabled = true;
    button.textContent = 'Syncing…';
    try {
      const connection = await ensureFreshOAuth('calendar');
      const start = new Date();
      start.setDate(start.getDate() - 1);
      const end = new Date();
      end.setDate(end.getDate() + 60);
      const response = await fetch('/api/calendar/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'listEvents',
          accessToken: connection.accessToken,
          calendarId: connection.calendarId || 'primary',
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          maxResults: 100,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Calendar sync failed.');
      const imported = (payload.events || []).map(normalizeGoogleEvent).filter(Boolean);
      state.calendarEvents = state.calendarEvents.filter(item => item.source !== 'google-calendar').concat(imported);
      saveState();
      renderAvailability();
      addActivity(`Calendar synced: ${imported.length} upcoming event${imported.length === 1 ? '' : 's'} read.`);
      setStatus('calendar-detail', `Synced ${imported.length} upcoming event${imported.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus('calendar-detail', error.message || 'Calendar sync failed.');
      addActivity(`Calendar sync failed: ${error.message || 'unknown error'}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Sync calendar';
    }
  }

  const monthMap = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
    september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };

  function normalizeInferredDate(year, month, day, yearWasExplicit) {
    const candidate = new Date(year, month, day, 12, 0, 0, 0);
    if (Number.isNaN(candidate.getTime()) || candidate.getMonth() !== month || candidate.getDate() !== day) return '';
    if (!yearWasExplicit) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 45);
      if (candidate < cutoff) candidate.setFullYear(candidate.getFullYear() + 1);
    }
    return dateKey(candidate);
  }

  function extractDates(text, anchor = new Date()) {
    const input = String(text || '').replace(/\s+/g, ' ');
    const found = new Set();
    let match;

    const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
    while ((match = iso.exec(input)) && found.size < 8) {
      found.add(normalizeInferredDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]), true));
    }

    const numeric = /\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}|\d{2}))?\b/g;
    while ((match = numeric.exec(input)) && found.size < 8) {
      let year = match[3] ? Number(match[3]) : anchor.getFullYear();
      if (year < 100) year += 2000;
      found.add(normalizeInferredDate(year, Number(match[1]) - 1, Number(match[2]), Boolean(match[3])));
    }

    const named = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/gi;
    while ((match = named.exec(input)) && found.size < 8) {
      const month = monthMap[match[1].toLowerCase().replace('.', '')];
      if (month === undefined) continue;
      const year = match[3] ? Number(match[3]) : anchor.getFullYear();
      found.add(normalizeInferredDate(year, month, Number(match[2]), Boolean(match[3])));
    }

    const anchorDate = anchor instanceof Date && !Number.isNaN(anchor.getTime()) ? anchor : new Date();
    if (/\btomorrow\b/i.test(input)) {
      const tomorrow = new Date(anchorDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      found.add(dateKey(tomorrow));
    }
    if (/\btoday\b/i.test(input)) found.add(dateKey(anchorDate));

    return Array.from(found).filter(Boolean).sort();
  }

  function extractRate(text) {
    const input = String(text || '').replace(/,/g, ' ');
    const patterns = [
      /\$\s?(\d{3,4})(?:\.\d{2})?\s*(?:\/\s*day|per\s+day|day\s+rate)/i,
      /(?:day\s+rate|rate)(?:\s+is|\s+of|\s*:|\s+at)?\s*\$?\s?(\d{3,4})(?:\.\d{2})?/i,
      /(?:at|for)\s+\$\s?(\d{3,4})(?:\.\d{2})?\s*(?:\/\s*day|per\s+day)?/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(input);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function classifyMessage(text) {
    const input = String(text || '').toLowerCase();
    if (/cancelled|canceled|reschedul|schedule change|call time changed/.test(input)) return 'schedule_change';
    if (/are you available|availability|can you work|can you take|available (?:on|for)|need (?:an? )?(?:a1|a2|tech|technician|audio|video|lighting)/.test(input)) return 'availability_request';
    if (/you(?:'re| are) booked|confirmed for|booking confirmation|scheduled for|call time/.test(input)) return 'booking';
    if (/day rate|rate is|rate of|\$\s?\d{3,4}\s*(?:\/\s*day|per day)/.test(input)) return 'rate_offer';
    return 'work_message';
  }

  function conflictForDates(dates) {
    const hardDates = new Set([
      ...state.daysOff.map(item => item.date),
      ...state.calendarEvents.map(item => item.date),
    ]);
    return dates.find(key => hardDates.has(key)) || '';
  }

  function recommendationFor(signal) {
    const conflict = conflictForDates(signal.dates || []);
    const minimum = Number(state.rules.minimumRate) || 0;
    const target = Number(state.rules.targetRate) || minimum;
    if (conflict) return { code: 'unavailable', label: `Unavailable · conflict ${formatShortDate(conflict)}`, tone: 'bad' };
    if (signal.rate && minimum && signal.rate < minimum) return { code: 'decline', label: `Below $${minimum} minimum`, tone: 'bad' };
    if (signal.rate && target && signal.rate < target) return { code: 'negotiate', label: `Negotiate toward $${target}`, tone: 'warn' };
    if (signal.rate && target && signal.rate >= target) return { code: 'good', label: `Rate meets target · $${signal.rate}`, tone: 'good' };
    if (signal.kind === 'booking') return { code: 'confirm', label: 'Likely booking · confirm details', tone: 'good' };
    return { code: 'review', label: 'Review before answering', tone: '' };
  }

  function responsePrefix() {
    if (state.rules.responseStyle === 'direct') return 'Thanks for reaching out.';
    if (state.rules.responseStyle === 'firm') return 'Thanks for checking with me.';
    return 'Thanks for reaching out — I appreciate you thinking of me.';
  }

  function buildReply(signal) {
    const recommendation = recommendationFor(signal);
    const dates = (signal.dates || []).map(formatShortDate).join(', ');
    const target = Number(state.rules.targetRate) || 0;
    const minimum = Number(state.rules.minimumRate) || target;
    const hours = Number(state.rules.dayLength) || 10;
    const overtime = Number(state.rules.overtimeRate) || 1.5;
    const prefix = responsePrefix();

    if (recommendation.code === 'unavailable') {
      return `${prefix} I’m not available${dates ? ` on ${dates}` : ' for that date'}. Please keep me in mind for another call.`;
    }
    if (recommendation.code === 'decline') {
      return `${prefix} My minimum for this type of call is $${minimum}/day for up to ${hours} hours. If the budget can get there, I’d be glad to take another look.`;
    }
    if (recommendation.code === 'negotiate') {
      return `${prefix} I’d be interested. My current rate is $${target}/day for up to ${hours} hours, with overtime at ${overtime}× after that. If you can get to that rate, I can confirm the details.`;
    }
    if (recommendation.code === 'good') {
      return `${prefix} The rate works for me${dates ? ` and ${dates} currently looks open` : ''}. Please send the venue, call time, expected hours, role, and onsite contact so I can confirm.`;
    }
    if (signal.kind === 'availability_request') {
      return `${prefix}${dates ? ` ${dates} currently looks open.` : ''} My current day rate is $${target}/day for up to ${hours} hours, with overtime at ${overtime}× after that. Send the show details and I’ll confirm.`;
    }
    return `${prefix} Please send the date, venue, call time, role, expected hours, and rate and I’ll confirm availability.`;
  }

  function analyzeMail(message, aiSignal = null) {
    const anchor = message.internalDate ? new Date(Number(message.internalDate)) : new Date(message.date || Date.now());
    const text = [message.subject, message.snippet, message.text].filter(Boolean).join('\n');
    const heuristicDates = extractDates(text, Number.isNaN(anchor.getTime()) ? new Date() : anchor);
    const aiConfidence = Number(aiSignal?.confidence) || 0;
    const useAi = Boolean(aiSignal && aiConfidence >= 0.55);
    const aiDates = useAi && Array.isArray(aiSignal.dates) ? aiSignal.dates.filter(Boolean) : [];
    const signal = {
      id: String(message.id || uniqueId('mail')),
      threadId: String(message.threadId || ''),
      from: String(message.from || ''),
      email: extractEmail(message.from),
      subject: String(message.subject || '(no subject)').slice(0, 180),
      snippet: String((useAi && aiSignal.summary) || message.snippet || message.text || '').slice(0, 420),
      date: String(message.date || ''),
      messageIdHeader: String(message.messageId || ''),
      references: String(message.references || ''),
      dates: aiDates.length ? aiDates : heuristicDates,
      rate: useAi && aiSignal.rate !== null && aiSignal.rate !== undefined ? Number(aiSignal.rate) : extractRate(text),
      kind: useAi ? String(aiSignal.intent || classifyMessage(text)) : classifyMessage(text),
      role: useAi ? String(aiSignal.role || '') : '',
      venue: useAi ? String(aiSignal.venue || '') : '',
      callTime: useAi ? String(aiSignal.callTime || '') : '',
      aiConfidence: useAi ? aiConfidence : 0,
      confirmed: false,
      dismissed: false,
    };
    signal.recommendation = recommendationFor(signal);
    signal.replyDraft = buildReply(signal);
    return signal;
  }

  async function extractMailWithAi(messages) {
    const response = await fetch('/api/openai-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workAgent: true,
        messages: (Array.isArray(messages) ? messages : []).slice(0, 20).map(message => ({
          id: message.id,
          from: message.from,
          subject: message.subject,
          date: message.date,
          internalDate: message.internalDate,
          snippet: message.snippet,
          text: String(message.text || '').slice(0, 2400),
        })),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'AI message extraction failed.');
    return new Map((Array.isArray(payload.signals) ? payload.signals : []).map(signal => [String(signal.id || ''), signal]));
  }

  function extractEmail(value) {
    const raw = String(value || '').trim();
    const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(raw);
    if (angle) return angle[1].toLowerCase();
    const plain = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.exec(raw);
    return plain ? plain[0].toLowerCase() : '';
  }

  async function scanMail() {
    if (!oauthConnected('mail')) {
      setStatus('mail-scan-status', 'Connect Gmail first.');
      return;
    }
    const button = $('scan-mail');
    button.disabled = true;
    button.textContent = 'Scanning…';
    setStatus('mail-scan-status', 'Reading recent work-related messages…');
    try {
      const connection = await ensureFreshOAuth('mail');
      const response = await fetch('/api/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'listMail',
          accessToken: connection.accessToken,
          query: MAIL_QUERY,
          limit: 20,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Gmail scan failed.');
      let aiSignals = new Map();
      let aiStatus = 'deterministic fallback';
      try {
        setStatus('mail-scan-status', 'Messages found. Asking AI to extract dates, rates, roles, venues, and call times…');
        aiSignals = await extractMailWithAi(payload.messages || []);
        aiStatus = 'AI interpretation';
      } catch (aiError) {
        addActivity(`AI email interpretation unavailable; used local fallback: ${aiError.message || 'unknown error'}`);
      }
      const previous = new Map(state.mailSignals.map(item => [item.id, item]));
      state.mailSignals = (payload.messages || []).map(message => {
        const next = analyzeMail(message, aiSignals.get(String(message.id || '')));
        const old = previous.get(next.id);
        if (old) {
          next.confirmed = Boolean(old.confirmed);
          next.dismissed = Boolean(old.dismissed);
          next.replyDraft = old.replyDraft || next.replyDraft;
        }
        return next;
      }).filter(signal => signal.kind !== 'not_work');
      saveState();
      renderMailSignals();
      renderAvailability();
      addActivity(`Gmail scanned: ${state.mailSignals.length} work-related message${state.mailSignals.length === 1 ? '' : 's'} reviewed with ${aiStatus}.`);
      setStatus('mail-scan-status', `${state.mailSignals.length} recent work-related message${state.mailSignals.length === 1 ? '' : 's'} found using ${aiStatus}. Review the agent’s interpretation below.`);
    } catch (error) {
      setStatus('mail-scan-status', error.message || 'Gmail scan failed.');
      addActivity(`Gmail scan failed: ${error.message || 'unknown error'}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Scan work email';
    }
  }

  function confirmedEmailEvents() {
    return state.mailSignals
      .filter(signal => signal.confirmed && !signal.dismissed)
      .flatMap(signal => (signal.dates || []).map(key => ({
        id: `mail:${signal.id}:${key}`,
        date: key,
        title: signal.subject,
        source: 'email-confirmed',
      })));
  }

  function allHardEvents() {
    return state.calendarEvents.concat(confirmedEmailEvents());
  }

  function renderAvailability() {
    const container = $('availability-grid');
    container.innerHTML = '';
    const hardEvents = allHardEvents();
    const daysOff = new Map(state.daysOff.map(item => [item.date, item]));
    const possibleByDate = new Map();
    state.mailSignals.filter(item => !item.dismissed && !item.confirmed).forEach(signal => {
      (signal.dates || []).forEach(key => {
        if (!possibleByDate.has(key)) possibleByDate.set(key, []);
        possibleByDate.get(key).push(signal);
      });
    });

    let firstOpen = '';
    for (let offset = 0; offset < 14; offset += 1) {
      const day = new Date();
      day.setHours(12, 0, 0, 0);
      day.setDate(day.getDate() + offset);
      const key = dateKey(day);
      const hard = hardEvents.filter(item => item.date === key);
      const off = daysOff.get(key);
      const possible = possibleByDate.get(key) || [];
      const status = off || hard.length ? 'busy' : possible.length ? 'possible' : 'open';
      if (!firstOpen && status === 'open') firstOpen = key;

      const card = document.createElement('article');
      card.className = `day-card ${status}`;
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day);
      const detail = off
        ? (off.note || 'Protected day off')
        : hard.length
          ? hard.slice(0, 2).map(item => item.title || 'Busy').join(' · ')
          : possible.length
            ? `${possible.length} possible work message${possible.length === 1 ? '' : 's'}`
            : 'No conflicts found';
      card.innerHTML = `
        <div class="day-name">${escapeHtml(weekday)}</div>
        <div class="day-number">${day.getDate()}</div>
        <div class="day-state ${status}">${status === 'busy' ? (off ? 'Off' : 'Busy') : status === 'possible' ? 'Possible work' : 'Open'}</div>
        <div class="day-detail">${escapeHtml(detail)}</div>
        ${off ? `<button class="day-remove" type="button" data-remove-day-off="${key}">Make available</button>` : ''}
      `;
      container.appendChild(card);
    }
    setStatus('next-open-day', firstOpen ? formatLongDate(firstOpen) : 'No open day in 2 weeks');
  }

  function renderMailSignals() {
    const container = $('mail-signals');
    const visible = state.mailSignals.filter(item => !item.dismissed);
    setStatus('offer-count', String(visible.length));
    if (!visible.length) {
      container.innerHTML = '<div class="empty">No work messages to review yet.</div>';
      return;
    }
    container.innerHTML = visible.map(signal => {
      const rec = recommendationFor(signal);
      signal.recommendation = rec;
      const dateLabel = signal.dates?.length ? signal.dates.map(formatShortDate).join(', ') : 'No date detected';
      const rateLabel = signal.rate ? `$${signal.rate}/day detected` : 'No day rate detected';
      const workDetails = [signal.role, signal.venue, signal.callTime].filter(Boolean).join(' · ');
      const intelligenceLabel = signal.aiConfidence ? `AI ${Math.round(signal.aiConfidence * 100)}%` : 'Local parser';
      const canSend = Boolean(signal.email);
      return `
        <article class="signal-card" data-signal-id="${escapeHtml(signal.id)}">
          <div class="signal-top">
            <div>
              <h3>${escapeHtml(signal.subject)}</h3>
              <div class="signal-meta">${escapeHtml(signal.from || 'Unknown sender')} · ${escapeHtml(dateLabel)} · ${escapeHtml(rateLabel)}${workDetails ? ` · ${escapeHtml(workDetails)}` : ''} · ${escapeHtml(intelligenceLabel)}</div>
            </div>
            <span class="pill">${escapeHtml(signal.kind.replace(/_/g, ' '))}</span>
          </div>
          <p class="signal-summary">${escapeHtml(signal.snippet)}</p>
          <span class="recommendation ${rec.tone}">${escapeHtml(rec.label)}</span>
          <label>
            Agent draft
            <textarea class="reply-box" data-reply-draft>${escapeHtml(signal.replyDraft || buildReply(signal))}</textarea>
          </label>
          <div class="signal-actions">
            ${signal.dates?.length ? `<button class="button compact" type="button" data-action="confirm-schedule">${signal.confirmed ? 'On my schedule' : 'Use as schedule'}</button>` : ''}
            <button class="button compact" type="button" data-action="send-reply" ${canSend ? '' : 'disabled'}>Send reply</button>
            <button class="button compact" type="button" data-action="dismiss-signal">Dismiss</button>
          </div>
        </article>
      `;
    }).join('');
    saveState();
  }

  async function sendGmail({ to, subject, text, threadId = '', inReplyTo = '', references = '', attachment = null }) {
    const connection = await ensureFreshOAuth('mail');
    if (!connection?.accessToken) throw new Error('Connect Gmail first.');
    const response = await fetch('/api/oauth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sendMail',
        accessToken: connection.accessToken,
        to,
        subject,
        text,
        threadId,
        inReplyTo,
        references,
        attachment,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to send email.');
    return payload;
  }

  async function handleSignalAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('[data-signal-id]');
    if (!card) return;
    const signal = state.mailSignals.find(item => item.id === card.dataset.signalId);
    if (!signal) return;
    const action = button.dataset.action;

    if (action === 'dismiss-signal') {
      signal.dismissed = true;
      saveState();
      renderMailSignals();
      renderAvailability();
      addActivity(`Dismissed inbox suggestion: ${signal.subject}`);
      return;
    }

    if (action === 'confirm-schedule') {
      signal.confirmed = true;
      saveState();
      renderMailSignals();
      renderAvailability();
      addActivity(`Confirmed work dates from email: ${signal.subject}`);
      return;
    }

    if (action === 'send-reply') {
      const draft = card.querySelector('[data-reply-draft]')?.value.trim() || '';
      if (!draft || !signal.email) return;
      signal.replyDraft = draft;
      saveState();
      button.disabled = true;
      button.textContent = 'Sending…';
      try {
        await sendGmail({
          to: signal.email,
          subject: /^re:/i.test(signal.subject) ? signal.subject : `Re: ${signal.subject}`,
          text: draft,
          threadId: signal.threadId,
          inReplyTo: signal.messageIdHeader,
          references: signal.references || signal.messageIdHeader,
        });
        button.textContent = 'Sent';
        addActivity(`Sent Gmail reply to ${signal.email} about “${signal.subject}”.`);
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Send reply';
        window.alert(error.message || 'Unable to send reply.');
        addActivity(`Email send failed for ${signal.email}: ${error.message || 'unknown error'}`);
      }
    }
  }

  function loadProfile() {
    const profile = state.profile;
    $('name').value = profile.name || '';
    $('market').value = profile.market || '';
    $('roles').value = profile.roles || '';
    $('headline').value = profile.headline || '';
    $('experience').value = profile.experience || '';
    $('skills').value = profile.skills || '';
    $('notes').value = profile.notes || '';
  }

  function saveProfile() {
    state.profile = {
      name: $('name').value.trim(),
      market: $('market').value.trim(),
      roles: $('roles').value.trim(),
      headline: $('headline').value.trim(),
      experience: $('experience').value.trim(),
      skills: $('skills').value.trim(),
      notes: $('notes').value.trim(),
      updatedAt: Date.now(),
    };
    saveState();
    setStatus('profile-status', 'Profile saved on this device.');
    addActivity('Worker profile updated.');
  }

  function resumeLines() {
    const profile = state.profile;
    const experience = String(profile.experience || '').split('\n').map(line => line.trim()).filter(Boolean);
    const skills = String(profile.skills || '').split(/\n|,/).map(line => line.trim()).filter(Boolean);
    const lines = [];
    lines.push(profile.name || 'Your Name');
    lines.push([profile.roles, profile.market].filter(Boolean).join(' · '));
    if (profile.headline) lines.push('', profile.headline);
    if (experience.length) {
      lines.push('', 'EXPERIENCE');
      experience.forEach(item => lines.push(`• ${item}`));
    }
    if (skills.length) {
      lines.push('', 'SKILLS / SYSTEMS');
      skills.forEach(item => lines.push(`• ${item}`));
    }
    return lines.filter((line, index, all) => line || (index > 0 && all[index - 1] !== '')).join('\n').trim();
  }

  function renderResume() {
    const profile = state.profile;
    const experience = String(profile.experience || '').split('\n').map(line => line.trim()).filter(Boolean);
    const skills = String(profile.skills || '').split(/\n|,/).map(line => line.trim()).filter(Boolean);
    const preview = $('resume-preview');
    preview.hidden = false;
    preview.innerHTML = `
      <h3>${escapeHtml(profile.name || 'Your Name')}</h3>
      <p><strong>${escapeHtml(profile.roles || 'AV Professional')}</strong>${profile.market ? ` · ${escapeHtml(profile.market)}` : ''}</p>
      ${profile.headline ? `<p>${escapeHtml(profile.headline)}</p>` : ''}
      ${experience.length ? `<h4>Experience</h4><ul>${experience.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      ${skills.length ? `<h4>Skills / systems</h4><p>${skills.map(escapeHtml).join(' · ')}</p>` : ''}
    `;
    setStatus('profile-status', 'Resume draft built from your saved profile.');
  }

  function downloadResume() {
    const content = resumeLines();
    if (!content) {
      setStatus('profile-status', 'Add profile details first.');
      return;
    }
    const blob = new Blob([`${content}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(state.profile.name || 'av-freelancer').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-resume.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    addActivity('Resume text downloaded.');
  }

  function loadRules() {
    const rules = state.rules;
    $('target-rate').value = rules.targetRate || '';
    $('minimum-rate').value = rules.minimumRate || '';
    $('day-length').value = rules.dayLength || '';
    $('overtime-rate').value = rules.overtimeRate || '';
    $('travel-radius').value = rules.travelRadius || '';
    $('response-style').value = rules.responseStyle || 'warm';
    $('standing-instructions').value = rules.standingInstructions || '';
  }

  function saveRules() {
    const minimumRate = Math.max(0, Number($('minimum-rate').value) || 0);
    const targetRate = Math.max(minimumRate, Number($('target-rate').value) || minimumRate);
    state.rules = {
      targetRate,
      minimumRate,
      dayLength: Math.min(24, Math.max(1, Number($('day-length').value) || 10)),
      overtimeRate: Math.min(3, Math.max(1, Number($('overtime-rate').value) || 1.5)),
      travelRadius: Math.max(0, Number($('travel-radius').value) || 0),
      responseStyle: $('response-style').value,
      standingInstructions: $('standing-instructions').value.trim(),
      updatedAt: Date.now(),
    };
    saveState();
    state.mailSignals.forEach(signal => {
      signal.recommendation = recommendationFor(signal);
      if (!signal.confirmed) signal.replyDraft = buildReply(signal);
    });
    saveState();
    renderMailSignals();
    setStatus('rules-status', 'Rules saved. New recommendations now use these boundaries.');
    addActivity('Rate and booking rules updated.');
  }

  function outreachDraft(company) {
    const profile = state.profile;
    const rate = Number(state.rules.targetRate) || 0;
    const role = profile.roles || 'AV technician';
    const market = profile.market || 'my market';
    const name = profile.name || '—';
    if (company.relationship === 'warm') {
      return `Hi ${company.name} team — I’m opening up more freelance availability for ${role} work around ${market}. I’d be glad to work together again. My current day rate is $${rate}. If you have upcoming calls, feel free to send dates and show details.\n\nThanks,\n${name}`;
    }
    if (company.relationship === 'referred') {
      return `Hi ${company.name} team — I was referred your way and wanted to introduce myself. I’m a freelance ${role} based around ${market}. My current day rate is $${rate}. I’d be happy to send availability and a resume for your technician pool.\n\nThanks,\n${name}`;
    }
    return `Hi ${company.name} team — I’m a freelance ${role} based around ${market} and I’d like to be considered for your technician pool. My current day rate is $${rate}. If useful, I can send current availability and a resume.\n\nThanks,\n${name}`;
  }

  function renderCompanies() {
    const container = $('company-list');
    if (!state.companies.length) {
      container.innerHTML = '<div class="empty">Add a production company to start a small, intentional call list.</div>';
      return;
    }
    container.innerHTML = state.companies.map(company => `
      <article class="company-card" data-company-id="${escapeHtml(company.id)}">
        <div class="company-top">
          <div><h3>${escapeHtml(company.name)}</h3><div class="company-meta">${escapeHtml(company.email)} · ${escapeHtml(company.relationship)}</div></div>
          <span class="pill">Explicit send</span>
        </div>
        <label>Outreach draft<textarea data-company-draft>${escapeHtml(company.draft || outreachDraft(company))}</textarea></label>
        <div class="company-actions">
          <button class="button compact" type="button" data-company-action="refresh">Refresh draft</button>
          <button class="button compact" type="button" data-company-action="send">Send resume + outreach</button>
          <button class="button compact" type="button" data-company-action="remove">Remove</button>
        </div>
      </article>
    `).join('');
  }

  async function handleCompanyAction(event) {
    const button = event.target.closest('button[data-company-action]');
    if (!button) return;
    const card = button.closest('[data-company-id]');
    const company = state.companies.find(item => item.id === card?.dataset.companyId);
    if (!company) return;
    const action = button.dataset.companyAction;
    const textarea = card.querySelector('[data-company-draft]');

    if (action === 'remove') {
      state.companies = state.companies.filter(item => item.id !== company.id);
      saveState();
      renderCompanies();
      addActivity(`Removed ${company.name} from the call list.`);
      return;
    }
    if (action === 'refresh') {
      company.draft = outreachDraft(company);
      textarea.value = company.draft;
      saveState();
      addActivity(`Refreshed outreach draft for ${company.name}.`);
      return;
    }
    if (action === 'send') {
      const draft = textarea.value.trim();
      if (!draft) return;
      if (!oauthConnected('mail')) {
        window.alert('Connect Gmail before sending outreach.');
        return;
      }
      const resume = resumeLines();
      if (!state.profile.name || !state.profile.roles || !resume) {
        window.alert('Add your name and primary roles in Profile + resume before sending.');
        return;
      }
      company.draft = draft;
      saveState();
      button.disabled = true;
      button.textContent = 'Sending…';
      try {
        const resumeFilename = `${state.profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'av-freelancer'}-resume.txt`;
        await sendGmail({
          to: company.email,
          subject: `Freelance AV availability — ${state.profile.name || 'AV technician'}`,
          text: draft,
          attachment: {
            filename: resumeFilename,
            contentType: 'text/plain; charset=UTF-8',
            content: resume,
          },
        });
        button.textContent = 'Sent';
        company.lastSentAt = Date.now();
        saveState();
        addActivity(`Sent explicit outreach to ${company.name} at ${company.email}.`);
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Send resume + outreach';
        window.alert(error.message || 'Unable to send outreach.');
        addActivity(`Outreach send failed for ${company.name}: ${error.message || 'unknown error'}`);
      }
    }
  }

  function renderActivity() {
    const container = $('activity-list');
    if (!state.activity.length) {
      container.innerHTML = '<div class="empty">No agent activity yet.</div>';
      return;
    }
    container.innerHTML = state.activity.slice(0, 30).map(item => `
      <div class="activity-item"><time datetime="${new Date(item.at).toISOString()}">${escapeHtml(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.at)))}</time>${escapeHtml(item.text)}</div>
    `).join('');
  }

  function importPortalSchedule() {
    const raw = $('portal-schedule-text').value.trim();
    if (!raw) {
      setStatus('portal-import-status', 'Paste schedule text first.');
      return;
    }
    const existing = new Set(state.calendarEvents.map(item => `${item.source}:${item.date}:${item.title}`));
    let added = 0;
    raw.split(/\n+/).map(line => line.trim()).filter(Boolean).forEach(line => {
      if (/\b(?:off|day off|vacation|pto)\b/i.test(line)) return;
      extractDates(line).forEach(key => {
        const signature = `portal-import:${key}:${line}`;
        if (existing.has(signature)) return;
        existing.add(signature);
        state.calendarEvents.push({
          id: uniqueId('portal'),
          date: key,
          title: line.slice(0, 160),
          source: 'portal-import',
        });
        added += 1;
      });
    });
    saveState();
    renderAvailability();
    setStatus('portal-import-status', added
      ? `Imported ${added} scheduled date${added === 1 ? '' : 's'}. Lines marked OFF were left available.`
      : 'No recognizable scheduled dates were found.');
    if (added) addActivity(`Imported ${added} date${added === 1 ? '' : 's'} from pasted work-portal schedule text.`);
  }

  async function syncAll() {
    const button = $('sync-all');
    button.disabled = true;
    button.textContent = 'Syncing…';
    try {
      if (oauthConnected('calendar')) await syncCalendar();
      if (oauthConnected('mail')) await scanMail();
      if (!oauthConnected('calendar') && !oauthConnected('mail')) {
        addActivity('Sync requested, but no schedule or mail connection is configured yet.');
      }
    } finally {
      button.disabled = false;
      button.textContent = 'Sync my work';
    }
  }

  $('connect-mail').addEventListener('click', () => beginOAuth('mail'));
  $('connect-calendar').addEventListener('click', () => beginOAuth('calendar'));
  $('sync-calendar').addEventListener('click', syncCalendar);
  $('scan-mail').addEventListener('click', scanMail);
  $('sync-all').addEventListener('click', syncAll);
  $('mail-signals').addEventListener('click', handleSignalAction);
  $('company-list').addEventListener('click', handleCompanyAction);
  $('import-portal-schedule').addEventListener('click', importPortalSchedule);

  $('day-off-form').addEventListener('submit', event => {
    event.preventDefault();
    const date = $('day-off-date').value;
    if (!date) return;
    state.daysOff = state.daysOff.filter(item => item.date !== date);
    state.daysOff.push({ date, note: $('day-off-note').value.trim() });
    state.daysOff.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    renderAvailability();
    addActivity(`Protected ${formatLongDate(date)} as time off.`);
    $('day-off-form').reset();
  });

  $('availability-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-day-off]');
    if (!button) return;
    const key = button.dataset.removeDayOff;
    state.daysOff = state.daysOff.filter(item => item.date !== key);
    saveState();
    renderAvailability();
    addActivity(`Made ${formatLongDate(key)} available again.`);
  });

  $('profile-form').addEventListener('submit', event => {
    event.preventDefault();
    saveProfile();
  });
  $('generate-resume').addEventListener('click', () => {
    saveProfile();
    renderResume();
    addActivity('Generated a resume draft from the worker profile.');
  });
  $('download-resume').addEventListener('click', () => {
    saveProfile();
    downloadResume();
  });

  $('rules-form').addEventListener('submit', event => {
    event.preventDefault();
    saveRules();
  });

  $('company-form').addEventListener('submit', event => {
    event.preventDefault();
    const company = {
      id: uniqueId('company'),
      name: $('company-name').value.trim(),
      email: $('company-email').value.trim().toLowerCase(),
      relationship: $('company-relationship').value,
      draft: '',
      createdAt: Date.now(),
    };
    if (!company.name || !company.email) return;
    company.draft = outreachDraft(company);
    state.companies.push(company);
    saveState();
    renderCompanies();
    addActivity(`Added ${company.name} to the freelance call list.`);
    $('company-form').reset();
  });

  $('clear-activity').addEventListener('click', () => {
    state.activity = [];
    saveState();
    renderActivity();
  });

  consumeOAuthResult();
  loadProfile();
  loadRules();
  renderConnections();
  renderAvailability();
  renderMailSignals();
  renderCompanies();
  renderActivity();
})();
