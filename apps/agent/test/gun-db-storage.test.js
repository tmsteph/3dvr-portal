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

test('real Gun package does not persist local RAD files with disk disabled', () => {
  // A mocked constructor cannot detect a regression in Gun's actual disk
  // behavior. Keep this synthetic write isolated from the worker's live RAD.
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-gun-disk-off-'));
  try {
    const script = [
      "const createGun = require(process.argv[1]);",
      "const client = createGun({ peers: [], rad: false, radisk: false, file: false, multicast: false });",
      "client.get('synthetic-disk-check').get('value').put('safe');",
      "setTimeout(() => process.exit(0), 800);",
    ].join('\n');
    const child = spawnSync(process.execPath, ['-e', script, require.resolve('gun')], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(child.status, 0, child.stderr || 'Gun synthetic write failed');

    // Gun may create an empty radata directory even with disk disabled;
    // the safety property is that no persistent files are written.
    const writtenFiles = [];
    const visit = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(fullPath);
        else writtenFiles.push(path.relative(directory, fullPath));
      }
    };
    visit(directory);
    assert.deepEqual(writtenFiles, [], 'disk-off Gun must not write local files');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
