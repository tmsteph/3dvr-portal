import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('self-host serves OAuth provider routes natively before legacy proxy', async () => {
  const server = await readFile(new URL('../scripts/self-host-server.mjs', import.meta.url), 'utf8');
  assert.match(server, /createOAuthProviderHandler/);
  assert.match(server, /url\.pathname\.startsWith\('\/api\/oauth\/'\)/);
  assert.match(server, /runOAuthProvider/);
  assert.ok(server.indexOf("url.pathname.startsWith('/api/oauth/')") < server.indexOf("url.pathname.startsWith('/api/')"));
});


test('self-host permits only trusted portal origins to call secrets broker cross-origin', async () => {
  const server = await readFile(new URL('../scripts/self-host-server.mjs', import.meta.url), 'utf8');
  assert.match(server, /SECRETS_BROKER_ALLOWED_ORIGINS/);
  assert.match(server, /Access-Control-Allow-Origin/);
  assert.match(server, /pathname !== '\/api\/secrets-broker'/);
  assert.match(server, /req\.method !== 'OPTIONS'/);
});
