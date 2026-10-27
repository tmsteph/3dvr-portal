# Little Fish

The original Portal game lives at `/little-fish/`. Quiet ocean extends that same
canvas, fish, audio toggle, and mobile controls; it is not a separate app or fork.

Choose **Quiet ocean**, follow the fish's optional comfortable breathing rhythm,
then advance through noticing, returning, and a gentle finish. **My mind wandered**
(or tapping the water / pressing Space while the canvas has focus) welcomes you
back. There is no countdown, score, breath holding, or penalty. Play modes remain
available throughout. Leaving the browser tab pauses the guide.

## Verification

Run `node --test tests/little-fish.e2e.test.js` for original play and the meditation
journey at phone, laptop, and phone landscape sizes, including reduced motion and
pause/resume. Capture the breathing timeline with:

```sh
npm run visual:capture -- --url /little-fish/ --duration 10s --interval 2s \
  --width 390 --height 844 --deterministic --tick 40ms \
  --replay tests/fixtures/little-fish-quiet-replay.json
```

Manual walkthrough: reload `/little-fish/`; choose Quiet ocean; watch an inhale
and exhale; pause/continue; tap My mind wandered; advance through each step; then
switch to feeding and bubbles. Repeat with reduced motion and in landscape.
No account, storage migration, or cache clearing is required.
