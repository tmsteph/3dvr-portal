import { KEYS, ROWS, Trail, rankWords } from './decoder.js';
import { WORDS } from './words.js';

const $ = id => document.getElementById(id);
const pad = $('pad');
let trail = new Trail();
let pending = null;
let predictions = [];
let samples = [];

function draw() {
  const svg = $('keyboard');
  svg.replaceChildren();
  const visited = new Set(trail.keys.map(k => k.key));
  const node = (tag, attributes, text) => {
    const item = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => item.setAttribute(key, value));
    if (text) item.textContent = text;
    svg.append(item);
  };
  for (const row of ROWS) for (const key of row) {
    const { x, y } = KEYS[key];
    node('rect', { x: x * 42 + 2, y: y * 46 + 2, width: 38, height: 40, rx: 7, class: visited.has(key) ? 'visited' : '' });
    node('text', { x: x * 42 + 21, y: y * 46 + 22 }, key.toUpperCase());
  }
  node('polyline', { points: trail.keys.map(k => `${KEYS[k.key].x * 42 + 21},${KEYS[k.key].y * 46 + 22}`).join(' ') });
  $('trail').textContent = trail.keys.map(k => k.key).join('') || (document.activeElement === pad ? 'Glide a word, then Space' : 'Click here to start');
}

function showPredictions() {
  $('candidates').replaceChildren();
  predictions.forEach(({ word }, index) => {
    const button = document.createElement('button');
    button.textContent = word;
    button.setAttribute('aria-label', `Accept prediction ${index + 1}: ${word}`);
    button.addEventListener('click', () => accept(word));
    $('candidates').append(button);
  });
}

function decode() {
  if (!trail.keys.length) return;
  const keys = trail.finish(performance.now());
  const start = performance.now();
  predictions = rankWords(keys, WORDS, $('mode').value);
  const elapsed = performance.now() - start;
  pending = { keys, events: structuredClone(trail.events), mode: $('mode').value, latencyMs: elapsed };
  $('save').disabled = false;
  showPredictions();
  $('status').textContent = `Predicted in ${elapsed.toFixed(0)} ms · ${WORDS.length} starter words. Enter accepts the first; click another to choose.`;
}

function accept(word) {
  const output = $('output');
  output.value += (output.value && !/\s$/.test(output.value) ? ' ' : '') + word;
  predictions = [];
  showPredictions();
  trail = new Trail();
  pad.focus();
  draw();
}

pad.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (['Space', 'Enter', 'Escape', 'Backspace'].includes(event.code) || /^Key[A-Z]$/.test(event.code)) event.preventDefault();
  if (event.repeat && ['Space', 'Enter'].includes(event.code)) return;
  if (event.code === 'Space') decode();
  else if (event.code === 'Enter' && predictions.length) accept(predictions[0].word);
  else if (event.code === 'Escape') {
    trail = new Trail(); pending = null; predictions = [];
    $('save').disabled = true; showPredictions();
    $('status').textContent = 'Trail canceled. Ready for another word.';
  } else if (event.code === 'Backspace') {
    trail.finish(performance.now());
    trail.keys.pop();
    pending = null; predictions = []; $('save').disabled = true; showPredictions();
  } else if (/^Key[A-Z]$/.test(event.code)) {
    if (pending) {
      trail = new Trail(); pending = null; predictions = [];
      $('save').disabled = true; showPredictions();
    }
    trail.record('keydown', event, performance.now());
  }
  draw();
});
pad.addEventListener('keyup', event => trail.record('keyup', event, performance.now()));
pad.addEventListener('focus', () => { $('capture-status').textContent = 'Listening here only · QWERTY physical keys'; draw(); });
pad.addEventListener('blur', () => {
  trail.finish(performance.now());
  $('capture-status').textContent = 'Keyboard capture is off';
});
$('mode').addEventListener('change', () => { if (pending) { predictions = rankWords(pending.keys, WORDS, $('mode').value); showPredictions(); } });

function results() {
  return ['sequence', 'geometry', 'timing'].map(mode => {
    let top1 = 0, top3 = 0, elapsed = 0;
    for (const sample of samples) {
      const start = performance.now();
      const ranked = rankWords(sample.keys, WORDS, mode);
      elapsed += performance.now() - start;
      if (ranked[0]?.word === sample.target) top1++;
      if (ranked.some(r => r.word === sample.target)) top3++;
    }
    return { mode, attempts: samples.length, top1, top3, averageDecodeMs: samples.length ? elapsed / samples.length : 0 };
  });
}

$('save').addEventListener('click', () => {
  const target = $('target').value.trim().toLowerCase();
  if (!pending || !/^[a-z]{1,30}$/.test(target)) {
    $('metrics').textContent = 'Enter the intended word using letters a–z.';
    return;
  }
  if (samples.length >= 200) { $('metrics').textContent = 'Session full (200 attempts). Download before clearing.'; return; }
  samples.push({ ...structuredClone(pending), target, inVocabulary: WORDS.includes(target) });
  pending = null;
  trail = new Trail(); predictions = []; showPredictions(); draw();
  $('save').disabled = true; $('export').disabled = false;
  const report = results();
  $('metrics').textContent = `${samples.length} attempts. Top-1 / top-3: ` + report.map(r => `${r.mode} ${r.top1}/${r.attempts} · ${r.top3}/${r.attempts}`).join('; ') + '. Descriptive practice results, not held-out accuracy.';
  $('target').value = '';
});
$('export').addEventListener('click', () => {
  const data = { schema: '3dvr-physical-swipe-v1', layout: 'US QWERTY', vocabularySize: WORDS.length, samples, comparisons: results(), note: 'Practice data; no calibration or held-out validation yet. Includes raw key events and relative browser timestamps.' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'physical-swipe-attempts.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('clear').addEventListener('click', () => {
  trail = new Trail(); pending = null; predictions = []; samples = [];
  $('output').value = ''; $('target').value = '';
  $('save').disabled = true; $('export').disabled = true;
  $('metrics').textContent = 'No labeled attempts yet.';
  $('status').textContent = 'Session cleared.';
  showPredictions(); draw();
});
draw();
