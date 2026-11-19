const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const game = require('../3dvr-os/spark-garden.js');
test('five distinct sparks finish, wrong/repeated clicks do not advance', () => {
  let state = game.initialState();
  assert.strictEqual(game.select(state, 99), state);
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    const target = game.target(state);
    assert.ok(!seen.has(target)); seen.add(target);
    state = game.select(state, target);
    assert.equal(state.score, i + 1);
    assert.strictEqual(game.select(state, target), state);
  }
  assert.equal(state.complete, true);
  assert.equal(game.target(state), -1);
  assert.deepEqual(game.initialState(), { score: 0, complete: false });
});
test('DOM interaction, restart focus and completion preserve usable controls', () => {
  const element = () => ({ dataset: {}, children: [], events: {}, setAttribute(k,v) { this[k]=v; }, addEventListener(k,v) { this.events[k]=v; }, appendChild(v) { this.children.push(v); }, focus() { this.focused=true; } });
  const ids = Object.fromEntries(['spark-grid','spark-status','spark-restart'].map(id=>[id,element()]));
  vm.runInNewContext(fs.readFileSync('3dvr-os/spark-garden.js','utf8'), { document: {getElementById:id=>ids[id],createElement:element} });
  const tiles=ids['spark-grid'].children;
  assert.equal(tiles.length,9);
  for(let i=0;i<5;i++) tiles.find(tile=>tile.dataset.lit==='true').events.click();
  assert.match(ids['spark-status'].textContent,/blooming/);
  ids['spark-restart'].events.click();
  assert.match(ids['spark-status'].textContent,/0 of 5/);
  assert.equal(tiles[4].focused,true);
});
test('startup opens game, Terminal stays one click and focuses its input', () => {
  const html=fs.readFileSync('3dvr-os/index.html','utf8');
  assert.match(html,/\}\);openApp\('sparks'\);/);
  assert.match(html,/data-open="terminal">Open Terminal/);
  assert.match(html,/if\(name==='terminal'\)setTimeout\(\(\)=>\$\('#terminal-input'\)\.focus\(\),0\)/);
  assert.ok(!html.includes("});openApp('terminal');"));
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
