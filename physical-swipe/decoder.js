// Experimental, local-only QWERTY trail decoder. Scores are costs, not probabilities.
export const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
export const KEYS = Object.fromEntries(ROWS.flatMap((row, y) => [...row].map((key, x) =>
  [key, { x: x + [0, 0.25, 0.75][y], y }])));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function wordPath(word) {
  const path = [];
  for (const letter of word) {
    if (!KEYS[letter]) return [];
    if (!path.length) { path.push(letter); continue; }
    const start = KEYS[path.at(-1)];
    const end = KEYS[letter];
    const steps = Math.max(1, Math.ceil(distance(start, end) * 6));
    for (let i = 1; i <= steps; i++) {
      const point = { x: start.x + (end.x - start.x) * i / steps, y: start.y + (end.y - start.y) * i / steps };
      const nearest = Object.keys(KEYS).reduce((a, b) => distance(KEYS[a], point) < distance(KEYS[b], point) ? a : b);
      if (nearest !== path.at(-1)) path.push(nearest);
    }
  }
  return path;
}

function alignment(observed, expected, timed) {
  let prev = Array.from({ length: expected.length + 1 }, (_, i) => i * 0.6);
  const durations = observed.map(k => Math.max(0, (k.up ?? k.down) - k.down));
  const median = [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)] || 1;
  observed.forEach((event, i) => {
    // Dwell and a pause before a key are hypotheses to evaluate, not established intent signals.
    const pause = i ? Math.max(0, event.down - observed[i - 1].down) : 0;
    const weight = timed ? 1 + Math.min(1, durations[i] / median / 3 + pause / 600) : 1;
    const next = [prev[0] + 0.6 * weight];
    expected.forEach((letter, j) => {
      const substitution = Math.min(2, distance(KEYS[event.key], KEYS[letter]));
      next.push(Math.min(prev[j] + substitution * weight, prev[j + 1] + 0.6 * weight, next[j] + 0.6));
    });
    prev = next;
  });
  return prev.at(-1) / Math.max(observed.length, expected.length, 1);
}

export function rankWords(events, words, mode = 'timing') {
  const observed = events.filter(e => KEYS[e.key] && Number.isFinite(e.down)).slice(0, 120);
  if (!observed.length) return [];
  return [...new Set(words)].filter(word => /^[a-z]+$/.test(word)).map(word => {
    const expected = mode === 'sequence' ? [...word] : wordPath(word);
    const endpointCost = distance(KEYS[observed[0].key], KEYS[word[0]])
      + distance(KEYS[observed.at(-1).key], KEYS[word.at(-1)]);
    const score = alignment(observed, expected, mode === 'timing') + endpointCost * 0.65;
    return { word, score };
  }).sort((a, b) => a.score - b.score || a.word.localeCompare(b.word)).slice(0, 3);
}

export class Trail {
  constructor() { this.events = []; this.keys = []; this.held = new Map(); }
  record(type, event, time) {
    const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : '';
    if (!KEYS[key] || !Number.isFinite(time)) return;
    if (this.events.length < 2000) this.events.push({ type, code: event.code, key: event.key, time, repeat: !!event.repeat });
    if (type === 'keydown' && !event.repeat && !this.held.has(event.code) && this.keys.length < 120) {
      const item = { key, down: time, up: null };
      this.keys.push(item);
      this.held.set(event.code, item);
    } else if (type === 'keyup' && this.held.has(event.code)) {
      this.held.get(event.code).up = time;
      this.held.delete(event.code);
    }
  }
  finish(time) {
    for (const item of this.held.values()) item.up = time;
    this.held.clear();
    return this.keys.map(item => ({ ...item }));
  }
}
