const $ = (id) => document.getElementById(id);
let currentPlan = null;
let currentView = 'shared';
let currentHorizon = 'week';
const PLAN_TIME_ZONE = 'America/Los_Angeles';

function dateIdInPlanTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PLAN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function dayLabelForDate(dateId) {
  if (!dateId) return '';
  const date = new Date(`${dateId}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date).replace(',', ' ·');
}

function rollingCalendar(items = []) {
  const todayId = dateIdInPlanTimeZone();
  const todayIndex = items.findIndex((item) => item.date === todayId);
  if (todayIndex >= 0) return items.slice(todayIndex);
  return items.filter((item) => !item.date || item.date >= todayId);
}

function resolvedToday(plan = {}) {
  const todayId = dateIdInPlanTimeZone();
  if (plan.today?.date === todayId) return plan.today;

  const calendarToday = (plan.calendar || []).find((item) => item.date === todayId);
  if (calendarToday) {
    return {
      ...calendarToday,
      dayLabel: dayLabelForDate(todayId),
      sharedDetail: calendarToday.sharedDetail || calendarToday.detail || '',
      detail: calendarToday.detail || calendarToday.sharedDetail || '',
    };
  }

  return {
    date: todayId,
    dayLabel: dayLabelForDate(todayId),
    title: 'Open day',
    when: 'No plan entry yet',
    category: 'open',
    categoryLabel: 'Open',
    sharedDetail: '',
    detail: '',
  };
}

function text(id, value = '') {
  const el = $(id);
  if (el) el.textContent = value;
}

function detailFor(item = {}) {
  return currentView === 'shared'
    ? (item.sharedDetail || item.detail || '')
    : (item.detail || item.sharedDetail || '');
}

function makeCard(item = {}) {
  const article = document.createElement('article');
  article.dataset.category = item.category || 'plan';
  const top = document.createElement('div');
  top.className = 'card-top';
  const strong = document.createElement('strong');
  strong.textContent = item.title || '';
  const badge = document.createElement('span');
  badge.className = 'category';
  badge.textContent = item.categoryLabel || item.category || '';
  top.append(strong);
  if (badge.textContent) top.append(badge);
  const when = document.createElement('span');
  when.className = 'when';
  when.textContent = item.when || item.label || '';
  const p = document.createElement('p');
  p.textContent = detailFor(item);
  article.append(top);
  if (when.textContent) article.append(when);
  if (p.textContent) article.append(p);
  return article;
}

function renderCards(targetId, items = []) {
  const target = $(targetId);
  target.replaceChildren(...items.map(makeCard));
}

function renderMarkers(items = []) {
  const target = $('marker-list');
  target.replaceChildren(...items.map((item) => {
    const span = document.createElement('span');
    span.className = `ticker-item ticker-item--${item.tone || 'default'}`;
    const label = document.createElement('strong');
    const when = document.createElement('span');
    label.textContent = item.label || '';
    when.textContent = item.when || '';
    span.append(label, when);
    return span;
  }));
}

function renderToday(today = {}) {
  text('today-date', today.dayLabel || today.dateLabel || '');
  text('today-title', today.title || 'Open day');
  text('today-when', today.when || '');
  text('today-detail', detailFor(today));
  text('today-category', today.categoryLabel || today.category || '');
  const card = document.querySelector('.today-card');
  if (card) card.dataset.category = today.category || 'plan';
}

function renderOverview(items = []) {
  const target = $('overview-list');
  const count = currentHorizon === 'week' ? 7 : 15;
  target.replaceChildren(...items.slice(0, count).map((item, index) => {
    const row = document.createElement('article');
    row.className = 'calendar-row';
    row.dataset.category = item.category || 'plan';
    if (item.date === dateIdInPlanTimeZone()) row.classList.add('is-today');
    const date = document.createElement('div');
    date.className = 'calendar-date';
    const day = document.createElement('strong');
    const short = document.createElement('span');
    day.textContent = item.dayShort || '';
    short.textContent = item.dateShort || '';
    date.append(day, short);
    const body = document.createElement('div');
    body.className = 'calendar-body';
    const top = document.createElement('div');
    top.className = 'card-top';
    const title = document.createElement('strong');
    title.textContent = item.title || '';
    const badge = document.createElement('span');
    badge.className = 'category';
    badge.textContent = item.categoryLabel || item.category || '';
    top.append(title);
    if (badge.textContent) top.append(badge);
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = item.when || '';
    body.append(top);
    if (when.textContent) body.append(when);
    row.append(date, body);
    return row;
  }));
}

function renderPlan() {
  if (!currentPlan) return;
  const plan = currentPlan;
  renderMarkers(plan.markers || []);
  const calendar = rollingCalendar(plan.calendar || []);
  renderToday(resolvedToday(plan));
  renderCards('next-days-list', calendar.slice(1, 4));
  renderOverview(calendar);
  renderCards('month-list', plan.next30 || []);
  renderCards('quarter-list', plan.next90 || []);
  text('operating-rule', currentView === 'shared' ? plan.operatingRule : (plan.workOperatingRule || plan.operatingRule));
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('.view-button').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.body.dataset.view = view;
  renderPlan();
}

function setHorizon(horizon) {
  currentHorizon = horizon;
  document.querySelectorAll('.horizon-button').forEach((button) => {
    const active = button.dataset.horizon === horizon;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  renderOverview(rollingCalendar(currentPlan?.calendar || []));
}

document.querySelectorAll('.view-button').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

document.querySelectorAll('.horizon-button').forEach((button) => {
  button.addEventListener('click', () => setHorizon(button.dataset.horizon));
});

async function loadPlan() {
  const response = await fetch('./plan.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Plan request failed: ${response.status}`);
  currentPlan = await response.json();
  renderPlan();
}

loadPlan().catch((error) => {
  text('today-title', 'Plan unavailable');
  text('today-detail', 'Operator can rebuild our shared plan from current calendar, family, home, work, and project state.');
  console.error(error);
});
