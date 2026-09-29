import {
  createPrivateKnowledgeListProof,
  createPrivateKnowledgeReadProof
} from '../operator/forge.js';

const identity = document.getElementById('identity');
const notes = document.getElementById('notes');
const documentBody = document.getElementById('document');
const noteTitle = document.getElementById('noteTitle');
const noteMeta = document.getElementById('noteMeta');

function currentIdentity() {
  return {
    signedIn: globalThis.localStorage?.getItem?.('signedIn') === 'true',
    alias: String(globalThis.localStorage?.getItem?.('alias') || '').trim(),
    pub: String(globalThis.localStorage?.getItem?.('userPubKey') || '').trim()
  };
}

function setIdentityState() {
  const current = currentIdentity();
  if (current.signedIn && current.pub) {
    identity.textContent = current.alias || 'Signed in';
    identity.className = 'pill ok';
    return true;
  }
  identity.textContent = 'Sign in required';
  identity.className = 'pill warn';
  documentBody.replaceChildren(messageNode('Sign in from the 3DVR Portal first, then return here.'));
  return false;
}

function messageNode(text) {
  const node = document.createElement('div');
  node.className = 'empty';
  node.textContent = text;
  return node;
}

function titleForPath(path = '') {
  return String(path).split('/').pop().replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function requestKnowledge(mode, note = '') {
  const proof = mode === 'list'
    ? await createPrivateKnowledgeListProof()
    : await createPrivateKnowledgeReadProof(note);
  const response = await fetch('/api/openai-site?provider=operator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ privateKnowledge: true, ...proof })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || 'Private knowledge request failed.');
  return data;
}

function appendInline(parent, text) {
  const parts = String(text).split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      const code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      parent.append(code);
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

function renderMarkdown(markdown = '') {
  const fragment = document.createDocumentFragment();
  const lines = String(markdown).replace(/\r/g, '').split('\n');
  let list = null;
  let pre = null;

  const finishList = () => { list = null; };
  for (const raw of lines) {
    if (raw.trim().startsWith('```')) {
      finishList();
      if (pre) {
        fragment.append(pre);
        pre = null;
      } else {
        pre = document.createElement('pre');
        pre.append(document.createElement('code'));
      }
      continue;
    }
    if (pre) {
      pre.firstChild.textContent += (pre.firstChild.textContent ? '\n' : '') + raw;
      continue;
    }

    const heading = raw.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      finishList();
      const h = document.createElement(`h${heading[1].length}`);
      appendInline(h, heading[2]);
      fragment.append(h);
      continue;
    }

    const item = raw.match(/^[-*]\s+(.+)$/);
    if (item) {
      if (!list) {
        list = document.createElement('ul');
        fragment.append(list);
      }
      const li = document.createElement('li');
      appendInline(li, item[1]);
      list.append(li);
      continue;
    }

    if (!raw.trim()) {
      finishList();
      continue;
    }
    finishList();
    const p = document.createElement('p');
    appendInline(p, raw);
    fragment.append(p);
  }
  if (pre) fragment.append(pre);
  documentBody.replaceChildren(fragment);
}

function markActive(path) {
  for (const button of notes.querySelectorAll('.note-button')) {
    button.classList.toggle('active', button.dataset.path === path);
  }
}

async function openNote(path, { updateHash = true } = {}) {
  if (!path) return;
  documentBody.replaceChildren(messageNode('Opening private note…'));
  try {
    const data = await requestKnowledge('read', path);
    noteTitle.textContent = titleForPath(data.path);
    const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'unknown';
    noteMeta.textContent = `${data.path}.md · updated ${updated}`;
    renderMarkdown(data.content || '');
    markActive(data.path);
    if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(data.path)}`);
  } catch (error) {
    documentBody.replaceChildren(messageNode(error?.message || 'Could not open private note.'));
  }
}

async function loadLibrary() {
  if (!setIdentityState()) return;
  notes.replaceChildren(messageNode('Loading…'));
  try {
    const data = await requestKnowledge('list');
    const items = Array.isArray(data.notes) ? data.notes : [];
    notes.replaceChildren();
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'note-button';
      button.dataset.path = item.path;
      const label = document.createElement('span');
      label.textContent = titleForPath(item.path);
      const small = document.createElement('small');
      small.textContent = item.path;
      button.append(label, small);
      button.addEventListener('click', () => openNote(item.path));
      notes.append(button);
    }
    if (!items.length) {
      notes.append(messageNode('No private Markdown notes yet.'));
      documentBody.replaceChildren(messageNode('Add a Markdown file on OVH to begin.'));
      return;
    }
    const fromHash = decodeURIComponent(globalThis.location.hash.replace(/^#/, ''));
    const preferred = items.some(item => item.path === fromHash)
      ? fromHash
      : items.some(item => item.path === 'people/mark-nadal')
        ? 'people/mark-nadal'
        : items[0].path;
    await openNote(preferred, { updateHash: !fromHash });
  } catch (error) {
    notes.replaceChildren(messageNode(error?.message || 'Could not load private knowledge.'));
    documentBody.replaceChildren(messageNode('Private knowledge is unavailable right now.'));
  }
}

globalThis.addEventListener('hashchange', () => {
  const path = decodeURIComponent(globalThis.location.hash.replace(/^#/, ''));
  if (path) openNote(path, { updateHash: false });
});

loadLibrary();
