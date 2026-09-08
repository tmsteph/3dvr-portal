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

## Next layer

The manifest format is intentionally simple so CI or an agent can later compare two runs, score visual differences, retain failure artifacts, or require an AI review before merging animation/gameplay changes.
