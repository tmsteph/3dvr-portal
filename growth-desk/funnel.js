import { createSignedPortalProof } from '/operator/forge.js';

const $ = selector => document.querySelector(selector);
window.AuthIdentity?.syncStorageFromSharedIdentity?.(window.localStorage);
const stages = ['discovered', 'qualified', 'contacted', 'replied', 'diagnostic-paid', 'proposal', 'project-paid', 'accepted', 'support', 'lost', 'deferred', 'do-not-contact'];
let records = [];
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function message(value, error = false) { $('#status').textContent = value; $('#status').className = 'status' + (error ? ' error' : ''); }
async function api(action, data = {}) {
  const requestId = crypto.randomUUID();
  const proof = await createSignedPortalProof('automation-funnel', action, { requestId, data: JSON.stringify(data) });
  if (!proof) {
    const error = new Error(window.localStorage.getItem('signedIn') === 'true'
      ? 'You are signed in, but the secure account connection is unavailable. Retry here, or reconnect your account and return to this pipeline.'
      : 'Sign in to open your private pipeline. You will return here afterward.');
    error.loginNeeded = true;
    throw error;
  }
  const { authPub, authProof } = proof;
  const response = await fetch('/api/automation-funnel', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data, requestId, authPub, authProof: typeof authProof === 'string' ? authProof : JSON.stringify(authProof) }), signal: AbortSignal.timeout(25000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Pipeline request failed.');
  return result;
}
const options = (values, current) => values.map(([value, label]) => '<option value="' + safe(value) + '"' + (current === value ? ' selected' : '') + '>' + safe(label) + '</option>').join('');
function render() {
  const today = new Date().toISOString().slice(0, 10);
  const active = records.filter(r => !['lost', 'do-not-contact', 'deferred', 'accepted', 'support'].includes(r.stage));
  const revenue = records.reduce((sum, r) => sum + r.revenue, 0);
  const hours = records.reduce((sum, r) => sum + r.hours, 0);
  $('#metrics').innerHTML = [['Leads', records.length], ['Qualified', records.filter(r => r.qualified).length], ['Follow-ups due', active.filter(r => r.nextDate && r.nextDate <= today).length], ['Recorded revenue', '$' + revenue.toFixed(0)]].map(([label, n]) => '<div class="metric"><strong>' + safe(n) + '</strong><span>' + safe(label) + '</span></div>').join('');
  const query = $('#search').value.toLowerCase();
  const filter = $('#filter').value;
  const rows = records.filter(r => JSON.stringify(r).toLowerCase().includes(query))
    .filter(r => filter === 'all' || (filter === 'ready' && r.qualified) || (filter === 'inbound' && r.origin === 'inbound') || (filter === 'due' && active.includes(r) && r.nextDate && r.nextDate <= today))
    .sort((a, b) => b.score - a.score);
  $('#leads').innerHTML = rows.length ? rows.map(r => `
    <article class="panel lead" data-id="${safe(r.id)}">
      <h2>${safe(r.business)}</h2>
      <div class="meta"><span>${safe(r.stage)}</span><span>${r.score}/10 · ${safe(r.priority)}</span><span>${safe(r.origin)}</span><span>${safe(r.nextDate ? 'Next: ' + r.nextDate : 'Set a next action')}</span></div>
      <p>${safe(r.problem)}</p>
      <p class="small">${safe(r.evidence || 'No supporting evidence recorded.')}</p>
      ${/^https?:\/\//.test(r.sourceUrl) ? '<a href="' + safe(r.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Read buyer request</a>' : ''}
      <details><summary>Qualify and track</summary>
        <form class="edit">
          <div class="grid"><label>Buyer<input name="name" value="${safe(r.name)}"></label><label>Email<input type="email" name="email" value="${safe(r.email)}"></label></div>
          <label>Tools / existing work<input name="stack" value="${safe(r.stack)}"></label>
          <label>Business impact<textarea name="impact">${safe(r.impact)}</textarea></label>
          <div class="grid">
            <label>Buying intent<select name="intent">${options([['unknown','Unknown'],['partial','Possible buyer'],['explicit','Explicit request for paid help']],r.intent)}</select></label>
            <label>Approved budget<select name="budget">${options([['undecided','Unknown / undecided'],['under-200','Under $200'],['200-599','$200–$599'],['600-1499','$600–$1,499'],['1500-plus','$1,500+']],r.budget)}</select></label>
            <label>Authority<select name="authority">${options([['no','Not confirmed'],['involved','Involved in decision'],['yes','Budget approver']],r.authority)}</select></label>
            <label>Start date<select name="timeline">${options([['undecided','Unknown'],['this-month','This month'],['later','Later']],r.timeline)}</select></label>
            <label>Stage<select name="stage">${options(stages.map(s=>[s,s.replaceAll('-',' ')]),r.stage)}</select></label>
            <label>Next follow-up<input type="date" name="nextDate" value="${safe(r.nextDate)}"></label>
          </div>
          <label>Next action<input name="nextAction" value="${safe(r.nextAction)}"></label>
          <label>Evidence and scope notes<textarea name="notes">${safe(r.notes)}</textarea></label>
          <div class="grid"><label>Verified payment reference<input name="paymentReference" value="${safe(r.paymentReference)}"></label><label>Revenue received ($)<input name="revenue" type="number" min="0" step=".01" value="${r.revenue}"></label><label>Total acquisition / delivery hours<input name="hours" type="number" min="0" step=".25" value="${r.hours}"></label></div>
          <button>Save lead</button>
        </form>
      </details>
      <button class="secondary draft-button" type="button">Prepare reply</button>
      <div class="draft" hidden></div>
    </article>`).join('') : '<p>No leads match. Collect hiring requests or share the public intake page.</p>';
  if (hours) $('#metrics').insertAdjacentHTML('beforeend', '<div class="metric"><strong>$' + (revenue / hours).toFixed(0) + '/hr</strong><span>Recorded revenue ÷ recorded hours</span></div>');
}
async function load() {
  const result = await api('list');
  records = result.leads;
  $('#workspace').hidden = false;
  $('#signin').hidden = true;
  $('#recovery').hidden = true;
  render();
  message('Pipeline loaded. Changes are saved to the server.');
}
let loading = false;
async function run(action) {
  if (loading) return;
  loading = true;
  $('#retry').disabled = true;
  try { await action(); }
  catch (error) {
    message(error.message, true);
    $('#recovery').hidden = false;
    $('#signin').hidden = !error.loginNeeded;
    $('#signin').textContent = window.localStorage.getItem('signedIn') === 'true' ? 'Reconnect your account' : 'Sign in and return here';
  } finally {
    loading = false;
    $('#retry').disabled = false;
  }
}
$('#retry').onclick = () => { message('Reconnecting your secure account…'); run(load); };
$('#refresh').onclick = () => run(load);
$('#search').oninput = render;
$('#filter').onchange = render;
$('#discover').onclick = () => run(async () => {
  $('#discover').disabled = true;
  message('Checking recent public hiring requests…');
  try { const r = await api('discover'); await load(); message('Added ' + r.added + ' buyer requests for review. Budget and authority need verification.'); }
  finally { $('#discover').disabled = false; }
});
$('#create').onsubmit = event => {
  event.preventDefault();
  run(async () => { await api('create', Object.fromEntries(new FormData(event.target))); event.target.reset(); await load(); });
};
$('#leads').addEventListener('submit', event => {
  if (!event.target.matches('.edit')) return;
  event.preventDefault();
  const id = event.target.closest('[data-id]').dataset.id;
  const record = records.find(r => r.id === id);
  const lead = Object.fromEntries(new FormData(event.target));
  run(async () => { await api('update', { id, version: record.version, lead }); await load(); message('Saved.'); });
});
$('#leads').addEventListener('click', event => {
  if (!event.target.matches('.draft-button')) return;
  const card = event.target.closest('[data-id]');
  run(async () => { const result = await api('draft', { id: card.dataset.id }); const node = card.querySelector('.draft'); node.hidden = false; node.textContent = result.draft.subject + '\n\n' + result.draft.body; message('Reply prepared for review.'); });
});
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), leads: records }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = '3dvr-automation-pipeline.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
run(load);
