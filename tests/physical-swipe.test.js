import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, wordPath, Trail, rankWords } from '../physical-swipe/decoder.js';
import { WORDS } from '../physical-swipe/words.js';

const events = keys => [...keys].map((key, i) => ({ key, down: i * 40, up: i * 40 + 25 }));

test('physical key events preserve timing, ignore autorepeat, and retain deliberate repeated letters', () => {
  const trail = new Trail();
  trail.record('keydown', { code: 'KeyL', key: 'l' }, 10);
  trail.record('keydown', { code: 'KeyL', key: 'l', repeat: true }, 20);
  trail.record('keyup', { code: 'KeyL', key: 'l' }, 30);
  trail.record('keydown', { code: 'KeyL', key: 'l' }, 40);
  assert.deepEqual(trail.finish(70), [{ key: 'l', down: 10, up: 30 }, { key: 'l', down: 40, up: 70 }]);
  assert.equal(trail.events.length, 4);
  assert.equal(trail.held.size, 0);
});

test('geometry includes crossed intermediate keys and preserves endpoints', () => {
  assert.deepEqual(wordPath('qt'), [...'qwert']);
  for (const word of ['hello', 'garden', 'work']) {
    const path = wordPath(word);
    assert.equal(path[0], word[0]);
    assert.equal(path.at(-1), word.at(-1));
    assert.ok(path.every(k => KEYS[k]));
  }
});

test('known synthetic straight swipe ranks its intended word above alternatives', () => {
  assert.equal(rankWords(events('qwert'), ['cat', 'qt', 'run'], 'geometry')[0].word, 'qt');
  assert.equal(rankWords(events('hello'), ['hello', 'help', 'world'], 'sequence')[0].word, 'hello');
  for (const word of ['hello', 'garden', 'work']) {
    assert.ok(rankWords(events(wordPath(word)), WORDS, 'geometry').some(r => r.word === word), word);
  }
});

test('empty, invalid, and long trails are bounded and produce finite scores', () => {
  assert.deepEqual(rankWords([], WORDS), []);
  assert.deepEqual(rankWords([{ key: '!', down: 0 }], WORDS), []);
  const ranked = rankWords(events('hello'.repeat(50)), WORDS);
  assert.equal(ranked.length, 3);
  assert.ok(ranked.every(r => Number.isFinite(r.score)));
});

test('timing changes the cost without inventing probabilities', () => {
  const input = events('qwert');
  input[2].up += 400;
  const plain = rankWords(input, ['cat', 'qt', 'run'], 'geometry');
  const timed = rankWords(input, ['cat', 'qt', 'run'], 'timing');
  assert.notDeepEqual(plain, timed);
  assert.ok(timed.every(r => r.score >= 0));
});
