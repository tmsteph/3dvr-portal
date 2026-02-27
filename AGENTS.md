# AGENTS Guidelines

## Mission
Keep this portal human-readable and maintainable. Favor clear intent over AI chatter and make every change easy for teammates to follow.

## Process (Scrum & DRY)
- Work iteratively in small, testable increments with concise commits and clear context.
- Prefer reuse over reinvention: extract shared helpers and styles instead of duplicating logic.
- Document decisions inline so future contributors understand why a choice was made.

## Data Layer (GunJS)
- Treat GunJS as the source of truth. Read and write through shared Gun nodes, not device-local storage.
- When caching, always sync back to the originating Gun node and describe node shapes near the related code.
- Use explicit node paths (e.g., `gun.get('namespace').get('resource')`) to keep data portable across sessions.

## Design & UX
- Build mobile-first layouts that adapt gracefully to all screen sizes, including ultra-wide and VR displays.
- Use semantic HTML, accessible labels, and keyboard-friendly interactions.
- Favor calm, intuitive experiences with ergonomic spacing and clear visual hierarchy.

## Formatting
- Use two spaces for indentation in HTML, CSS, JavaScript, and JSON.
- Keep lines under 120 characters where practical and end files with a trailing newline.

## JavaScript
- Prefer `const` and `let`; avoid unused variables and keep functions focused.
- Centralize GunJS coordination logic so it can be exercised by tests without a browser.

## CSS
- Reuse existing variables and utilities before adding new rules.
- Group related selectors together and comment when context is non-obvious.

## Testing & Verification
- Add or update automated tests for new logic, especially around Gun node selection, identity, and sync flows.
- If server code under `api/` changes, start the dev server (`npm run dev`) to confirm it boots cleanly.
- Document manual walkthroughs for UX-impacting changes, including cache clears and cross-browser GunJS resilience.

## Playwright On Termux
- Do not run Playwright browser tests directly in native Termux with `node --test` because browsers are unsupported there.
- On Android/Termux, always use the proot wrapper scripts so tests run inside Debian:
  - `npm run playwright:e2e`
  - `npm run playwright:smoke`
  - `npm run playwright:verify`
- If proot is missing, install it with `pkg install proot-distro` then `proot-distro install debian`.
- If you need a specific script, route it through `scripts/playwright/run-in-linux.sh <npm-script-name>`.
