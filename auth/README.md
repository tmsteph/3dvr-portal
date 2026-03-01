# Auth Surfaces

Canonical auth entrypoints are grouped here for discoverability:

- `/auth/` -> auth hub page
- `/auth/sign-in.html` -> sign-in route (redirects to `/sign-in.html`)
- `/auth/recovery.html` -> account recovery route (redirects to `/password-reset.html`)

Current implementation keeps the legacy root pages for backward compatibility while
we progressively migrate links and assets.
