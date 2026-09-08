# Visual Capture Harness

Visual behavior is part of the product. A page can pass DOM assertions while an animation flickers, a 3D scene fails to render, or gameplay timing feels wrong.

Use the visual capture harness to create one portable evidence bundle that humans and multimodal AI can inspect.

## Quick start

```sh
npm run visual:capture -- --url /noteverse/ --duration 8s --interval 400ms
```

It also accepts public or preview URLs:

```sh
npm run visual:capture -- --url https://portal.3dvr.tech/noteverse/ --duration 10s
```

Useful options:

- `--width 390 --height 844` for mobile.
- `--browser firefox` for another rendering engine.
- `--name flight-controls` for a readable artifact folder.
- `--output /tmp/capture` for a fixed output path.
- `--root /path/to/worktree` to capture another checkout without reinstalling Playwright.
- `--seed 1337` to make procedural `Math.random()` content deterministic for comparisons.
- `--no-video` for ordinary UI screenshots when timing is not important.
- `--full-page` with `--no-video` for long document-style pages.
## Output

Each run writes `.tmp/visual-captures/<timestamp>-<name>/` with:

- `capture.webm` — continuous motion evidence.
- `frames/*.png` — exact requested timestamps extracted after recording.
- `manifest.json` — URL, viewport, timings, browser, console events, page errors, and rAF timing.
- `index.html` — a lightweight human review page with video and frame timeline.

Video is the default for animation and 3D because taking live screenshots can stall WebGL. Frames are extracted from the completed recording so the screenshot process does not change the animation being measured.

## AI review checklist

Give the capture folder to a multimodal reviewer and ask it to inspect frames chronologically plus the video. Look for missing or late objects, blank frames, flicker, pop-in, layout shifts, camera/input discontinuities, animation jumps, unreadable overlays, and console/page errors.

The `rafFpsDuringCapture` field is a diagnostic signal, not a hardware benchmark. Headless Chromium may use software WebGL; use a real GPU browser session when judging production frame rate.

## Before/after regression

`npm run visual:regression` captures the configured scenarios from two worktrees, compares matching frames with pixel diffs, preserves both videos, and writes a combined summary. Scenarios live in `visual-regression.config.json`.

```sh
npm run visual:regression -- --baseline-root /tmp/base --candidate-root .
```

For pull requests that touch visual/3D routes, `.github/workflows/visual-regression.yml` automatically compares the PR against its base commit, uploads the evidence, and posts or updates one PR comment. If `OPENAI_API_KEY` is available, the most changed frame pairs and their diff images are sent to the configured multimodal reviewer (default `gpt-5.6-luna`) for a concise PASS/WARN/FAIL critique. Without a key, pixel evidence and reports still run normally.

Pixel percentage alone is not a merge gate: animation can legitimately move. The AI/human review should judge whether the candidate remains coherent and intentional. Only put a route in the automatic config after same-code captures are stable; fast free-running gameplay should stay capture-only until its clock/input playback is deterministic.
