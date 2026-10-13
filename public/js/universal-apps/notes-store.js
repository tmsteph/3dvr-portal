// Local-first notes store for Universal Apps. Browser-only module.
const DB_NAME = "3dvr-universal-apps";
const DB_VERSION = 1;
const NOTES = "notes";
const MUTATIONS = "mutations";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    tx.onerror = () => reject(tx.error || new Error("Transaction failed"));
  });
}
export function openNotesDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTES)) db.createObjectStore(NOTES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(MUTATIONS)) {
        const queue = db.createObjectStore(MUTATIONS, { keyPath: "mutationId" });
        queue.createIndex("noteId", "noteId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database upgrade blocked by another tab"));
  });
}
export async function saveLocalNote(db, { id = crypto.randomUUID(), title = "", body = "" }) {
  if (typeof title !== "string" || typeof body !== "string") throw new TypeError("Invalid note");
  if (new TextEncoder().encode(title + body).length > 1024 * 1024) throw new Error("Note exceeds 1 MiB limit");
  const tx = db.transaction([NOTES, MUTATIONS], "readwrite");
  const notes = tx.objectStore(NOTES);
  const existing = await requestResult(notes.get(id));
  const note = { id, title, body, revision: existing?.revision ?? 0, updatedAt: new Date().toISOString(), deleted: false };
  notes.put(note);
  tx.objectStore(MUTATIONS).put({ mutationId: crypto.randomUUID(), noteId: id, expectedRevision: note.revision, payload: note });
  await transactionDone(tx);
  return note;
}
export async function listLocalNotes(db) {
  const tx = db.transaction(NOTES, "readonly");
  const result = await requestResult(tx.objectStore(NOTES).getAll());
  await transactionDone(tx);
  return result.filter(note => !note.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function listPendingMutations(db) {
  const tx = db.transaction(MUTATIONS, "readonly");
  const result = await requestResult(tx.objectStore(MUTATIONS).getAll());
  await transactionDone(tx);
  return result;
}
export async function acknowledgeMutation(db, mutationId, serverRevision) {
  const tx = db.transaction([NOTES, MUTATIONS], "readwrite");
  const queue = tx.objectStore(MUTATIONS);
  const mutation = await requestResult(queue.get(mutationId));
  if (mutation) {
    const notes = tx.objectStore(NOTES);
    const note = await requestResult(notes.get(mutation.noteId));
    // Only advance the note revision if no newer local edits are queued.
    const pending = await requestResult(queue.index("noteId").getAll(mutation.noteId));
    if (note && pending.length === 1) notes.put({ ...note, revision: serverRevision });
    queue.delete(mutationId);
  }
  await transactionDone(tx);
}
