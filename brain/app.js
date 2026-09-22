const state = {
  root: null,
  notes: [],
  active: null,
  query: ''
};

const els = {
  open: document.querySelector('#open-vault'),
  save: document.querySelector('#save-note'),
  add: document.querySelector('#new-note'),
  search: document.querySelector('#search'),
  list: document.querySelector('#note-list'),
  path: document.querySelector('#note-path'),
  editor: document.querySelector('#editor'),
  status: document.querySelector('#status'),
  links: document.querySelector('#links'),
  backlinks: document.querySelector('#backlinks')
};

function supported() {
  return 'showDirectoryPicker' in window;
}

async function walkDirectory(handle, prefix = '') {
  const notes = [];
  for await (const [name, child] of handle.entries()) {
    if (name.startsWith('.')) continue;
    const path = prefix ? prefix + '/' + name : name;
    if (child.kind === 'directory') {
      notes.push(...await walkDirectory(child, path));
    } else if (name.toLowerCase().endsWith('.md')) {
      notes.push({
        path,
        handle: child,
        text: '',
        title: name.replace(/\.md$/i, '')
      });
    }
  }
  return notes;
}

function titleFor(text, fallback) {
  const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/);
  const title = frontmatter?.[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  if (title) return title;
  const heading = text.match(/^#\s+(.+)$/m)?.[1];
  return heading || fallback;
}

function wikilinks(text) {
  return [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

function aliases(note) {
  const stem = note.path.split('/').pop().replace(/\.md$/i, '');
  return [
    note.path.replace(/\.md$/i, ''),
    stem,
    note.title
  ].map(value => value.toLowerCase());
}

function findNote(target) {
  const wanted = target.toLowerCase();
  return state.notes.find(note => aliases(note).includes(wanted));
}

async function hydrate(note) {
  if (note.text) return note;
  const file = await note.handle.getFile();
  note.text = await file.text();
  note.title = titleFor(note.text, note.title);
  return note;
}

async function openVault() {
  if (!supported()) {
    els.status.textContent =
      'This browser cannot open a local folder yet. Use desktop Chromium or the Brain CLI.';
    return;
  }
  state.root = await window.showDirectoryPicker({ mode: 'readwrite' });
  state.notes = await walkDirectory(state.root);
  await Promise.all(state.notes.map(hydrate));
  state.notes.sort((a, b) => a.title.localeCompare(b.title));
  state.active = state.notes[0] || null;
  render();
}

function visibleNotes() {
  const query = state.query.trim().toLowerCase();
  if (!query) return state.notes;
  return state.notes.filter(note =>
    (note.title + ' ' + note.path + ' ' + note.text).toLowerCase().includes(query)
  );
}

function noteButton(note, label = note.title) {
  const button = document.createElement('button');
  button.className = 'note-link';
  button.textContent = label;
  button.addEventListener('click', () => {
    state.active = note;
    render();
  });
  return button;
}

function renderRelations() {
  els.links.replaceChildren();
  els.backlinks.replaceChildren();
  if (!state.active) return;

  const outbound = [...new Set(wikilinks(state.active.text))];
  for (const target of outbound) {
    const note = findNote(target);
    if (note) {
      els.links.append(noteButton(note, target));
    } else {
      const missing = document.createElement('span');
      missing.className = 'missing-link';
      missing.textContent = target;
      els.links.append(missing);
    }
  }
  if (!outbound.length) els.links.textContent = 'None yet';

  const activeAliases = new Set(aliases(state.active));
  const incoming = state.notes.filter(note =>
    note !== state.active &&
    wikilinks(note.text).some(link => activeAliases.has(link.toLowerCase()))
  );
  for (const note of incoming) els.backlinks.append(noteButton(note));
  if (!incoming.length) els.backlinks.textContent = 'None yet';
}

function render() {
  els.list.replaceChildren();
  for (const note of visibleNotes()) {
    const button = noteButton(note);
    if (state.active === note) button.classList.add('active');
    els.list.append(button);
  }

  const active = state.active;
  els.path.textContent = active?.path || 'Open a vault to begin';
  els.editor.value = active?.text || '';
  els.editor.disabled = !active;
  els.save.disabled = !active;
  els.add.disabled = !state.root;
  els.status.textContent = state.root
    ? state.notes.length + ' Markdown note' + (state.notes.length === 1 ? '' : 's') + ' · local files only'
    : 'Nothing leaves your device.';
  renderRelations();
}

async function saveActive() {
  if (!state.active) return;
  const writable = await state.active.handle.createWritable();
  await writable.write(els.editor.value);
  await writable.close();
  state.active.text = els.editor.value;
  state.active.title = titleFor(state.active.text, state.active.title);
  render();
}

async function newNote() {
  if (!state.root) return;
  const raw = window.prompt('Note name');
  if (!raw) return;
  const safe = raw.replace(/[\\/:*?"<>|]/g, '-').trim();
  if (!safe) return;
  const name = safe.toLowerCase().endsWith('.md') ? safe : safe + '.md';
  const handle = await state.root.getFileHandle(name, { create: true });
  const title = safe.replace(/\.md$/i, '');
  const note = {
    path: name,
    handle,
    title,
    text: '# ' + title + '\n\n'
  };
  state.notes.push(note);
  state.active = note;
  await saveActive();
}

els.open.addEventListener('click', () => openVault().catch(error => {
  els.status.textContent = error?.message || 'Could not open vault.';
}));

els.save.addEventListener('click', () => saveActive().catch(error => {
  els.status.textContent = error?.message || 'Could not save note.';
}));

els.add.addEventListener('click', () => newNote().catch(error => {
  els.status.textContent = error?.message || 'Could not create note.';
}));

els.search.addEventListener('input', event => {
  state.query = event.target.value;
  render();
});

els.editor.addEventListener('input', () => {
  if (!state.active) return;
  state.active.text = els.editor.value;
  renderRelations();
});

if (!supported()) {
  els.open.disabled = true;
  els.status.textContent =
    'Local folder access needs a Chromium desktop browser for now. The Markdown vault remains portable.';
}

render();
