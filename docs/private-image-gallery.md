# Private image gallery — implementation contract

Issue: #3273

## Privacy first
- Default access is owner-only, including thumbnails, metadata, original bytes and APIs.
- Never place imported artwork in the public Git repository or public static assets.
- Authenticate and authorize on every media request; disable shared caches and indexing.
- Do not assume ChatGPT Library is accessible from a remote server. The interactive Files connector supports listing and reading in authorized sessions, but unattended server-side sync needs a separately verified integration.
- Keep Library originals intact; import by copy, checksum and provenance.

## Import pipeline
1. Enumerate Library images with pagination and persistent cursors.
2. Classify generated artwork vs personal photos/screenshots; uncertain images go to review, never automatically publish.
3. Copy approved images into private server storage with content-hash deduplication.
4. Save title, source reference, import timestamp, prompt when available, collections, tags, favorite flag and variant relationships.
5. Generate thumbnails in private storage; expose only through authenticated routes.
6. Record checkpoints, retries, errors and resumable progress through Operator jobs.

## User experience
- Responsive masonry gallery, lightbox, search, collections and favorites.
- Default collections: Linen, Beach, Pool, VR, Portraits, Unsorted.
- Private Portal navigation first; tmsteph.com route only after auth and access review.
- Provide manual/assisted import if unattended Library API access is unavailable.

## Release gates
- Deny unauthenticated image, thumbnail and metadata requests.
- Verify no public image URLs or sensitive content in source control.
- Confirm duplicate imports are idempotent and originals are unchanged.
- Mobile smoke tests and staged owner sign-off before production.
