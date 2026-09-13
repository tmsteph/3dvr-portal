const registry = document.querySelector('#registry');
const summary = document.querySelector('#summary');
const search = document.querySelector('#search');
const filters = document.querySelector('#filters');
const empty = document.querySelector('#empty');
let data = null;
let active = 'all';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function runbook(capability) {
  const rows = [
    capability.operatorRule ? ['Agent rule', capability.operatorRule] : null,
    capability.healthCheck ? ['Health check', capability.healthCheck] : null,
    capability.fallback ? ['Fallback / recovery', capability.fallback] : null,
  ].filter(Boolean);
  if (!rows.length) return '';
  return `<details class="runbook">
    <summary>How to use & recover</summary>
    <div class="runbook-body">${rows.map(([label, text]) => `<p><strong>${esc(label)}</strong><span>${esc(text)}</span></p>`).join('')}</div>
  </details>`;
}

function render() {
  if (!data) return;
  const query = search.value.trim().toLowerCase();
  const rows = data.capabilities.filter(capability => {
    const matchesStatus = active === 'all' || capability.status === active;
    const haystack = [
      capability.name, capability.category, capability.description, capability.permission,
      capability.access, capability.operatorRule, capability.healthCheck, capability.fallback,
    ].join(' ').toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });

  registry.innerHTML = rows.map(capability => `<article class="ability">
    <div><h2>${esc(capability.name)}</h2><div class="category">${esc(capability.category)}</div></div>
    <div>
      <p>${esc(capability.description)}</p>
      <div class="meta">
        <span class="chip ${esc(capability.status)}">${esc(data.statuses[capability.status] || capability.status)}</span>
        <span class="chip">Permission: ${esc(capability.permission)}</span>
        <span class="chip">Via: ${esc(capability.access)}</span>
        <span class="chip">Verified: ${esc(capability.verified)}</span>
      </div>
      ${runbook(capability)}
    </div>
  </article>`).join('');
  empty.hidden = rows.length > 0;
}

fetch('abilities.json', { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(payload => {
    data = payload;
    const count = status => payload.capabilities.filter(capability => capability.status === status).length;
    const runbooks = payload.capabilities.filter(capability => capability.operatorRule || capability.healthCheck || capability.fallback).length;
    summary.innerHTML = `
      <span>${count('working')} working</span>
      <span>${count('partial')} partial</span>
      <span>${count('planned')} planned</span>
      <span>${runbooks} runbooks</span>
      <span>${payload.capabilities.length} recorded</span>
      <span>Registry updated ${esc(payload.updated)}</span>`;
    render();
  })
  .catch(() => {
    registry.innerHTML = '<p>Registry data could not be loaded.</p>';
  });

search.addEventListener('input', render);
filters.addEventListener('click', event => {
  const button = event.target.closest('button[data-status]');
  if (!button) return;
  active = button.dataset.status;
  filters.querySelectorAll('button').forEach(candidate => candidate.classList.toggle('active', candidate === button));
  render();
});
