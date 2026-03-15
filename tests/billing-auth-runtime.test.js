import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const authModuleUrl = pathToFileURL(resolve(projectRoot, 'src/billing/auth.js')).href;
const seaModuleUrl = pathToFileURL(resolve(projectRoot, 'node_modules/gun/sea.js')).href;

describe('billing auth runtime bootstrap', () => {
  it('installs webcrypto on self before Gun SEA verify runs', async () => {
    const script = `
      globalThis.self = { crypto: {} };
      try { delete globalThis.window; } catch (error) {}
      try { delete globalThis.crypto; } catch (error) {}

      const { verifyBillingAuthPayload, BILLING_AUTH_SCOPE } = await import(${JSON.stringify(authModuleUrl)});
      const { default: SEA } = await import(${JSON.stringify(seaModuleUrl)});
      const pair = await SEA.pair();
      const authProof = await SEA.sign({
        scope: BILLING_AUTH_SCOPE,
        action: 'status',
        alias: 'tester@3dvr',
        pub: pair.pub,
        origin: 'https://portal.example.test',
        iat: Date.now()
      }, pair);

      const result = await verifyBillingAuthPayload({
        authPub: pair.pub,
        authProof
      }, {
        expectedOrigin: 'https://portal.example.test'
      });

      console.log(JSON.stringify({
        ok: result.ok,
        reason: result.reason || '',
        globalImportKey: typeof globalThis.crypto?.subtle?.importKey,
        selfImportKey: typeof globalThis.self?.crypto?.subtle?.importKey
      }));
    `;

    const { stdout, stderr } = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: projectRoot
    });

    assert.equal(stderr, '');

    const outputLine = stdout.trim().split('\n').filter(Boolean).pop();
    assert.ok(outputLine, 'expected child process JSON output');

    const output = JSON.parse(outputLine);
    assert.equal(output.ok, true);
    assert.equal(output.reason, '');
    assert.equal(output.globalImportKey, 'function');
    assert.equal(output.selfImportKey, 'function');
  });
});
