# Selected context handoff

Operator's “Share selected context with ChatGPT” panel accepts a manually selected
text excerpt from a conversation or user-provided export. It does not connect to
ChatGPT, discover history, parse full archives, or request account permissions.
The portable v1 text includes direction, user-supplied source attribution, and a
reference-only scope. Source attribution is unverified; imported text does not
grant tool permissions. Keep original authors, conversation titles, dates, and
source URLs in the source field where useful.

Choose ChatGPT → Operator to append the preview to the existing unsent composer.
Review and edit the draft before sending. Sending uses Operator's existing model,
history, memory, and account-sync behavior; this is not a private storage override.
Choose Operator → ChatGPT to download only the excerpt you pasted into the panel.
Review that file and manually paste or attach it in ChatGPT. Nothing returns there
automatically. The panel uses no storage or network calls; closing/reloading the
page discards its fields. Downloads and copies added to the draft remain until
removed separately. Other same-origin scripts and browser extensions are outside
this panel's privacy boundary.

## Manual walkthrough for a browser preview

1. Open `/operator/` on desktop and mobile; expand the sharing panel using the
   keyboard or touch. No cache clear is required; reload to fetch changed assets.
2. Paste a short excerpt and enter its source. Check the preview, including literal
   HTML characters, and confirm no message is sent or history imported.
3. Start with an existing composer draft. Add the excerpt and confirm both remain
   editable and unsent. Send only if you intend normal Operator processing/sync.
4. Change direction; verify only download is enabled. Download, inspect the text,
   and confirm it contains only the supplied excerpt and attribution.
5. Clear the panel and reload; confirm panel fields are empty. Existing composer
   copies and downloaded files must be removed separately.
6. Repeat in another browser. This panel does not depend on Gun or sync; verify it
   can prepare a draft with relays unavailable. Normal sending may require a
   connection. No browser walkthrough has been run as part of the focused Node checks.
