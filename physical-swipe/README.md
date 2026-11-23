# Physical Swipe

Experimental one-finger typing on ordinary physical laptop keys. Tracked in [#3417](https://github.com/tmsteph/3dvr-portal/issues/3417). Open `/physical-swipe/` through the portal or `npm run dev`.

Click the practice pad, glide over physical letter keys, press Space to decode, then Enter or a candidate button to accept. Escape cancels. Backspace removes a key. Focus outside the pad stops capture. Ordinary typing elsewhere is unaffected. US QWERTY physical positions are assumed, including when the operating system uses another layout.

The decoder aligns discrete key trails against interpolated word paths on a staggered QWERTY layout. It compares a sequence baseline, geometry, and a timing variant using dwell and inter-key intervals. Costs are heuristic, not confidence probabilities. The hand-curated starter vocabulary in `words.js` is authored for this repository under its GPL-3.0 license. Vocabulary coverage, repeated-letter ambiguity, browser shortcuts, missed/overlapping key presses, and hardware rollover limit recognition.

Data stays in tab memory. Save attempt explicitly attaches a target label; Download attempts exports raw events, normalized traces, labels, vocabulary coverage, latency, and all three decoder results. Clearing/reloading discards the session. There are no external scripts, analytics, network inference, accounts, or global listeners. The eye-rest laptop shortcut discussed alongside this feature is separate and is not installed by this page.

## Validation

Run `node --test tests/physical-swipe.test.js`. Tests cover event timing, autorepeat vs repeated letters, path geometry, synthetic recognition, bounded inputs, and timing sensitivity. Synthetic success is not evidence of real-world accuracy.

Manual walkthrough: test in Brave on Debian GNOME/Wayland; swipe `hello`, Space, Enter; click a different candidate; edit output normally; cancel a trail; move focus away while a key is held; type in the target field without altering the trail; save a label; compare modes; download and inspect JSON; clear the session. Check keyboard-only focus and a narrow viewport. No cache/service-worker changes are needed; refresh if browser-cached files are stale.

Before promoting beyond an experiment, collect at least 30 intended words with multiple real attempts; separate calibration from held-out evaluation; measure top-1/top-3 accuracy, correction effort, effective WPM, latency, and comfort against ordinary one-handed typing. Current UI metrics are descriptive practice results only. No system-wide GNOME input method is implemented yet.
