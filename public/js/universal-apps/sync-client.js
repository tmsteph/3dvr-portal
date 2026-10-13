// Transport-only sync adapter. Never treats an HTTP response as authentication.
// The server must validate the session and enforce owner isolation.
import { listPendingMutations, acknowledgeMutation } from "./notes-store.js";

export class SyncConflictError extends Error {
  constructor(mutation, remote) {
    super("This note changed on another device. Both versions must be preserved.");
    this.name = "SyncConflictError";
    this.mutation = mutation;
    this.remote = remote;
  }
}

export async function pushPendingNotes(db, { endpoint, fetchImpl = fetch, signal } = {}) {
  if (!endpoint || typeof endpoint !== "string" || !endpoint.startsWith("/")) {
    throw new TypeError("A same-origin API path is required");
  }
  const pending = await listPendingMutations(db);
  let synced = 0;
  for (const mutation of pending) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
      signal
    });
    if (response.status === 409) {
      const remote = await response.json();
      throw new SyncConflictError(mutation, remote);
    }
    if (!response.ok) throw new Error(`Sync failed (HTTP ${response.status}); local changes retained`);
    const result = await response.json();
    if (!Number.isSafeInteger(result.revision) || result.revision < 1 ||
        result.mutationId !== mutation.mutationId) {
      throw new Error("Invalid sync acknowledgment; local changes retained");
    }
    await acknowledgeMutation(db, mutation.mutationId, result.revision);
    synced++;
  }
  return { synced, pendingAtStart: pending.length };
}
