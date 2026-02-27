import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInstallArgs,
  isTermuxRuntime,
  parseBrowserTargets,
  shouldInstallWithDeps
} from '../scripts/playwright/install-runtime.mjs';

describe('playwright runtime installer helpers', () => {
  it('parses browser targets with fallback defaults', () => {
    assert.deepEqual(parseBrowserTargets(''), ['chromium', 'firefox']);
    assert.deepEqual(parseBrowserTargets('chromium firefox chromium'), ['chromium', 'firefox']);
    assert.deepEqual(parseBrowserTargets('webkit'), ['webkit']);
  });

  it('detects native termux/android environments', () => {
    assert.equal(isTermuxRuntime({}, 'android'), true);
    assert.equal(isTermuxRuntime({ TERMUX_VERSION: '0.118.1' }, 'linux'), true);
    assert.equal(isTermuxRuntime({ PREFIX: '/data/data/com.termux/files/usr' }, 'linux'), true);
    assert.equal(isTermuxRuntime({}, 'linux'), false);
  });

  it('chooses --with-deps behavior based on platform and env flags', () => {
    assert.equal(shouldInstallWithDeps({}, 'linux'), true);
    assert.equal(shouldInstallWithDeps({}, 'darwin'), false);
    assert.equal(shouldInstallWithDeps({}, 'linux', false), false);
    assert.equal(shouldInstallWithDeps({ PLAYWRIGHT_INSTALL_DEPS: 'false' }, 'linux'), false);
    assert.equal(shouldInstallWithDeps({ PLAYWRIGHT_INSTALL_DEPS: '1' }, 'darwin'), true);
  });

  it('builds install args with optional dependency install', () => {
    assert.deepEqual(
      buildInstallArgs({ browsers: ['chromium', 'firefox'], withDeps: true }),
      ['playwright', 'install', '--with-deps', 'chromium', 'firefox']
    );
    assert.deepEqual(
      buildInstallArgs({ browsers: ['chromium'], withDeps: false }),
      ['playwright', 'install', 'chromium']
    );
  });
});
