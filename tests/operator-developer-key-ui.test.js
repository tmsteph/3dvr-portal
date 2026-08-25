import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getStoredDeveloperKey } from '../operator/developer-key-ui.js';
import { developerIdentityMatches, seaPairCanSign } from '../operator/forge.js';

function storage(values = {}) {
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    }
  };
}

test('developer key UI only exposes the signed-in account public key', () => {
  assert.equal(getStoredDeveloperKey(storage({ signedIn: 'false', userPubKey: 'pub-1' })), '');
  assert.equal(getStoredDeveloperKey(storage({ signedIn: 'true', userPubKey: '  pub-1  ' })), 'pub-1');
});

test('Operator developer proof can restore the existing Portal password session safely', async () => {
  const forge = await readFile(new URL('../operator/forge.js', import.meta.url), 'utf8');

  assert.match(forge, /storage\.getItem\('alias'\)/);
  assert.match(forge, /globalThis\.localStorage\?\.getItem\?\.\('password'\)/);
  assert.match(forge, /storage\.getItem\('userPubKey'\)/);
  assert.match(forge, /user\.auth\(stored\.alias, stored\.password/);
  assert.match(forge, /stored\.expectedPub && stored\.expectedPub !== actualPub/);
  assert.match(forge, /const sea = await ensurePortalSea\(context\.user\)/);
});

test('Operator cryptographically verifies a recalled SEA keypair before signing', async () => {
  const originalGun = globalThis.Gun;
  globalThis.Gun = {
    SEA: {
      async sign(challenge, sea) {
        return { challenge, marker: sea.marker };
      },
      async verify(signed, pub) {
        return signed.marker === 'good' && pub === 'current-pub' ? signed.challenge : null;
      }
    }
  };
  try {
    assert.equal(await seaPairCanSign({ pub: 'current-pub', marker: 'good' }, 'current-pub'), true);
    assert.equal(await seaPairCanSign({ pub: 'current-pub', marker: 'stale-private-key' }, 'current-pub'), false);
  } finally {
    globalThis.Gun = originalGun;
  }
});

test('Operator refuses a stale recalled SEA identity before signing a developer proof', async () => {
  assert.equal(developerIdentityMatches({
    expectedAlias: 'tmsteph@3dvr',
    expectedPub: 'current-pub',
    actualAlias: 'other@3dvr',
    actualPub: 'stale-pub'
  }), false);

  assert.equal(developerIdentityMatches({
    expectedAlias: 'tmsteph@3dvr',
    expectedPub: 'current-pub',
    actualAlias: 'tmsteph@3dvr',
    actualPub: 'current-pub'
  }), true);

  const forge = await readFile(new URL('../operator/forge.js', import.meta.url), 'utf8');
  assert.match(forge, /const stored = readStoredPortalIdentity\(\)/);
  assert.match(forge, /developerIdentityMatches\(\{/);
  assert.match(forge, /seaPairCanSign\(recalled, actualPub\)/);
  assert.match(forge, /user\?\.leave\?\.\(\)/);
});

test('a downgraded code suggestion offers the signed-in developer key for approval', async () => {
  const actions = await readFile(new URL('../operator/actions.js', import.meta.url), 'utf8');

  assert.match(actions, /revealDeveloperKeyButton/);
  assert.match(actions, /const outcome = await saveCodeSuggestion\(action\)/);
  assert.match(actions, /revealDeveloperKeyButton\(\)/);
});

test('developer key copy reads the refreshed button key instead of a stale closure', async () => {
  const ui = await readFile(new URL('../operator/developer-key-ui.js', import.meta.url), 'utf8');

  assert.match(ui, /button\.dataset\.operatorDeveloperKey = pub/);
  assert.match(ui, /const currentPub = String\(button\.dataset\.operatorDeveloperKey \|\| getStoredDeveloperKey\(storage\)/);
  assert.match(ui, /writeText\(currentPub\)/);
  assert.doesNotMatch(ui, /writeText\(pub\)/);
});
