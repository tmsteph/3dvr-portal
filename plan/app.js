const $ = (id) => document.getElementById(id);

function text(id, value = '') {
  const el = $(id);
  if (el) el.textContent = value;
}

function renderCards(targetId, items = []) {
  const target = $(targetId);
  target.replaceChildren(...items.map((item) => {
    const article = document.createElement('article');
    const strong = document.createElement('strong');
    const span = document.createElement('span');
    const p = document.createElement('p');
    strong.textContent = item.title || '';
    span.textContent = item.when || item.label || '';
    p.textContent = item.detail || '';
    article.append(strong);
    if (span.textContent) article.append(span);
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

async function loadPlan() {
  const response = await fetch('./plan.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Plan request failed: ${response.status}`);
  const plan = await response.json();

  text('theme', plan.theme);
  text('north-star', plan.northStar);
  text('updated', `Updated ${plan.updatedLabel}`);
  text('horizon', plan.horizon);
  text('now-window', plan.now?.window);
  text('operating-rule', plan.operatingRule);
  renderCards('now-list', plan.now?.items);
  renderCards('month-list', plan.next30);
  renderCards('quarter-list', plan.next90);
  renderMilestones(plan.milestones);
}

loadPlan().catch((error) => {
  text('theme', 'Plan unavailable');
  text('north-star', 'Operator can rebuild the living plan from current calendar, revenue, and project state.');
  console.error(error);
});
