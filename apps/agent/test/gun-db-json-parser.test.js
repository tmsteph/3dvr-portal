const test = require('node:test');
const assert = require('node:assert/strict');

const { installSafeGunJsonParser } = require('../thomas-agent/node/gun-json-compat');

test('Gun SEA JSON parser rejects punctuation-heavy plain text without crashing', () => {
  const previous = JSON.parseAsync;
  installSafeGunJsonParser();

  try {
    const text = 'Read-only health probe. Reply with exactly: 3DVR WORKER OK. Do not modify files, send messages, or perform external side effects.';
    let callbackError = null;

    assert.doesNotThrow(() => {
      JSON.parseAsync(text, (error) => {
        callbackError = error;
      });
    });

    assert.ok(callbackError instanceof SyntaxError);
  } finally {
    JSON.parseAsync = previous;
  }
});

test('Gun SEA JSON parser preserves valid JSON values', () => {
  const previous = JSON.parseAsync;
  installSafeGunJsonParser();

  try {
    let parsed;
    let callbackError;
    JSON.parseAsync('{"message":"ok","count":2}', (error, value) => {
      callbackError = error;
      parsed = value;
    });
    assert.equal(callbackError, undefined);
    assert.deepEqual(parsed, { message: 'ok', count: 2 });
  } finally {
    JSON.parseAsync = previous;
  }
});
