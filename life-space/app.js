import { openDatabase, loadState, saveState, saveFile, getFile, exportWorkspace, importWorkspace } from './storage.js';

const $ = selector => document.querySelector(selector);
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[c]);

const els = {
  board: $('#board'), cardLayer: $('#card-layer'), drawingLayer: $('#drawing-layer'), wrap: $('#canvas-wrap'),
  spaces: $('#space-list'), name: $('#space-name'), summary: $('#space-summary'), empty: $('#empty-board'),
  search: $('#search'), saveStatus: $('#save-status'), toast: $('#toast'), sidebar: $('#sidebar')
};

const defaultState = () => ({
  version: 1,
  activeSpaceId: 'space-home',
  spaces: [{ id:'space-home', name:'My Life', color:'#ffb66e', view:{ x:0, y:0, zoom:1 }, items:[], strokes:[] }],
  updatedAt: Date.now()
});

let db;
let state;
let drawMode = false;
let currentStroke = null;
let interaction = null;
let saveTimer;
let history = [];
let future = [];
let objectUrls = new Map();

const activeSpace = () => state.spaces.find(space => space.id === state.activeSpaceId) || state.spaces[0];
const itemById = id => activeSpace().items.find(item => item.id === id);
const snapshot = () => JSON.stringify(state);

function commitHistory(before) {
  if (!before || before === snapshot()) return;
  history.push(before);
  if (history.length > 50) history.shift();
  future = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('#undo').disabled = history.length === 0;
  $('#redo').disabled = future.length === 0;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  els.saveStatus.textContent = 'Saving…';
  state.updatedAt = Date.now();
  saveTimer = setTimeout(async () => {
    try {
      await saveState(db, state);
      els.saveStatus.textContent = 'Saved on this device';
    } catch (error) {
      els.saveStatus.textContent = 'Could not save';
      toast(error.message, true);
    }
  }, 220);
}

function toast(message, danger = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('danger', danger);
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function currentCenter() {
  const space = activeSpace();
  const slots = [[0,0],[330,0],[0,270],[330,270],[-330,0],[-330,270],[0,-270],[330,-270],[-330,-270]];
  const cycle = Math.floor(space.items.length / slots.length);
  const [slotX, slotY] = slots[space.items.length % slots.length];
  return {
    x: (els.wrap.clientWidth / 2 - space.view.x) / space.view.zoom - 150 + slotX + cycle * 28,
    y: (els.wrap.clientHeight / 2 - space.view.y) / space.view.zoom - 100 + slotY + cycle * 28
  };
}

function createItem(type, values = {}) {
  const point = currentCenter();
  const defaults = {
    id: uid(type), type, x: point.x, y: point.y, w: type === 'image' ? 340 : 300,
    h: type === 'note' ? 220 : type === 'checklist' ? 250 : 190,
    title: type === 'note' ? 'New thought' : type === 'checklist' ? 'Things to do' : '', z: Date.now(),
    text: '', color: ['#fff3c9','#dff4ea','#e8e1ff','#dcecff'][activeSpace().items.length % 4], createdAt: Date.now()
  };
  const before = snapshot();
  const item = { ...defaults, ...values };
  activeSpace().items.push(item);
  commitHistory(before);
  scheduleSave();
  renderBoard();
  requestAnimationFrame(() => document.querySelector(`[data-id="${item.id}"] [data-field="${type === 'note' ? 'text' : 'title'}"]`)?.focus());
  return item;
}

function cardTemplate(item) {
  const title = `<div class="card-title" contenteditable="true" data-field="title" data-placeholder="Untitled">${escapeHtml(item.title)}</div>`;
  let body = '';
  if (item.type === 'note') body = `${title}<div class="card-text" contenteditable="true" data-field="text" data-placeholder="Write anything…">${escapeHtml(item.text)}</div>`;
  if (item.type === 'checklist') {
    const rows = item.rows || [{ id:uid('row'), text:'', done:false }];
    item.rows = rows;
    body = `${title}<div class="checklist">${rows.map(row => `<label data-row="${row.id}"><input type="checkbox" ${row.done ? 'checked' : ''}><span contenteditable="true" data-row-text data-placeholder="List item">${escapeHtml(row.text)}</span><button data-delete-row aria-label="Remove item">×</button></label>`).join('')}</div><button class="add-row">＋ Add item</button>`;
  }
  if (item.type === 'link') body = `<p class="type-label">Saved link</p>${title}<p class="link-note" contenteditable="true" data-field="text" data-placeholder="Add a note">${escapeHtml(item.text)}</p><a class="visit-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Open link <span>↗</span></a><p class="link-host">${escapeHtml(safeHost(item.url))}</p>`;
  if (item.type === 'image') body = `<div class="media-frame"><div class="media-loading">Loading photo…</div></div>${title}<div class="caption" contenteditable="true" data-field="text" data-placeholder="Add a caption">${escapeHtml(item.text)}</div>`;
  if (item.type === 'file') body = `<p class="type-label">File</p><div class="file-mark">${escapeHtml(fileExtension(item.fileName))}</div>${title}<p class="file-meta">${escapeHtml(formatBytes(item.fileSize))}</p><button class="download-file">Open file</button>`;
  return `<article class="life-card type-${item.type}" data-id="${item.id}" style="--card:${item.color};left:${item.x}px;top:${item.y}px;width:${item.w}px;height:${item.h}px;z-index:${item.z || 1}">
    <div class="drag-handle"><span class="card-kind">${({note:'Thought',checklist:'List',link:'Link',image:'Photo',file:'File'})[item.type]}</span><div class="card-actions"><button data-color title="Change color">●</button><button data-delete title="Delete">×</button></div></div>
    <div class="card-body">${body}</div><div class="resize-handle" title="Resize"></div></article>`;
}

function safeHost(url) { try { return new URL(url).hostname.replace(/^www\./,''); } catch { return url; } }
function fileExtension(name='file') { return (name.split('.').pop() || 'FILE').slice(0,4).toUpperCase(); }
function formatBytes(size=0) { return size < 1024 ? `${size} B` : size < 1048576 ? `${(size/1024).toFixed(1)} KB` : `${(size/1048576).toFixed(1)} MB`; }

async function hydrateMedia(card, item) {
  if (item.type !== 'image') return;
  const frame = card.querySelector('.media-frame');
  const stored = await getFile(db, item.fileId);
  if (!stored) { frame.innerHTML = '<div class="media-missing">Photo unavailable</div>'; return; }
  if (objectUrls.has(item.fileId)) URL.revokeObjectURL(objectUrls.get(item.fileId));
  const url = URL.createObjectURL(stored.blob);
  objectUrls.set(item.fileId, url);
  frame.innerHTML = `<img src="${url}" alt="${escapeHtml(item.title || stored.name)}">`;
}

function renderBoard() {
  const space = activeSpace();
  els.name.value = space.name;
  els.summary.textContent = `${space.items.length} ${space.items.length === 1 ? 'thing' : 'things'} · ${space.strokes.length} ${space.strokes.length === 1 ? 'sketch' : 'sketches'}`;
  els.cardLayer.innerHTML = space.items.map(cardTemplate).join('');
  els.cardLayer.querySelectorAll('.life-card').forEach(card => hydrateMedia(card, itemById(card.dataset.id)));
  renderStrokes();
  applyView();
  els.empty.hidden = space.items.length > 0 || space.strokes.length > 0;
  renderSpaces();
}

function renderSpaces() {
  const query = els.search.value.trim().toLowerCase();
  els.spaces.innerHTML = state.spaces.map(space => {
    const hit = !query || space.name.toLowerCase().includes(query) || space.items.some(item => `${item.title} ${item.text} ${item.url || ''}`.toLowerCase().includes(query));
    if (!hit) return '';
    return `<button class="space-button ${space.id === state.activeSpaceId ? 'active' : ''}" data-space="${space.id}"><span class="space-swatch" style="--space-color:${space.color}"></span><span><b>${escapeHtml(space.name)}</b><small>${space.items.length} saved</small></span>${state.spaces.length > 1 ? '<i data-delete-space>×</i>' : ''}</button>`;
  }).join('') || '<p class="no-results">Nothing found yet.</p>';
}

function renderStrokes() {
  els.drawingLayer.innerHTML = activeSpace().strokes.map(stroke => `<polyline data-stroke="${stroke.id}" points="${stroke.points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
}

function applyView() {
  const view = activeSpace().view;
  els.board.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  els.wrap.style.setProperty('--grid-x', `${view.x}px`);
  els.wrap.style.setProperty('--grid-y', `${view.y}px`);
  els.wrap.style.setProperty('--grid-size', `${32 * view.zoom}px`);
  $('#zoom-reset').textContent = `${Math.round(view.zoom * 100)}%`;
}

function setZoom(next, origin = { x: els.wrap.clientWidth / 2, y: els.wrap.clientHeight / 2 }) {
  const view = activeSpace().view;
  const old = view.zoom;
  next = clamp(next, .35, 2);
  const worldX = (origin.x - view.x) / old;
  const worldY = (origin.y - view.y) / old;
  view.zoom = next;
  view.x = origin.x - worldX * next;
  view.y = origin.y - worldY * next;
  applyView(); scheduleSave();
}

function boardPoint(event) {
  const rect = els.wrap.getBoundingClientRect();
  const view = activeSpace().view;
  return { x:(event.clientX - rect.left - view.x) / view.zoom, y:(event.clientY - rect.top - view.y) / view.zoom };
}

function pointerDown(event) {
  const card = event.target.closest('.life-card');
  if (card) {
    const selected = itemById(card.dataset.id);
    selected.z = Math.max(0, ...activeSpace().items.map(item => item.z || 0)) + 1;
    card.style.zIndex = selected.z;
    scheduleSave();
  }
  if (drawMode && !event.target.closest('.tool-dock')) {
    event.preventDefault();
    const before = snapshot();
    const point = boardPoint(event);
    currentStroke = { id:uid('stroke'), color:'#ff7a59', width:4 / activeSpace().view.zoom, points:[point] };
    activeSpace().strokes.push(currentStroke);
    interaction = { type:'draw', before };
    els.wrap.setPointerCapture(event.pointerId); renderStrokes(); return;
  }
  if (card && event.target.closest('.drag-handle') && !event.target.closest('button')) {
    event.preventDefault();
    const item = itemById(card.dataset.id);
    interaction = { type:'drag', item, startX:event.clientX, startY:event.clientY, x:item.x, y:item.y, before:snapshot() };
    card.classList.add('moving'); els.wrap.setPointerCapture(event.pointerId); return;
  }
  if (card && event.target.closest('.resize-handle')) {
    event.preventDefault();
    const item = itemById(card.dataset.id);
    interaction = { type:'resize', item, startX:event.clientX, startY:event.clientY, w:item.w, h:item.h, before:snapshot() };
    els.wrap.setPointerCapture(event.pointerId); return;
  }
  if (!card && event.button === 0) {
    interaction = { type:'pan', startX:event.clientX, startY:event.clientY, x:activeSpace().view.x, y:activeSpace().view.y };
    els.wrap.classList.add('panning'); els.wrap.setPointerCapture(event.pointerId);
  }
}

function pointerMove(event) {
  if (!interaction) return;
  const view = activeSpace().view;
  if (interaction.type === 'draw') {
    const point = boardPoint(event);
    const last = currentStroke.points.at(-1);
    if (Math.hypot(point.x-last.x, point.y-last.y) > 2) currentStroke.points.push(point);
    renderStrokes();
  }
  if (interaction.type === 'drag') {
    interaction.item.x = interaction.x + (event.clientX - interaction.startX) / view.zoom;
    interaction.item.y = interaction.y + (event.clientY - interaction.startY) / view.zoom;
    const card = document.querySelector(`[data-id="${interaction.item.id}"]`);
    card.style.left = `${interaction.item.x}px`; card.style.top = `${interaction.item.y}px`;
  }
  if (interaction.type === 'resize') {
    interaction.item.w = clamp(interaction.w + (event.clientX - interaction.startX) / view.zoom, 220, 720);
    interaction.item.h = clamp(interaction.h + (event.clientY - interaction.startY) / view.zoom, 150, 720);
    const card = document.querySelector(`[data-id="${interaction.item.id}"]`);
    card.style.width = `${interaction.item.w}px`; card.style.height = `${interaction.item.h}px`;
  }
  if (interaction.type === 'pan') {
    view.x = interaction.x + event.clientX - interaction.startX;
    view.y = interaction.y + event.clientY - interaction.startY;
    applyView();
  }
}

function pointerUp() {
  if (!interaction) return;
  if (interaction.before) commitHistory(interaction.before);
  if (interaction.type !== 'pan') renderBoard(); else scheduleSave();
  document.querySelector('.moving')?.classList.remove('moving');
  els.wrap.classList.remove('panning'); currentStroke = null; interaction = null;
}

function bindEvents() {
  document.addEventListener('click', async event => {
    const add = event.target.closest('[data-add]')?.dataset.add;
    if (add === 'note' || add === 'checklist') createItem(add);
    if (add === 'link') { $('#link-form').reset(); $('#link-dialog').showModal(); }
    if (add === 'image') $('#image-input').click();
    if (add === 'file') $('#file-input').click();
    const card = event.target.closest('.life-card');
    if (card && event.target.closest('[data-delete]')) {
      const before = snapshot();
      activeSpace().items = activeSpace().items.filter(item => item.id !== card.dataset.id);
      commitHistory(before); scheduleSave(); renderBoard();
    }
    if (card && event.target.closest('[data-color]')) {
      const palette = ['#fff3c9','#dff4ea','#e8e1ff','#dcecff','#ffe1dc','#f4eee4'];
      const item = itemById(card.dataset.id); const before = snapshot();
      item.color = palette[(palette.indexOf(item.color) + 1) % palette.length];
      commitHistory(before); scheduleSave(); renderBoard();
    }
    if (card && event.target.closest('.add-row')) {
      const item = itemById(card.dataset.id); const before = snapshot();
      item.rows.push({ id:uid('row'), text:'', done:false }); commitHistory(before); scheduleSave(); renderBoard();
      requestAnimationFrame(() => card.querySelector('[data-row]:last-of-type [data-row-text]')?.focus());
    }
    if (card && event.target.closest('[data-delete-row]')) {
      const item = itemById(card.dataset.id); const row = event.target.closest('[data-row]'); const before = snapshot();
      item.rows = item.rows.filter(entry => entry.id !== row.dataset.row); commitHistory(before); scheduleSave(); renderBoard();
    }
    if (card && event.target.closest('.download-file')) {
      const item = itemById(card.dataset.id); const stored = await getFile(db, item.fileId);
      if (!stored) return toast('That file is not available on this device.', true);
      const url = URL.createObjectURL(stored.blob); const a = document.createElement('a'); a.href = url; a.download = stored.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const spaceButton = event.target.closest('[data-space]');
    if (spaceButton && !event.target.closest('[data-delete-space]')) { state.activeSpaceId = spaceButton.dataset.space; history=[]; future=[]; updateHistoryButtons(); renderBoard(); scheduleSave(); els.sidebar.classList.remove('open'); }
    if (spaceButton && event.target.closest('[data-delete-space]')) {
      if (!confirm('Delete this space and everything in it?')) return;
      state.spaces = state.spaces.filter(space => space.id !== spaceButton.dataset.space); state.activeSpaceId = state.spaces[0].id; renderBoard(); scheduleSave();
    }
  });

  els.cardLayer.addEventListener('input', event => {
    const card = event.target.closest('.life-card'); if (!card) return;
    const item = itemById(card.dataset.id);
    if (event.target.dataset.field) item[event.target.dataset.field] = event.target.innerText;
    if (event.target.hasAttribute('data-row-text')) item.rows.find(row => row.id === event.target.closest('[data-row]').dataset.row).text = event.target.innerText;
    scheduleSave();
  });
  els.cardLayer.addEventListener('change', event => {
    if (event.target.type !== 'checkbox') return;
    const item = itemById(event.target.closest('.life-card').dataset.id);
    item.rows.find(row => row.id === event.target.closest('[data-row]').dataset.row).done = event.target.checked; scheduleSave();
  });
  els.wrap.addEventListener('pointerdown', pointerDown);
  els.wrap.addEventListener('pointermove', pointerMove);
  els.wrap.addEventListener('pointerup', pointerUp);
  els.wrap.addEventListener('pointercancel', pointerUp);
  els.wrap.addEventListener('wheel', event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); const rect=els.wrap.getBoundingClientRect(); setZoom(activeSpace().view.zoom * (event.deltaY > 0 ? .9 : 1.1), {x:event.clientX-rect.left,y:event.clientY-rect.top}); } }, { passive:false });

  $('#draw-tool').onclick = () => { drawMode = !drawMode; $('#draw-tool').classList.toggle('active', drawMode); els.wrap.classList.toggle('drawing', drawMode); toast(drawMode ? 'Draw mode on' : 'Draw mode off'); };
  $('#add-space').onclick = () => { const name = prompt('Name this space', 'New space'); if (!name?.trim()) return; const before=snapshot(); const space={id:uid('space'),name:name.trim(),color:['#ffb66e','#7fd4ad','#a89cf5','#79b9ef'][state.spaces.length%4],view:{x:0,y:0,zoom:1},items:[],strokes:[]}; state.spaces.push(space); state.activeSpaceId=space.id; commitHistory(before); renderBoard(); scheduleSave(); };
  els.name.addEventListener('input', () => { activeSpace().name = els.name.value; renderSpaces(); scheduleSave(); });
  els.search.addEventListener('input', renderSpaces);
  $('#zoom-in').onclick = () => setZoom(activeSpace().view.zoom * 1.15);
  $('#zoom-out').onclick = () => setZoom(activeSpace().view.zoom / 1.15);
  $('#zoom-reset').onclick = () => { activeSpace().view={x:0,y:0,zoom:1}; applyView(); scheduleSave(); };
  $('#open-sidebar').onclick = () => els.sidebar.classList.add('open');
  $('#close-sidebar').onclick = () => els.sidebar.classList.remove('open');
  $('#help-button').onclick = () => $('#help-dialog').showModal();
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.onclick = () => button.closest('dialog').close());
  $('#save-link').onclick = event => { event.preventDefault(); let url=$('#link-url').value.trim(); if (!url) return; if (!/^https?:\/\//i.test(url)) url=`https://${url}`; createItem('link',{title:$('#link-title').value.trim() || safeHost(url),url,text:$('#link-note').value.trim()}); $('#link-dialog').close(); };
  $('#image-input').onchange = event => addFiles([...event.target.files], 'image');
  $('#file-input').onchange = event => addFiles([...event.target.files], 'file');
  $('#export-data').onclick = backup;
  $('#import-data').onclick = () => $('#import-file').click();
  $('#import-file').onchange = restore;
  $('#undo').onclick = () => travel(history, future);
  $('#redo').onclick = () => travel(future, history);
  window.addEventListener('keydown', event => { if ((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='z' && !event.target.isContentEditable) { event.preventDefault(); event.shiftKey ? travel(future,history) : travel(history,future); } });
}

async function addFiles(files, type) {
  for (const file of files) {
    if (file.size > 30 * 1024 * 1024) { toast(`${file.name} is over the 30 MB limit.`, true); continue; }
    const id = uid('file'); await saveFile(db, id, file);
    createItem(type, { fileId:id, fileName:file.name, fileSize:file.size, title:type === 'image' ? file.name.replace(/\.[^.]+$/,'') : file.name });
  }
}

function travel(from, to) {
  if (!from.length) return;
  to.push(snapshot()); state=JSON.parse(from.pop()); updateHistoryButtons(); renderBoard(); scheduleSave();
}

async function backup() {
  els.saveStatus.textContent='Building backup…';
  const payload=await exportWorkspace(db,state); const blob=new Blob([JSON.stringify(payload)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`life-space-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); els.saveStatus.textContent='Backup downloaded'; toast('Life Space backup downloaded.');
}

async function restore(event) {
  const file=event.target.files[0]; if (!file) return;
  try { const payload=JSON.parse(await file.text()); if (!confirm('Replace this workspace with the backup?')) return; const restored=await importWorkspace(db,payload); state=restored; history=[]; future=[]; renderBoard(); scheduleSave(); toast('Backup restored.'); } catch(error) { toast(error.message,true); }
  event.target.value='';
}

async function init() {
  db=await openDatabase(); state=await loadState(db) || defaultState();
  if (!state.spaces?.length) state=defaultState();
  bindEvents(); renderBoard(); updateHistoryButtons();
}

init().catch(error => { console.error(error); toast('Life Space could not start. Refresh and try again.', true); });
