/* Local-only, event-driven play. No timers, storage, requests or VM boot. */
(function (root) {
  'use strict';
  const path = [4, 0, 8, 2, 6];
  function initialState() { return { score: 0, complete: false }; }
  function target(state) { return state.complete ? -1 : path[state.score]; }
  function select(state, tile) {
    if (state.complete || tile !== target(state)) return state;
    const score = state.score + 1;
    return { score, complete: score === path.length };
  }
  if (typeof module !== 'undefined') module.exports = { initialState, target, select };
  if (!root.document) return;
  const grid = root.document.getElementById('spark-grid');
  if (!grid) return;
  const status = root.document.getElementById('spark-status');
  let state = initialState();
  const tiles = Array.from({ length: 9 }, (_, index) => {
    const tile = root.document.createElement('button');
    tile.type = 'button';
    tile.className = 'spark-tile';
    tile.addEventListener('click', () => {
      const next = select(state, index);
      if (next === state) return;
      state = next;
      render();
    });
    grid.appendChild(tile);
    return tile;
  });
  function render() {
    tiles.forEach((tile, index) => {
      const lit = index === target(state);
      tile.dataset.lit = String(lit);
      tile.textContent = state.complete ? '✿' : lit ? '✦' : '·';
      tile.setAttribute('aria-label', `Tile ${index + 1}${lit ? ', glowing star' : state.complete ? ', flower' : ', resting'}`);
    });
    status.textContent = state.complete
      ? 'Your garden is blooming! Five sparks collected. Play again or open Terminal.'
      : `${state.score} of 5 sparks collected. Find the glowing star.`;
  }
  root.document.getElementById('spark-restart').addEventListener('click', () => {
    state = initialState();
    render();
    tiles[target(state)].focus();
  });
  render();
})(globalThis);
