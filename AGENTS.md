# AGENTS Guidelines

## Scope
These instructions apply to the entire repository.

## General Workflow
- Keep the existing folder structure unless there is a compelling reason to reorganize it.
- When you add new third-party dependencies, document why they are needed and ensure they are added to `package.json`.
- Prefer small, focused commits with clear messages.

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

## CSS
- Reuse existing variables and utility classes when available before introducing new styles.
- Group related selectors together and add comments when a rule needs extra context.

## Testing & Verification
- This project does not have automated tests; manually verify the relevant pages or features you touch.
- If you modify any server-side code under `api/`, start the development server with `npm run dev` to ensure it boots without errors.
