# 3DVR Worlds publishing API — integration checklist

This is **not yet wired into the live portal**. The module in `scripts/worlds/worlds-api.mjs` exposes `createWorldsHandler({directory, authenticate})` for the portal's existing Node server.

## Routes
- `GET /api/worlds/:slug` — published world publicly, private draft to its owner only
- `PUT /api/worlds/:slug` — authenticated creator creates or updates their own world with `{scene, published:boolean}`
- `DELETE /api/worlds/:slug` — authenticated creator unpublishes their world (does not erase data)

The scene matches the JSON exported by `/worlds/builder/` (version 1; box/tree/tower).

## Before enabling production
1. Mount the handler in the actual OVH portal Node server under `/api/worlds/`. The static builder does **not** call it yet.
2. Supply `authenticate(req)` from the portal's **verified server-side session**; return a stable user ID or null. Never trust user IDs in request JSON.
3. Enforce CSRF for cookie-authenticated mutations, rate limiting, content-length limits at the HTTP edge, and HTTPS.
4. Set `directory` to a persistent, writable directory outside release trees; provision backups, permissions and quota limits.
5. Add per-creator limits, slug reservation/concurrency controls, atomic creation semantics, and a deletion/retention policy. Current file-based write behavior can race on simultaneous first creates; do not expose it publicly before addressing this.
6. Add integration tests for unauthorized draft access, conflicting owner edits, publish/unpublish, malformed scenes, and concurrent writes.
7. Wire the builder's Save/Publish UI to these routes and add a public read-only viewer at `/worlds/:slug`.
8. Verify via browser and mobile smoke tests on staging before production deploy.

This is a **backend foundation**, not a claim of working hosted worlds. No production secrets or server changes are included.
