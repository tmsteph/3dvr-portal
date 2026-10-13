import test from "node:test";
import assert from "node:assert/strict";
import { NotesSyncStore } from "../scripts/universal-apps/notes-sync-store.mjs";

const mutation = (mutationId, expectedRevision, body = "hello") => ({
  mutationId, noteId: "note-1", expectedRevision,
  payload: { id: "note-1", title: "Note", body }
});

test("creates a note and increments revision", () => {
  const store = new NotesSyncStore();
  assert.deepEqual(store.apply("alice", mutation("m1", 0)), { status: 200, mutationId: "m1", revision: 1 });
  assert.equal(store.list("alice")[0].body, "hello");
});

test("replayed mutation returns same receipt without double write", () => {
  const store = new NotesSyncStore();
  store.apply("alice", mutation("m1", 0));
  assert.equal(store.apply("alice", mutation("m1", 0)).revision, 1);
  assert.equal(store.list("alice")[0].revision, 1);
});

test("stale update returns conflict and preserves server note", () => {
  const store = new NotesSyncStore();
  store.apply("alice", mutation("m1", 0));
  const conflict = store.apply("alice", mutation("m2", 0, "other edit"));
  assert.equal(conflict.status, 409);
  assert.equal(store.list("alice")[0].body, "hello");
});

test("tenant isolation", () => {
  const store = new NotesSyncStore();
  store.apply("alice", mutation("m1", 0));
  assert.deepEqual(store.list("bob"), []);
  assert.equal(store.apply("bob", mutation("m1", 0, "bob note")).revision, 1);
  assert.equal(store.list("alice")[0].body, "hello");
  assert.equal(store.list("bob")[0].body, "bob note");
});

test("rejects missing principal and oversized payload", () => {
  const store = new NotesSyncStore();
  assert.throws(() => store.apply("", mutation("m1", 0)));
  assert.throws(() => store.apply("alice", mutation("m1", 0, "x".repeat(1024 * 1024 + 1))));
});
