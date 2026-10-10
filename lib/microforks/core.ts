/** Portable, local-first customization patches. No account or Git host required. */
export type Patch = { path: string; value: unknown };
export type Microfork = {
  schemaVersion: 1;
  id: string;
  upstream: { url: string; ref: string };
  revisions: { id: string; timestamp: string; patches: Patch[] }[];
};
const ALLOWED = /^(theme|shortcuts|layout|plugins|workflows)(\.[a-zA-Z0-9_-]+)+$/;
const SECRET = /(secret|token|password|credential|api[_-]?key|private[_-]?key)/i;
export function validatePatch(patch: Patch): void {
  if (!ALLOWED.test(patch.path) || SECRET.test(patch.path)) throw new Error("Unsafe customization path");
  const value = JSON.stringify(patch.value);
  if (value === undefined || value.length > 65536) throw new Error("Invalid or oversized patch");
}
export function createMicrofork(id: string, url: string, ref: string): Microfork {
  if (!id || !url || !ref) throw new Error("Missing microfork identity or upstream");
  return { schemaVersion: 1, id, upstream: { url, ref }, revisions: [] };
}
export function commit(fork: Microfork, patches: Patch[], revisionId: string, timestamp = new Date().toISOString()): Microfork {
  if (!revisionId || fork.revisions.some(r => r.id === revisionId)) throw new Error("Duplicate or empty revision");
  patches.forEach(validatePatch);
  return { ...fork, revisions: [...fork.revisions, { id: revisionId, timestamp, patches: structuredClone(patches) }] };
}
export function materialize(fork: Microfork, revisionCount = fork.revisions.length): Record<string, unknown> {
  if (!Number.isInteger(revisionCount) || revisionCount < 0 || revisionCount > fork.revisions.length) throw new Error("Invalid revision");
  const result: Record<string, unknown> = {};
  for (const revision of fork.revisions.slice(0, revisionCount)) {
    for (const patch of revision.patches) { validatePatch(patch); result[patch.path] = structuredClone(patch.value); }
  }
  return result;
}
export function diff(a: Microfork, b: Microfork): Patch[] {
  const before = materialize(a), after = materialize(b);
  return Object.keys(after).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(path => ({ path, value: after[path] }));
}
export function merge(base: Microfork, incoming: Microfork): { patches: Patch[]; conflicts: string[] } {
  if (base.upstream.url !== incoming.upstream.url) throw new Error("Different upstream projects");
  const left = materialize(base), right = materialize(incoming);
  const conflicts = Object.keys(right).filter(key => key in left && JSON.stringify(left[key]) !== JSON.stringify(right[key]));
  return { patches: Object.keys(right).filter(key => !conflicts.includes(key) && !(key in left)).map(path => ({ path, value: right[path] })), conflicts };
}
export function exportMicrofork(fork: Microfork): string {
  fork.revisions.forEach(rev => rev.patches.forEach(validatePatch));
  return JSON.stringify(fork, null, 2);
}
export function importMicrofork(json: string): Microfork {
  if (json.length > 1024 * 1024) throw new Error("Microfork too large");
  const fork: Microfork = JSON.parse(json);
  if (fork.schemaVersion !== 1 || !fork.id || !fork.upstream?.url || !fork.upstream?.ref || !Array.isArray(fork.revisions)) throw new Error("Invalid microfork");
  fork.revisions.forEach(rev => { if (!Array.isArray(rev.patches)) throw new Error("Invalid revision"); rev.patches.forEach(validatePatch); });
  return fork;
}
