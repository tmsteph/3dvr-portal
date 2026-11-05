# Personal Microforks — initial implementation

Issue #3148. Provider-neutral, local-first core for versioned personal customizations.

The module exposes `createMicrofork`, `commit`, `materialize` (including rollback by revision count), `diff`, `merge`, `exportMicrofork`, and `importMicrofork`.

## Example
```ts
const mine = commit(createMicrofork("alice", "https://example.org/project.git", "main"), [{path:"theme.mode", value:"dark"}], "rev-1");
const exported = exportMicrofork(mine);
const restored = importMicrofork(exported);
const previous = materialize(restored, 0);
```

## Boundaries
No automatic publishing, network calls, credential handling, or existing-profile migration. Merge reports conflicts rather than silently overwriting. The allowlist is a first-pass safeguard, **not** a comprehensive sensitive-data scanner: users must review exports before sharing. Future work: UI, tests, three-way merge, persistent storage, authenticated sync, signed revisions and upstream proposals.
