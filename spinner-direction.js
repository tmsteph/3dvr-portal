// Pure direction-classification helpers for spinner gestures.
//
// The homepage spinner is a play-only toy: this module is intentionally
// not wired to the DOM anywhere, and playing with the spinner never opens
// a menu or navigates. The helpers remain for the operator context import
// and unit tests.

const DEFAULT_SELECT_DISTANCE = 44;
const DEFAULT_MENU_DISTANCE = 18;
const DEFAULT_HOLD_TO_ACTIVATE_MS = 650;
const DEFAULT_STRONG_FLICK_DISTANCE = 150;
const DEFAULT_STRONG_FLICK_MAX_MS = 190;
const DEFAULT_STRONG_FLICK_SPEED = 0.9;
const SPINNER_PLAYGROUND_INTERACTIONS_REQUIRED = 6;
const SPINNER_PLAYGROUND_WINDOW_MS = 9000;
const SPINNER_PLAYGROUND_ROUTE = '/spinner/';
const SQRT_THREE_OVER_TWO = Math.sqrt(3) / 2;
const SPINNER_DIRECTION_VECTORS = Object.freeze([
  ['day', 0, -1],
  ['work', SQRT_THREE_OVER_TWO, -0.5],
  ['build', SQRT_THREE_OVER_TWO, 0.5],
  ['games', 0, 1],
  ['apps', -SQRT_THREE_OVER_TWO, -0.5],
  ['leads', -SQRT_THREE_OVER_TWO, 0.5]
]);

export function selectSpinnerDirection(dx, dy, minimumDistance = DEFAULT_SELECT_DISTANCE) {
  const distance = Math.hypot(dx, dy);
  if (distance < minimumDistance) return '';

  const unitX = dx / distance;
  const unitY = dy / distance;
  let selected = '';
  let bestScore = -Infinity;

  for (const [name, x, y] of SPINNER_DIRECTION_VECTORS) {
    const score = (unitX * x) + (unitY * y);
    if (score > bestScore) {
      bestScore = score;
      selected = name;
    }
  }

  return selected;
}

export function classifySpinnerRelease({
  dx = 0,
  dy = 0,
  durationMs = 0,
  selectionHeldMs = 0,
  cancelled = false
} = {}, {
  menuDistance = DEFAULT_MENU_DISTANCE,
  selectDistance = DEFAULT_SELECT_DISTANCE,
  holdToActivateMs = DEFAULT_HOLD_TO_ACTIVATE_MS,
  strongFlickDistance = DEFAULT_STRONG_FLICK_DISTANCE,
  strongFlickMaxMs = DEFAULT_STRONG_FLICK_MAX_MS,
  strongFlickSpeed = DEFAULT_STRONG_FLICK_SPEED
} = {}) {
  const distance = Math.hypot(dx, dy);
  const selection = cancelled ? '' : selectSpinnerDirection(dx, dy, selectDistance);
  const speed = distance / Math.max(1, durationMs);

  if (cancelled || distance < menuDistance) {
    return { action: 'none', selection: '', reason: cancelled ? 'cancelled' : 'tiny', distance, speed };
  }

  if (!selection) {
    return { action: 'menu', selection: '', reason: 'spin', distance, speed };
  }

  if (selectionHeldMs >= holdToActivateMs) {
    return { action: 'activate', selection, reason: 'hold', distance, speed };
  }

  if (
    distance >= strongFlickDistance
    && durationMs <= strongFlickMaxMs
    && speed >= strongFlickSpeed
  ) {
    return { action: 'activate', selection, reason: 'flick', distance, speed };
  }

  return { action: 'menu', selection, reason: 'spin', distance, speed };
}
