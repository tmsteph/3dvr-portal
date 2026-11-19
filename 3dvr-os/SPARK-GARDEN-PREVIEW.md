# Spark Garden: review-only 3DVR OS increment

Source: `tmsteph/3dvr-portal`, current `3dvr-os/index.html` fetched November 19, 2026 through GitHub. This is a source fixture, not the full repository. The live domain is an older deployment; nothing was deployed or merged.

Open `3dvr-os/index.html` in a browser. Spark Garden starts immediately; tap the glowing tile five times. There is no countdown, animation loop, network, account, sound, persistence or VM requirement. Keyboard users can Tab/Enter; Restart focuses the first target. Open Terminal on the game or dock, which focuses the existing input. Play on the dock reopens the game without restarting it. Linux still boots only by explicit existing controls.

Tests: `node --test tests/spark-garden.test.cjs`; `node --check 3dvr-os/spark-garden.js`. Covers wrong/repeated input, completion, restart/focus, DOM rendering, startup target, existing Terminal focus handler and inline script syntax. Not a full repository or browser/visual pass. Repo visual capture/regression harness is not available in this fixture. Existing desktop/window, file and Linux behavior is intentionally unchanged.

Manual review: desktop and narrow viewport; keyboard play, restart, close/reopen; Terminal one-click focus/type help; no VM download on startup; existing Files/Editor; explicit Linux only if desired. Inspect real browser screenshot before production.

## Window manager follow-up

Desktop chrome is non-selectable; application body selection remains native, with cross-application selection clamped to its originating body. Titlebars may move partially offscreen, retaining a reachable grip; viewport resize and reopen recover geometry. Visible Tile left/right, Maximize, and Restore controls share the same path as Meta+arrow shortcuts. Host GNOME/browser can intercept Meta first, so buttons are the deterministic fallback. On narrow screens the existing full-window CSS remains authoritative. No Ctrl+Alt shortcut overrides were added. Test Terminal output copy, editor text selection, drag-to-desktop, reverse selection, keyboard focus, repeated tile/maximize/restore, resize and reopen in a real browser before release. Automated geometry checks are not visual/browser validation.

Local Chromium regression was attempted but never launched: sandbox `socket() failed: Operation not permitted`. No browser pass or screenshots are claimed. `tests/window-manager-browser.py` preserves the intended check for a supported environment (update its preview path as appropriate).
