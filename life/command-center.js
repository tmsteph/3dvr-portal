(() => {
  const BUCKETS = ['today', 'next', 'waiting', 'scheduled', 'someday'];
  const LABELS = {
    today: 'Today',
    next: 'Next',
    waiting: 'Waiting On',
    scheduled: 'Scheduled',
    someday: 'Someday'
  };
  const LIFE_STORAGE_KEY = 'portal-life-checkins';
  const CRM_STORAGE_KEY = 'portal-crm-local-records-v1';
  const CALENDAR_STORAGE_KEY = 'calendar.local.events';
  const LIFE_SPACE_STORAGE_KEY = '3dvr-life-space-state';
  const BASE_STORAGE_KEY = '3dvr.command-center.v1';

  const capture = document.getElementById('commandCapture');
  const textInput = document.getElementById('commandText');
  const bucketInput = document.getElementById('commandBucket');
  const list = document.getElementById('commandItems');
  const empty = document.getElementById('commandEmpty');
  const tabs = document.getElementById('bucketTabs');
  const activeTitle = document.getElementById('activeBucketTitle');
  const focusText = document.getElementById('focusText');
  const focusDone = document.getElementById('focusDone');
  const status = document.getElementById('commandStatus');
  const title = document.getElementById('commandCenterTitle');

  if (!capture || !textInput || !bucketInput || !list || !tabs) return;

  const normalize = value => String(value || '').trim();
  const parseJson = (raw, fallback = null) => {
    try {
      const parsed = JSON.parse(raw || 'null');
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  };
  const asList = value => Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value)
      : [];

  const accountIdentity = () => {
    const signedIn = localStorage.getItem('signedIn') === 'true';
    if (!signedIn) return 'local';
    return normalize(localStorage.getItem('userPubKey'))
      || normalize(localStorage.getItem('alias'))
      || normalize(localStorage.getItem('username'))
      || 'account';
  };
  const storageKey = `${BASE_STORAGE_KEY}.${encodeURIComponent(accountIdentity().toLowerCase())}`;

  const makeId = () => globalThis.crypto?.randomUUID?.()
    || `command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const normalizeItem = item => ({
    id: normalize(item?.id) || makeId(),
    text: normalize(item?.text).slice(0, 280),
    bucket: BUCKETS.includes(item?.bucket) ? item.bucket : 'today',
    done: Boolean(item?.done),
    createdAt: normalize(item?.createdAt) || new Date().toISOString(),
    completedAt: normalize(item?.completedAt),
    sourceKey: normalize(item?.sourceKey)
  });

  const parseStore = () => {
    const parsed = parseJson(localStorage.getItem(storageKey));
    if (!parsed || typeof parsed !== 'object') return { activeBucket: 'today', items: [] };
    return {
      activeBucket: BUCKETS.includes(parsed.activeBucket) ? parsed.activeBucket : 'today',
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeItem).filter(item => item.text)
        : []
    };
  };

  let state = parseStore();

  const persist = () => {
    state.items = state.items
      .filter(item => item.text)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(-500);
    localStorage.setItem(storageKey, JSON.stringify(state));
  };

  const currentItems = bucket => state.items.filter(item => item.bucket === bucket && !item.done);
  const allOpenItems = () => BUCKETS.flatMap(bucket => currentItems(bucket));

  function importLatestDailyStep() {
    const entries = asList(parseJson(localStorage.getItem(LIFE_STORAGE_KEY), []));
    if (!entries.length) return;

    entries.sort((a, b) => String(b?.createdAt || b?.date || '').localeCompare(String(a?.createdAt || a?.date || '')));
    const latest = entries[0] || {};
    const step = normalize(latest.trueTask || latest.tomorrow);
    if (!step) return;

    const sourceKey = `life:${normalize(latest.id) || normalize(latest.createdAt) || step}`;
    if (state.items.some(item => item.sourceKey === sourceKey)) return;

    state.items.push(normalizeItem({
      id: makeId(),
      text: step,
      bucket: 'today',
      createdAt: new Date().toISOString(),
      sourceKey
    }));
    persist();
    render();
  }

  function setIdentityLabel() {
    const signedIn = localStorage.getItem('signedIn') === 'true';
    const alias = normalize(localStorage.getItem('alias'));
    const username = normalize(localStorage.getItem('username'));
    const display = username || (alias.includes('@') ? alias.split('@')[0] : alias);
    if (signedIn && display && title) title.textContent = `${display}'s Command Center`;
  }

  function setActiveBucket(bucket) {
    if (!BUCKETS.includes(bucket)) return;
    state.activeBucket = bucket;
    persist();
    render();
  }

  function finishItem(id) {
    const item = state.items.find(candidate => candidate.id === id);
    if (!item) return;
    item.done = true;
    item.completedAt = new Date().toISOString();
    persist();
    render();
  }

  function deleteItem(id) {
    state.items = state.items.filter(item => item.id !== id);
    persist();
    render();
  }

  function moveItem(id, bucket) {
    if (!BUCKETS.includes(bucket)) return;
    const item = state.items.find(candidate => candidate.id === id);
    if (!item) return;
    item.bucket = bucket;
    item.done = false;
    item.completedAt = '';
    persist();
    render();
  }

  function createItemNode(item) {
    const row = document.createElement('li');
    row.className = 'item';
    row.dataset.itemId = item.id;

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'item__done';
    done.dataset.action = 'done';
    done.title = 'Mark done';
    done.setAttribute('aria-label', `Mark ${item.text} done`);
    done.textContent = '✓';

    const text = document.createElement('span');
    text.className = 'item__text';
    text.textContent = item.text;

    const select = document.createElement('select');
    select.dataset.action = 'move';
    select.setAttribute('aria-label', `Move ${item.text}`);
    for (const bucket of BUCKETS) {
      const option = document.createElement('option');
      option.value = bucket;
      option.textContent = LABELS[bucket];
      option.selected = bucket === item.bucket;
      select.appendChild(option);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'item__delete';
    remove.dataset.action = 'delete';
    remove.title = 'Delete';
    remove.setAttribute('aria-label', `Delete ${item.text}`);
    remove.textContent = '×';

    row.append(done, text, select, remove);
    return row;
  }

  function renderFocus() {
    const focus = currentItems('today')[0]
      || currentItems('next')[0]
      || currentItems('waiting')[0]
      || null;

    if (!focus) {
      focusText.textContent = 'Add something important.';
      focusDone.hidden = true;
      focusDone.dataset.itemId = '';
      return;
    }

    focusText.textContent = focus.text;
    focusDone.hidden = false;
    focusDone.dataset.itemId = focus.id;
  }

  function renderCounts() {
    for (const bucket of BUCKETS) {
      const count = currentItems(bucket).length;
      document.querySelector(`[data-count="${bucket}"]`)?.replaceChildren(String(count));
    }
  }

  function renderTabs() {
    tabs.querySelectorAll('[data-bucket]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.bucket === state.activeBucket));
    });
  }

  function renderList() {
    list.replaceChildren();
    const items = currentItems(state.activeBucket);
    for (const item of items) list.appendChild(createItemNode(item));
    empty.hidden = items.length > 0;
    activeTitle.textContent = LABELS[state.activeBucket];
  }

  function renderStatus() {
    const completed = state.items.filter(item => item.done).length;
    const open = allOpenItems().length;
    status.textContent = completed ? `${open} open · ${completed} done` : `${open} open · private here`;
  }

  function render() {
    renderCounts();
    renderTabs();
    renderList();
    renderFocus();
    renderStatus();
  }

  function eventStart(event) {
    return new Date(event?.start || event?.startTime || event?.date || 0);
  }

  function nextCalendarEvent() {
    const events = asList(parseJson(localStorage.getItem(CALENDAR_STORAGE_KEY), []));
    const threshold = Date.now() - 60 * 60 * 1000;
    return events
      .map(event => ({ event, start: eventStart(event) }))
      .filter(entry => Number.isFinite(entry.start.getTime()) && entry.start.getTime() >= threshold)
      .sort((a, b) => a.start - b.start)[0] || null;
  }

  function crmSignal() {
    const records = asList(parseJson(localStorage.getItem(CRM_STORAGE_KEY), []));
    const actionable = records.filter(record => normalize(record?.nextBestAction || record?.nextExperiment));
    const top = actionable[0] || records[0] || null;
    return { count: records.length, actionable: actionable.length, top };
  }

  function lifeSpaceCount() {
    const stateValue = parseJson(localStorage.getItem(LIFE_SPACE_STORAGE_KEY));
    const spaces = Array.isArray(stateValue?.spaces) ? stateValue.spaces : [];
    return spaces.reduce((count, space) => count + (Array.isArray(space?.items) ? space.items.length : 0), 0);
  }

  function makeFeedCard(href, label, value, detail) {
    const card = document.createElement('a');
    card.className = 'command-feed';
    card.href = href;

    const small = document.createElement('small');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    const span = document.createElement('span');
    span.textContent = detail;
    card.append(small, strong, span);
    return card;
  }

  function renderConnectedFeeds() {
    const sources = document.querySelector('.sources');
    if (!sources || document.querySelector('.command-feeds')) return;

    const style = document.createElement('style');
    style.textContent = `
      .command-feeds { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
      .command-feed { min-width:0; padding:11px; display:grid; gap:3px; border:1px solid var(--line); border-radius:13px; background:rgba(255,255,255,.035); text-decoration:none; }
      .command-feed small { color:var(--muted); font-weight:850; }
      .command-feed strong { overflow-wrap:anywhere; line-height:1.25; }
      .command-feed span { color:var(--muted); font-size:.8rem; line-height:1.3; }
      @media (max-width:700px) { .command-feeds { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);

    const feeds = document.createElement('div');
    feeds.className = 'command-feeds';

    const next = nextCalendarEvent();
    const calendarTitle = next ? normalize(next.event?.title || next.event?.summary) || 'Upcoming event' : 'No local event';
    const calendarDetail = next
      ? new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(next.start)
      : 'Open Calendar to sync or add one.';
    feeds.appendChild(makeFeedCard('../calendar/', 'Calendar', calendarTitle, calendarDetail));

    const crm = crmSignal();
    const crmAction = normalize(crm.top?.nextBestAction || crm.top?.nextExperiment || crm.top?.name || crm.top?.company || crm.top?.business);
    feeds.appendChild(makeFeedCard('../crm/', 'CRM', crmAction || 'No local signal', `${crm.actionable} actionable · ${crm.count} records`));

    const projectCount = lifeSpaceCount();
    feeds.appendChild(makeFeedCard('../life-space/', 'Projects', projectCount ? `${projectCount} saved items` : 'No local items', 'Life Space'));

    sources.insertAdjacentElement('beforebegin', feeds);
  }

  capture.addEventListener('submit', event => {
    event.preventDefault();
    const text = normalize(textInput.value);
    const bucket = BUCKETS.includes(bucketInput.value) ? bucketInput.value : 'today';
    if (!text) return;

    state.items.push(normalizeItem({ id: makeId(), text, bucket, createdAt: new Date().toISOString() }));
    state.activeBucket = bucket;
    textInput.value = '';
    persist();
    render();
    textInput.focus();
  });

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-bucket]');
    if (button) setActiveBucket(button.dataset.bucket);
  });

  list.addEventListener('click', event => {
    const row = event.target.closest('[data-item-id]');
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!row || !action) return;
    if (action === 'done') finishItem(row.dataset.itemId);
    if (action === 'delete') deleteItem(row.dataset.itemId);
  });

  list.addEventListener('change', event => {
    const select = event.target.closest('select[data-action="move"]');
    const row = event.target.closest('[data-item-id]');
    if (select && row) moveItem(row.dataset.itemId, select.value);
  });

  focusDone.addEventListener('click', () => {
    if (focusDone.dataset.itemId) finishItem(focusDone.dataset.itemId);
  });

  const latestStep = document.getElementById('latestStep');
  if (latestStep && typeof MutationObserver === 'function') {
    new MutationObserver(importLatestDailyStep).observe(latestStep, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener('storage', event => {
    if ([CRM_STORAGE_KEY, CALENDAR_STORAGE_KEY, LIFE_SPACE_STORAGE_KEY].includes(event.key)) {
      document.querySelector('.command-feeds')?.remove();
      renderConnectedFeeds();
    }
  });

  setIdentityLabel();
  importLatestDailyStep();
  renderConnectedFeeds();
  render();
})();
