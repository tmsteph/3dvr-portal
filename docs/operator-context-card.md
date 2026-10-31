# Operator Context Card

Open **Context Card** from Operator. This is a manual copy/paste bridge, not a ChatGPT integration. It never reads external chat history or synchronizes automatically.

1. Expand **Create a card**. Write a concise project/task, goal, decisions, facts, links, and source. Fields start blank; no conversation, identity, or secret is included automatically.
2. Choose **Preview new card**. Review/edit the Markdown, including its last-updated date, and remove private information. Confirm the review checkbox. Editing the preview clears confirmation.
3. Choose **Copy reviewed text**, then paste into your chosen external chat app. Copying does not save. If clipboard permission fails, select and copy the preview manually.
4. Save the reviewed card if you want to keep it locally. The saved timestamp is shown separately from the editable card's source date. Only one card is kept per browser/device; this is not account memory, encrypted storage, or model context. Shared-device users should avoid private information. Clearing site storage removes the card.
5. Paste a returned summary into the Context Card page in Operator and choose **Propose addition**. The saved card stays visible above the editable proposal. The summary is appended as unverified prose, preserving existing facts. Edit decisions/facts explicitly if needed, and update the card's date/source as appropriate.
6. Confirm review and **Save reviewed card**, or **Discard proposal**. No save happens on paste, preview, copy, or discard. A change saved in another tab blocks stale saves; copy your proposal before reloading.

## Verification

Run `node --test tests/operator-context-card.test.js tests/operator-client-syntax.test.js tests/operator-public-modules.test.js`.

Manual walkthrough for a local preview: open `/operator/`, follow Context Card, create a card at a narrow mobile width, and navigate all fields/buttons with the keyboard. Preview, edit, confirm, copy to a separate text editor, and save. Reload to verify restoration. Paste a returned summary and verify old content remains visible and unchanged until explicit save. Discard a second proposal. In another tab save a change and confirm the original tab refuses to overwrite it. Test clipboard denial and unavailable storage. Clear site storage to verify a blank start. This feature does not use Gun; existing account/history sync is unchanged. Repeat the copy workflow in the mobile browsers used for the external chat app.
