'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkAgentCredentialStore } = require('./work-agent-credential-store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-cred-'));
const file = path.join(dir, 'credentials.json');
const key = crypto.randomBytes(32).toString('base64');
const store = new WorkAgentCredentialStore({ file, key });

store.put({ tenantId: 'a', provider: 'google', subject: 'same-sub', refreshToken: 'secret-a', email: 'a@example.test', scopes: ['calendar.readonly'] });
store.put({ tenantId: 'b', provider: 'google', subject: 'same-sub', refreshToken: 'secret-b', email: 'b@example.test' });
assert.equal(store.getRefreshToken({ tenantId: 'a', provider: 'google', subject: 'same-sub' }), 'secret-a');
assert.equal(store.getRefreshToken({ tenantId: 'b', provider: 'google', subject: 'same-sub' }), 'secret-b');

const disk = fs.readFileSync(file, 'utf8');
assert(!disk.includes('secret-a'));
assert(!disk.includes('secret-b'));
const status = store.status({ tenantId: 'a', provider: 'google', subject: 'same-sub' });
assert(!('secret' in status));
assert(!('refreshToken' in status));

store.revoke({ tenantId: 'a', provider: 'google', subject: 'same-sub' });
assert.equal(store.getRefreshToken({ tenantId: 'a', provider: 'google', subject: 'same-sub' }), null);
assert.equal(store.status({ tenantId: 'a', provider: 'google', subject: 'same-sub' }).status, 'revoked');

assert.throws(() => new WorkAgentCredentialStore({ file: path.join(dir, 'bad'), key: '' }), /required/);
assert.throws(() => new WorkAgentCredentialStore({ file, key: crypto.randomBytes(32).toString('base64') }).getRefreshToken({ tenantId: 'b', provider: 'google', subject: 'same-sub' }));

fs.rmSync(dir, { recursive: true, force: true });
console.log('work-agent credential store tests passed');
