import assert from 'node:assert/strict';

function parseAtMs(value) {
  if (typeof value === 'number') {
    assert(Number.isFinite(value) && value >= 0, 'Replay event time must be non-negative');
    return Math.round(value);
  }
  const match = String(value ?? '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(ms|s)?$/);
  assert(match, `Replay event time must look like 250ms, 1.5s, or 1500: ${value}`);
  const multiplier = match[2] === 's' ? 1000 : 1;
  return Math.round(Number.parseFloat(match[1]) * multiplier);
}

export function normalizeReplayEvents(value) {
  const rawEvents = Array.isArray(value) ? value : value?.events;
  if (!rawEvents) return [];
  assert(Array.isArray(rawEvents), 'Replay data must be an array or { events: [] }');
  return rawEvents.map((event, index) => ({
    ...event,
    atMs: parseAtMs(event.atMs ?? event.at ?? 0),
    order: index,
  })).sort((left, right) => left.atMs - right.atMs || left.order - right.order);
}
export async function installDeterministicRuntime(context, options = {}) {
  const seed = Number.isInteger(options.seed) ? options.seed : null;
  const deterministic = options.deterministic === true;
  if (seed === null && !deterministic) return;

  await context.addInitScript(({ seedValue, deterministicClock }) => {
    if (Number.isInteger(seedValue)) {
      let randomState = seedValue >>> 0;
      Math.random = () => {
        randomState = (randomState * 1664525 + 1013904223) >>> 0;
        return randomState / 4294967296;
      };
    }

    if (!deterministicClock) return;
    let now = 0;
    let nextFrameId = 1;
    const frames = new Map();
    const fixedEpoch = 1700000000000;
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => now,
    });
    Date.now = () => fixedEpoch + Math.floor(now);
    window.requestAnimationFrame = callback => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = id => frames.delete(id);

    window.__visualTestClock = {
      now: () => now,
      pendingFrames: () => frames.size,
      step(deltaMs) {
        now += Math.max(0, Number(deltaMs) || 0);
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach(callback => callback(now));
        return { now, callbacks: pending.length, pending: frames.size };
      },
    };
  }, { seedValue: seed, deterministicClock: deterministic });
}
async function dispatchReplayAction(page, action) {
  await page.evaluate((event) => {
    if (event.type === 'keydown' || event.type === 'keyup') {
      window.dispatchEvent(new KeyboardEvent(event.type, {
        bubbles: true,
        cancelable: true,
        code: event.code || '',
        key: event.key || '',
        repeat: false,
      }));
      return;
    }
    if (event.type === 'click') {
      const target = document.querySelector(event.selector || '');
      if (!target) throw new Error(`Replay selector not found: ${event.selector}`);
      target.click();
      return;
    }
    throw new Error(`Unsupported replay event type: ${event.type}`);
  }, action);
}
async function dispatchDueEvents(page, state, events) {
  while (state.eventIndex < events.length && events[state.eventIndex].atMs <= state.currentMs) {
    await dispatchReplayAction(page, events[state.eventIndex]);
    state.eventIndex += 1;
  }
}

export async function initializeDeterministicTimeline(page, events = []) {
  const state = { currentMs: 0, eventIndex: 0 };
  await dispatchDueEvents(page, state, events);
  await page.evaluate(() => {
    if (!window.__visualTestClock) throw new Error('Deterministic visual clock was not installed');
    window.__visualTestClock.step(0);
  });
  return state;
}

export async function advanceDeterministicTimeline(page, state, targetMs, tickMs, events = []) {
  assert(targetMs >= state.currentMs, 'Deterministic timeline cannot run backwards');
  while (state.currentMs < targetMs) {
    const nextEventAt = events[state.eventIndex]?.atMs ?? Number.POSITIVE_INFINITY;
    const nextMs = Math.min(targetMs, state.currentMs + tickMs, nextEventAt);
    if (nextMs > state.currentMs) {
      await page.evaluate(deltaMs => window.__visualTestClock.step(deltaMs), nextMs - state.currentMs);
      state.currentMs = nextMs;
    }
    await dispatchDueEvents(page, state, events);
  }
  return state;
}
