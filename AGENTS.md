# AGENTS Guidelines

## Scope
These instructions apply to the entire repository.

## GunDB & Data Direction
- Treat GunJS as the primary database. New features must read and write through shared Gun nodes rather than relying on ephemeral, device-local storage.
- When caching locally, always ensure the Gun node is the source of truth and that queued changes flush back to the node.
- Prefer referencing node paths (e.g., `gun.get('namespace').get('resource')`) explicitly so that data remains portable between browsers and sessions.
- Document any structural changes to the Gun graph directly in code comments near the relevant node interactions.

## General Workflow
- Keep the existing folder structure unless there is a compelling reason to reorganize it.
- When you add new third-party dependencies, document why they are needed and ensure they are added to `package.json`.
- Prefer small, focused commits with clear messages.
- Prioritize human-readable code and documentation that balances simplicity and clarity.

## Formatting
- Use two spaces for indentation in HTML, CSS, JavaScript, and JSON files.
- Keep lines under 120 characters where practical.
- End every file with a single trailing newline.

## HTML & Accessibility
- Use semantic HTML elements where possible.
- Provide descriptive `alt` text for images and `aria` attributes when they improve accessibility.
- Ensure interactive elements are keyboard accessible.

## JavaScript
- Prefer `const` and `let` over `var`.
- Avoid introducing unused variables or functions.
- Keep functions small and focused; extract helpers when logic grows complex.
- When coordinating with GunJS, centralize shared logic so that tests can exercise node selection and identity handling without a browser.

## CSS
- Reuse existing variables and utility classes when available before introducing new styles.
- Group related selectors together and add comments when a rule needs extra context.

## Design & UX
- Ensure every design scales gracefully on desktop, laptop, phone, VR headsets, and other devices, with special care for extra narrow and extra wide screens.
- Favor layouts and interactions that are ergonomically comfortable for both body and mind.
- Strive for interfaces that are intuitive, calming, and visually harmonious.

## Testing & Verification
- Prefer automated tests for new logic, especially around Gun node selection, identity management, and sync flows.
- If you modify any server-side code under `api/`, start the development server with `npm run dev` to ensure it boots without errors.
- Capture test coverage or add new checks whenever you touch core flows so we continuously prevent regressions in score, identity, and contact management features.
- Perform and document manual UI/UX and functional walkthroughs for any changes that impact the customer experience, including VR and touch interactions.
