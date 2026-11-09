# Portal structure

How this repo is laid out, and the rule for changing the layout.
Set down 2026-11-08, from Thomas's direction. Batch plan: issue #3628.

## The principle: directories are URLs

- A folder is a place. Its path is its URL. `helm/` is served at
  `/helm/`, `tasks` should live at `/tasks/`, and so on.
- Plain files you can read, honest folder names, one room per thing.
- As simple as possible. This is how the internet works and how the
  `tmsteph` repo is built; the portal follows the same model.
- The filesystem is the map. There is no router pretending the files
  live somewhere else, and we do not do framework-style consolidation
  or re-orgs that break addresses people already use.

## The graduation rule

A real page starts life as a single file if that is all it needs.
When a page is a real place people visit, it graduates into its own
directory:

- `chat.html` becomes `chat/index.html`, served at `/chat/`.
- Its own css, scripts, and assets then live beside it in the room
  instead of shedding loose files into the root.
- Every graduation ships with a redirect from the old `.html`
  address to the new directory address, verified after deploy.
  No existing link ever breaks.
- One batch at a time, each batch its own pull request, tests
  compared against the main baseline before and after.

Folders that already hold a single `index.html` are already rooms.
They are fine as they are.

## Exceptions that stay at the root

- `index.html` — the front door.
- Shared scripts and assets that every room uses, for now:
  `auth-identity.js`, `navbar.js`, `gun-init.js`, `oauth.js`,
  `pwa-install.js`, `service-worker.js`, `score.js`,
  `portal-swirl-logo.js`, `spinner-direction.js`,
  `home-operator.js`, `issue-launcher.js`, `account-recovery.js`,
  plus the shared `style.css` / `index-style.css`.
  Shared furniture stays in the hallway until there is a reason
  of its own to move it, with redirects if it ever moves.

## Cruft rule

Only actual cruft gets removed: stale test pages, and machine
artifacts that leaked into the repo, such as the root `node_modules`
symlink that pointed at one server's absolute path (removed with
the change that added this file; `node_modules/` was already in
`.gitignore`).
