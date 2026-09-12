const $ = (id) => document.getElementById(id);
let currentPlan = null;
let currentView = 'shared';

function text(id, value = '') {
  const el = $(id);
  if (el) el.textContent = value;
}

function detailFor(item = {}) {
  if (currentView === 'shared') return item.sharedDetail || item.detail || '';
  return item.detail || item.sharedDetail || '';
}

function renderCards(targetId, items = []) {
  const target = $(targetId);
  target.replaceChildren(...items.map((item) => {
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
  }));
}

function renderMilestones(items = []) {
  const target = $('milestones');
  target.replaceChildren(...items.map((item) => {
    const article = document.createElement('article');
    const strong = document.createElement('strong');
    const span = document.createElement('span');
    strong.textContent = item.target || '';
    span.textContent = item.label || '';
    article.append(strong, span);
    return article;
  }));
}

function renderSharedFocus(focus = {}) {
  text('shared-focus-title', focus.title);
  text('shared-focus-when', focus.when);
  text('shared-focus-detail', focus.detail);
  const list = $('shared-focus-list');
  list.replaceChildren(...(focus.checklist || []).map((label) => {
    const li = document.createElement('li');
    li.textContent = label;
    return li;
  }));
}

function renderPlan() {
  const plan = currentPlan;
  if (!plan) return;
  text('theme', plan.theme);
  text('north-star', currentView === 'shared' ? plan.northStar : (plan.workNorthStar || plan.northStar));
  text('updated', `Updated ${plan.updatedLabel}`);
  text('horizon', plan.horizon);
  text('now-window', plan.now?.window);
  text('operating-rule', currentView === 'shared' ? plan.operatingRule : (plan.workOperatingRule || plan.operatingRule));
  text('next-work', plan.highlights?.nextWork);
  text('house-window', plan.highlights?.houseWindow);
  text('open-day', plan.highlights?.openDay);
  renderSharedFocus(plan.sharedFocus);
  renderCards('now-list', plan.now?.items);
  renderCards('month-list', plan.next30);
  renderCards('quarter-list', plan.next90);
  renderMilestones(plan.milestones);
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

document.querySelectorAll('.view-button').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

async function loadPlan() {
  const response = await fetch('./plan.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Plan request failed: ${response.status}`);
  currentPlan = await response.json();
  renderPlan();
}

loadPlan().catch((error) => {
  text('theme', 'Plan unavailable');
  text('north-star', 'Operator can rebuild our shared plan from current calendar, family, home, work, and project state.');
  console.error(error);
});
