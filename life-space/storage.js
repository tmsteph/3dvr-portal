const DB_NAME = '3dvr-life-space';
const DB_VERSION = 1;
const STATE_STORE = 'state';
const FILE_STORE = 'files';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDatabase() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState(db) {
  if (!db) {
    const value = localStorage.getItem('3dvr-life-space-state');
    return value ? JSON.parse(value) : null;
  }
  return requestResult(db.transaction(STATE_STORE).objectStore(STATE_STORE).get('workspace'));
}

export async function saveState(db, state) {
  if (!db) {
    localStorage.setItem('3dvr-life-space-state', JSON.stringify(state));
    return;
  }
  const tx = db.transaction(STATE_STORE, 'readwrite');
  tx.objectStore(STATE_STORE).put(state, 'workspace');
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveFile(db, id, file) {
  if (!db) return null;
  const tx = db.transaction(FILE_STORE, 'readwrite');
  tx.objectStore(FILE_STORE).put({ blob: file, name: file.name, type: file.type, size: file.size }, id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

export async function getFile(db, id) {
  if (!db) return null;
  return requestResult(db.transaction(FILE_STORE).objectStore(FILE_STORE).get(id));
}

export async function exportWorkspace(db, state) {
  const copy = structuredClone(state);
  const fileIds = [...new Set(copy.spaces.flatMap(space => space.items).map(item => item.fileId).filter(Boolean))];
  const files = [];
  for (const id of fileIds) {
    const stored = await getFile(db, id);
    if (!stored) continue;
    const data = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(stored.blob);
    });
    files.push({ id, ...stored, blob: undefined, data });
  }
  return { format: '3dvr-life-space', version: 1, exportedAt: new Date().toISOString(), state: copy, files };
}

export async function importWorkspace(db, payload) {
  if (!payload || payload.format !== '3dvr-life-space' || !payload.state) throw new Error('This is not a Life Space backup.');
  for (const file of payload.files || []) {
    const blob = await (await fetch(file.data)).blob();
    const restored = new File([blob], file.name, { type: file.type });
    await saveFile(db, file.id, restored);
  }
  await saveState(db, payload.state);
  return payload.state;
}
