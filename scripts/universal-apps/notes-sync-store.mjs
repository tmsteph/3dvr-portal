// Isolated prototype storage engine; NOT an HTTP endpoint.
// Caller must supply a verified principal from server-side authentication.
export class NotesSyncStore {
  constructor() {
    this.users = new Map();
  }
  apply(principal, mutation) {
    if (typeof principal !== "string" || !principal.trim()) throw new TypeError("Authenticated principal required");
    if (!mutation || typeof mutation !== "object" || Array.isArray(mutation)) throw new TypeError("Invalid mutation");
    const { mutationId, noteId, expectedRevision, payload } = mutation;
    if (![mutationId, noteId].every(x => typeof x === "string" && x.length > 0 && x.length <= 128)) throw new TypeError("Invalid ids");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError("Invalid revision");
    if (!payload || payload.id !== noteId || typeof payload.title !== "string" || typeof payload.body !== "string") throw new TypeError("Invalid payload");
    if (Buffer.byteLength(payload.title + payload.body, "utf8") > 1024 * 1024) throw new RangeError("Note too large");
    let scope = this.users.get(principal);
    if (!scope) { scope = { notes: new Map(), receipts: new Map() }; this.users.set(principal, scope); }
    if (scope.receipts.has(mutationId)) {
      const prior = scope.receipts.get(mutationId);
      if (prior.noteId !== noteId) throw new Error("Mutation id reused for another note");
      return { status: 200, mutationId, revision: prior.revision };
    }
    const existing = scope.notes.get(noteId);
    const revision = existing?.revision ?? 0;
    if (revision !== expectedRevision) return { status: 409, note: existing ?? null, revision };
    const nextRevision = revision + 1;
    scope.notes.set(noteId, { id: noteId, title: payload.title, body: payload.body, deleted: payload.deleted === true, revision: nextRevision });
    scope.receipts.set(mutationId, { noteId, revision: nextRevision });
    return { status: 200, mutationId, revision: nextRevision };
  }
  list(principal) {
    if (typeof principal !== "string" || !principal.trim()) throw new TypeError("Authenticated principal required");
    return Array.from(this.users.get(principal)?.notes.values() ?? []);
  }
}
