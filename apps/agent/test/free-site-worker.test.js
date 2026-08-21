const test = require('node:test');
const assert = require('node:assert/strict');
const { topicFromRequest, slugify } = require('../thomas-agent/node/free-site-worker');

test('standard free-site subject resolves to requested name', () => {
  assert.equal(topicFromRequest('Free 3DVR website request — Test', 'Please build it.'), 'Test');
  assert.equal(slugify(topicFromRequest('Free 3DVR website request — Test', 'Please build it.')), 'test');
});

test('duplicated MIME body does not duplicate the topic slug', () => {
  const topic = topicFromRequest('Make me a website', 'A website about cats A website about cats');
  assert.equal(topic, 'cats');
  assert.equal(slugify(topic), 'cats');
});

test('natural language topic remains supported', () => {
  const topic = topicFromRequest('Website', "I'd like a free website please about potatoes.");
  assert.equal(topic, 'potatoes');
});
