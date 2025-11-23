// src/gun/explorer.js
// Lightweight GunJS exploration tool to inspect nodes, peers, and live updates.
import { createGunToolkit, omitMetaFields } from './toolkit.js';

function qs(id) {
  return document.getElementById(id);
}

function formatPath(input) {
  if (!input) return [];
  return input
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);
}

function stringify(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function createListItem(label, value) {
  const li = document.createElement('li');
  const title = document.createElement('span');
  title.className = 'label';
  title.textContent = label;

  const content = document.createElement('span');
  content.className = 'value';
  content.textContent = value;

  li.append(title, content);
  return li;
}

function renderPeers(container, peers = []) {
  container.innerHTML = '';
  if (!peers.length) {
    container.textContent = 'No peer updates yet';
    return;
  }

  peers.forEach(peer => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="peer-label">${peer.peer}</div>
      <div class="peer-meta">${peer.state || 'unknown'} · ${peer.updatedAt || ''}</div>
    `;
    container.appendChild(li);
  });
}

function renderSnapshot(pre, snapshot) {
  if (!snapshot) {
    pre.textContent = 'No snapshot captured yet.';
    return;
  }
  pre.textContent = JSON.stringify(snapshot, null, 2);
}

function makeStatusWriter(element) {
  return (text, state) => {
    element.textContent = text;
    if (state) {
      element.dataset.state = state;
    } else {
      element.removeAttribute('data-state');
    }
  };
}

function describeHit(hit) {
  const path = hit.path.length ? hit.path.join(' / ') : 'root';
  const value = stringify(hit.value);
  return { path, value };
}

function buildSearchResults(container, snapshot, toolkit, term) {
  container.innerHTML = '';
  if (!toolkit) {
    container.innerHTML = '<p class="muted">Waiting for Gun to connect…</p>';
    return;
  }

  if (!snapshot || !term) {
    container.innerHTML = '<p class="muted">Enter a search term to scan the snapshot.</p>';
    return;
  }

  const hits = toolkit.backup.query(snapshot, (value, path) => {
    const valueString = stringify(value).toLowerCase();
    const pathString = path.join('/').toLowerCase();
    const needle = term.toLowerCase();
    return valueString.includes(needle) || pathString.includes(needle);
  });

  if (!hits.length) {
    container.innerHTML = '<p class="muted">No matches found for this snapshot.</p>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'results-list';
  hits.slice(0, 50).forEach(hit => {
    const { path, value } = describeHit(hit);
    const item = document.createElement('li');

    const pathEl = document.createElement('div');
    pathEl.className = 'result-path';
    pathEl.textContent = path;

    const valueEl = document.createElement('pre');
    valueEl.className = 'result-value';
    valueEl.textContent = value;

    item.append(pathEl, valueEl);
    list.appendChild(item);
  });

  if (hits.length > 50) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = `Showing first 50 of ${hits.length} matches.`;
    container.append(list, note);
    return;
  }

  container.appendChild(list);
}

(async () => {
  const statusEl = qs('explorer-status');
  const peerList = qs('peer-list');
  const snapshotPre = qs('snapshot-data');
  const livePre = qs('live-data');
  const metaList = qs('snapshot-meta');
  const pathInput = qs('node-path');
  const depthInput = qs('depth');
  const searchInput = qs('search');
  const searchResults = qs('search-results');
  const liveToggle = qs('live-toggle');
  const rootLabel = qs('root-label');
  const pathForm = qs('path-form');

  const writeStatus = makeStatusWriter(statusEl);

  let toolkit = null;
  let currentSnapshot = null;
  let liveUnsubscribe = null;

  function stopLive() {
    if (liveUnsubscribe) {
      liveUnsubscribe();
      liveUnsubscribe = null;
    }
    liveToggle.checked = false;
    livePre.textContent = 'Live listener paused.';
  }

  async function captureSnapshot(event) {
    if (event) event.preventDefault();
    if (!toolkit) return;

    const keys = formatPath(pathInput.value);
    const depth = Number(depthInput.value) || 2;

    writeStatus('Capturing snapshot…');
    const snapshot = await toolkit.backup.capture(keys, depth);
    currentSnapshot = snapshot;

    const cleaned = omitMetaFields(snapshot);
    renderSnapshot(snapshotPre, cleaned);

    metaList.innerHTML = '';
    metaList.append(
      createListItem('Root', snapshot.root || toolkit.env.ROOT),
      createListItem('Captured at', snapshot.capturedAt),
      createListItem('Depth', String(snapshot.depth)),
      createListItem('Target path', keys.join(' / ') || 'root')
    );

    buildSearchResults(searchResults, snapshot, toolkit, searchInput.value.trim());
    if (liveToggle.checked) {
      startLive();
    }
    writeStatus('Snapshot captured', 'success');
  }

  function startLive() {
    if (!toolkit) return;
    if (liveUnsubscribe) liveUnsubscribe();

    const keys = formatPath(pathInput.value);
    const node = toolkit.path(keys);

    livePre.textContent = 'Listening for updates…';
    liveUnsubscribe = toolkit.listen(node, value => {
      const cleaned = omitMetaFields(value);
      livePre.textContent = JSON.stringify(cleaned, null, 2);
    });
  }

  function handleLiveToggle(event) {
    if (event.target.checked) {
      startLive();
    } else {
      stopLive();
    }
  }

  searchInput.addEventListener('input', () => {
    buildSearchResults(searchResults, currentSnapshot, toolkit, searchInput.value.trim());
  });

  pathForm.addEventListener('submit', captureSnapshot);
  liveToggle.addEventListener('change', handleLiveToggle);

  writeStatus('Connecting to Gun…');
  try {
    toolkit = await createGunToolkit();
    rootLabel.textContent = toolkit.env.ROOT;

    toolkit.status.onStatus(payload => {
      const rootLabelText = payload.detail?.root || '';
      const statusFlag = payload.status === 'ready' ? 'success' : undefined;
      writeStatus(`${payload.status} — ${rootLabelText}`, statusFlag);
    });

    toolkit.peers.onChange(peers => renderPeers(peerList, peers));

    const defaultPath = ['demo', 'counter', toolkit.env.PR];
    pathInput.value = defaultPath.join('/');

    await captureSnapshot();
  } catch (error) {
    console.error('[gun] explorer failed', error);
    writeStatus(error?.message || 'Connection failed', 'error');
    rootLabel.textContent = 'Unavailable';
  }
})();
