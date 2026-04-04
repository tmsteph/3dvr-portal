# AGENTS Guidelines

## Mission
Keep this portal human-readable and maintainable. Favor clear intent over AI chatter and make every change easy for teammates to follow.

## Portable Personal Context
- This repo carries a mirrored copy of Thomas Stephens' markdown control plane in `ops/control-plane/home/`.
- On devices where the full `~/` control plane is missing or different, read the mirrored files there before making broad assumptions.
- Treat the mirrored files as portable context, but prefer the live `~/` files when both are present.

## Focus Rule
- Default to work that helps win or serve a paying customer.
- Keep this operating rule visible in planning, commits, and reviews: `Sell first. Build second. Keep it simple.`
- Avoid expanding billing, portal, or platform scope unless the change supports a real user flow, active delivery, or a clear revenue path.

## Git Workflow
- Do not make substantive changes directly on `main`. Create a branch first.
- Open a pull request for changes that should be merged, deployed, or remembered. Use the PR as the record of intent and tradeoffs.
- Keep PRs tightly scoped and note any Stripe mode, portal-origin, or account-linking impact in the description.
- When `3dvr-portal` depends on `3dvr-web`, link the paired branch or PR so preview environments stay coordinated.

## Deployment Topology
- Keep `3dvr-portal` and `3dvr-web` on the same branch matrix:
  - `main` -> `portal.3dvr.tech` and `3dvr.tech`
  - `staging` -> `portal-staging.3dvr.tech` and `staging.3dvr.tech`
  - `feature/*` -> Vercel preview URLs
- Portal billing environments must stay mode-consistent:
  - `main`: live `STRIPE_SECRET_KEY`, live `STRIPE_PRICE_STARTER_ID`, live `STRIPE_PRICE_PRO_ID`, live `STRIPE_PRICE_BUILDER_ID` when available, `PORTAL_ORIGIN=https://portal.3dvr.tech`
  - `staging`: live Stripe key and live price IDs, `PORTAL_ORIGIN=https://portal-staging.3dvr.tech`, keep the deployment behind Vercel auth
  - `feature/*`: Stripe test key plus matching Stripe test price IDs, preview `PORTAL_ORIGIN`
- Never mix a Stripe test key with live `price_...` IDs, or a live Stripe key with test `price_...` IDs.
- Existing live-subscriber verification must happen on `staging` or `main`. Feature previews are for test-mode checkout and switch flows.
- After a new `staging` deploy, refresh the custom staging domains from this repo with `npm run vercel:alias-staging`.
- Treat `401` from `https://portal-staging.3dvr.tech` or `https://staging.3dvr.tech` as expected when Vercel auth is enabled. Treat `404 DEPLOYMENT_NOT_FOUND` as broken staging routing.
- When 3dvr-web and 3dvr-portal preview branches need to work together, prefer an explicit `portalOrigin` pairing over hard-coded production fallbacks.

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
- Use `3dvr.tech@gmail.com` as the canonical 3DVR contact email in CTAs, support copy, and public-facing docs.
- There is no separate public `@3dvr.tech` mailbox set up right now.
- Do not introduce `hello@3dvr.tech`.

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

## Debian `proot` On Android
- When Linux-only tooling is flaky or unsupported in native Termux, switch early to Debian `proot` instead of fighting the Android environment.
- Standard setup:
  - `pkg install proot-distro`
  - `proot-distro install debian`
  - `proot-distro login debian`
- Prefer the repo wrappers when they exist instead of inventing one-off Debian commands.
- Typical triggers for Debian `proot` in this repo:
  - Playwright or browser automation
  - Linux-native CLI dependencies that fail under Termux
  - Toolchains that expect a standard glibc userland

## Playwright On Termux
- Do not run Playwright browser tests directly in native Termux with `node --test` because browsers are unsupported there.
- On Android/Termux, always use the proot wrapper scripts so tests run inside Debian:
  - `npm run playwright:e2e`
  - `npm run playwright:smoke`
  - `npm run playwright:verify`
- These commands already route through `scripts/playwright/run-in-linux.sh`, which logs into Debian `proot` for you.
- If proot is missing, install it with `pkg install proot-distro` then `proot-distro install debian`.
- If you need a specific script, route it through `scripts/playwright/run-in-linux.sh <npm-script-name>`.
