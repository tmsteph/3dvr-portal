import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const scriptPath = new URL('../scripts/env/check.mjs', import.meta.url);
const scriptFile = fileURLToPath(scriptPath);

test('env checker passes when the required keys exist', () => {
  const dir = mkdtempSync(join(tmpdir(), '3dvr-env-'));
  const envFile = join(dir, '.env.local');

  writeFileSync(
    envFile,
    [
      'PORTAL_ORIGIN=https://portal.3dvr.tech',
      'STRIPE_SECRET_KEY=sk_test_123',
      'STRIPE_WEBHOOK_SECRET=whsec_123',
      'GMAIL_USER=test@example.com',
      'GMAIL_APP_PASSWORD=app-password',
      ''
    ].join('\n'),
    'utf8'
  );

  const output = execFileSync(process.execPath, [scriptFile, '--file', envFile], {
    encoding: 'utf8'
  });

  assert.match(output, /Env check passed/);
});

test('env checker fails when required keys are missing', () => {
  const dir = mkdtempSync(join(tmpdir(), '3dvr-env-'));
  const envFile = join(dir, '.env.local');

  writeFileSync(envFile, 'PORTAL_ORIGIN=https://portal.3dvr.tech\n', 'utf8');

  assert.throws(
    () => execFileSync(process.execPath, [scriptFile, '--file', envFile], {
      encoding: 'utf8'
    }),
    (error) => {
      assert.match(
        String(error?.stderr || error?.stdout || error?.message || ''),
        /Missing required env vars/
      );
      return true;
    }
  );
});
