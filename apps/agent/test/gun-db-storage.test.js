const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('remote agent Gun client does not initialize local RAD disk persistence', () => {
  const source = fs.readFileSync(path.join(__dirname, '../thomas-agent/node/gun-db.js'), 'utf8');
  const initializations = [];
  const node = { get() { return this; } };
  const moduleStub = { exports: {} };
  const relay = 'https://relay.example.test/gun';

  vm.runInNewContext(source, {
    module: moduleStub,
    process: { env: { THREEDVR_GUN_RELAY: relay } },
    require(id) {
      if (id === 'gun') {
        return options => {
          initializations.push(options);
          return node;
        };
      }
      if (id === './gun-json-compat') {
        return { installSafeGunJsonParser() {} };
      }
      throw new Error(`Unexpected dependency: ${id}`);
    }
  }, { filename: 'gun-db.js' });

  assert.equal(initializations.length, 1);
  assert.equal(initializations[0].peers[0], relay);
  for (const option of ['rad', 'radisk', 'file']) {
    assert.equal(initializations[0][option], false, `${option} must be disabled`);
  }
  assert.equal(typeof moduleStub.exports.portalAgentOpsNode, 'function');
  assert.equal(moduleStub.exports.portalAgentOpsNode(), node);
});
